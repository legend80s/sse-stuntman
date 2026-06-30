/**
 * @file HTTP 服务器。
 *
 * 使用 Node.js 内置 http 模块启动服务器，零外部依赖。
 * 提供 POST /v1/chat/completions 端点模拟 OpenAI 流式输出。
 *
 * 场景目录优先级：
 *   1. --scenarios-dir CLI 参数
 *   2. ~/.sse-stuntman/scenarios/（用户全局目录）
 *   3. 内置 src/scenarios/（fallback）
 */
/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: <explanation> */

import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getUserScenariosDir } from "./commands/create-scenario.mjs"
import { writeErrorResponse, writeOpenAIStream } from "./openai-stream.mjs"
import {
  listScenarios,
  parseScenarioFile,
  splitContent,
} from "./scenario-parser.mjs"
import { color } from "./utils/color.mjs"
import {
  writeAnthropicErrorStream,
  writeAnthropicNonStreamingResponse,
  writeAnthropicStream,
} from "./utils/providers/anthropic/stream.mjs"
import { extractUserPrompt, logEnd, logStart } from "./utils/request-logger.mjs"
import { calculateTokens } from "./utils/token.mjs"

/**
 * @import { Scenario, UserMessage } from './types.ts'
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BUILTIN_DIR = path.join(__dirname, "scenarios")

/** @type {Map<string, Scenario>} */
const scenarioCache = new Map()

/**
 * 构建有序的场景目录列表（优先级从高到低）。
 *
 * @param {import('./types.ts').CliOptions} options
 * @returns {string[]}
 */
function getScenarioDirs(options) {
  const dirs = []

  // 1. CLI 显式指定
  if (options.scenariosDir) {
    dirs.push(path.resolve(options.scenariosDir))
  }

  // 2. 用户全局目录 ~/.sse-stuntman/scenarios/
  const userDir = getUserScenariosDir()
  if (fs.existsSync(userDir)) {
    dirs.push(userDir)
  }

  // 3. 内置目录（始终存在）
  dirs.push(BUILTIN_DIR)

  return dirs
}

/**
 * 启动服务器。
 *
 * @param {import('./types.ts').CliOptions} options
 */
export function startServer(options) {
  const scenarioDirs = getScenarioDirs(options)

  // 预加载场景
  preloadScenarios(scenarioDirs, options)

  const endpointPaths =
    options.endpointPaths ??
    (options.provider === "anthropic"
      ? ["/v1/messages"]
      : ["/v1/chat/completions"])

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res)

    if (req.method === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`)
    const pathname = url.pathname

    if (req.method === "GET" && pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }))
      return
    }

    if (
      req.method === "GET" &&
      (pathname === "/" || pathname === "/index.html")
    ) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(getIndexHtml(options, scenarioDirs))
      return
    }

    if (req.method === "POST" && endpointPaths.includes(pathname)) {
      let body = ""
      try {
        for await (const chunk of req) {
          body += chunk
        }
      } catch {
        /* ignore */
      }

      let requestModel = null
      let stream = true
      let inputTokens = 0
      /** @type {Array<UserMessage>} */
      let parsedMessages = []
      if (body) {
        try {
          const parsed = JSON.parse(body)
          requestModel = parsed.model ?? null
          stream = parsed.stream !== false
          parsedMessages = parsed.messages ?? []
          // 计算 input_tokens（用于 Anthropic 格式）
          const promptText = parsedMessages
            .map(extractUserPrompt)
            .filter(Boolean)
            .join("")
          inputTokens = calculateTokens(promptText)
        } catch {
          /* ignore */
        }
      }

      const scenarioName = url.searchParams.get("scenario") ?? options.scenario

      const { startTime, traceId } = logStart({
        method: req.method,
        pathname,
        scenario: scenarioName,
        parsedMessages,
        requestModel,
      })

      res.on("close", () => {
        logEnd({
          traceId,
          startTime,
          statusCode: res.statusCode,
        })
      })

      let scenario = loadScenario(
        scenarioName,
        scenarioDirs,
        options.defaultDelay,
        options.chunkStrategy,
      )

      if (!scenario) {
        const message = `Scenario "${scenarioName}" not found`

        console.error(color.red("ERR:"), message)

        res.writeHead(404, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            error: { message },
          }),
        )
        return
      }

      // 展开 @input 占位符：将最后一条用户消息内容插入到 input chunk 位置
      const hasInputChunks = scenario.chunks.some((c) => c.input)
      if (hasInputChunks) {
        const lastUserMsg = [...parsedMessages]
          .reverse()
          .find((m) => m.role === "user")
        const userContent = extractUserPrompt(lastUserMsg)
        const chunkStrategy = options.chunkStrategy ?? "word"

        const expanded = []
        for (const chunk of scenario.chunks) {
          if (chunk.input) {
            if (userContent) {
              const parts = splitContent(userContent, chunkStrategy)
              for (const part of parts) {
                expanded.push({ content: part, delay: chunk.delay ?? 5 })
              }
            }
            // userContent 为空时不插入任何内容
          } else {
            expanded.push(chunk)
          }
        }
        scenario = { ...scenario, chunks: expanded }
      }

      if (!stream) {
        const fullContent = scenario.chunks.map((c) => c.content).join("")
        if (options.provider === "anthropic") {
          writeAnthropicNonStreamingResponse(fullContent, res, {
            model: requestModel ?? options.model,
            inputTokens,
          })
        } else {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(
            JSON.stringify({
              id: `chatcmpl-${Date.now()}`,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model: requestModel ?? options.model,
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: fullContent },
                  finish_reason: "stop",
                },
              ],
            }),
          )
        }
        return
      }

      if (scenario.error) {
        if (options.provider === "anthropic") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          })
          writeAnthropicErrorStream(scenario.error, res)
        } else {
          writeErrorResponse(scenario.error, res)
        }
        return
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      })

      try {
        if (options.provider === "anthropic") {
          await writeAnthropicStream(scenario.chunks, res, {
            delayMultiplier: options.delayMultiplier,
            model: requestModel ?? options.model,
            inputTokens,
          })
        } else {
          await writeOpenAIStream(scenario.chunks, res, {
            delayMultiplier: options.delayMultiplier,
            model: requestModel ?? options.model,
          })
        }
      } catch {
        if (!res.destroyed) {
          res.end()
        }
      }
      return
    }

    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: { message: "Not Found" } }))
  })

  const shutdown = () => {
    server.close(() => {
      console.log("\nServer shut down.")
      process.exit(0)
    })
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  const port = options.port
  server.listen(port, () => {
    const baseDelay = options.defaultDelay ?? 5
    let effectiveDelay = ""
    if (options.delayMultiplier !== 1) {
      effectiveDelay = `Effective: ${options.delayMultiplier * baseDelay}ms`
    }

    const title = "🏍️  SSE Stuntman — server ready"
    const scenario = options.scenario
    const cached = scenarioCache.get(scenario)

    const info = {
      Server: [`http://localhost:${port}`, "SSE Live Demo. Click to try"],
      Provider: [options.provider],
      "Endpoint(s)": [`POST ${endpointPaths.join(", POST ")}`],

      Scenario: isFilePath(scenario)
        ? [scenario]
        : [scenario, cached?.description],

      Chunk: [options.chunkStrategy],

      Delay: [`${baseDelay}ms`, `used when scenario has no @delay`],
      "Delay Multiplier": [
        `${options.delayMultiplier}x`,
        `each @delay in scenario is multiplied by this`,
      ],
      "": [effectiveDelay],
    }

    const maxKeyLength =
      Math.max(...Object.keys(info).map((key) => key.length)) + 2

    const indent = " ".repeat(2)

    console.log(`\n  ${title}\n`)
    for (const [key, meta] of Object.entries(info)) {
      const [value, descRaw] = meta
      const desc = descRaw ? `  (${descRaw})` : ""
      const key1 = key ? `${key}:` : ""
      value &&
        console.log(
          `${indent}${(`${key1}`).padEnd(maxKeyLength)} ${colorize(value, "yellow")}${desc}`,
        )
    }
    console.log(`\n${indent}Press Ctrl+C to stop.\n`)

    //     console.log(`\n  ${title}`)

    //     console.log(`
    //   Server:    http://localhost:${port}
    //   Provider:  ${options.provider}
    //   Endpoint(s): POST ${endpointPaths.join(", POST ")}
    //   Scenario:  ${options.scenario}  (use ?scenario=name to switch)
    //   Chunk:     ${options.chunkStrategy ?? "word"}
    //   Delay:             ${baseDelay}ms  (used when scenario has no @delay)
    //   Delay Multiplier:  ${options.delayMultiplier}x  (each @delay in scenario is multiplied by this)
    //   ${effectiveDelay}

    //   Press Ctrl+C to stop.
    // `)
  })

  return server
}

/**
 * 判断场景名是否为文件路径（而非场景目录内的名称）。
 *
 * @param {string} name
 * @returns {boolean}
 */
function isFilePath(name) {
  return name.endsWith(".md") || name.includes("/") || name.includes("\\")
}

/**
 * 在多个目录中查找场景（优先级：先找到的为准）。
 * 如果 name 是文件路径，直接解析该文件（不缓存）。
 *
 * @param {string} name
 * @param {string[]} dirs
 * @param {number} [defaultDelay]
 * @returns {Scenario | null}
 */
function loadScenario(name, dirs, defaultDelay = 5, chunkStrategy = "word") {
  // 文件路径：直接解析，不缓存
  if (isFilePath(name)) {
    const filePath = path.resolve(name)
    try {
      if (fs.existsSync(filePath)) {
        return parseScenarioFile(filePath, {
          defaultDelay: defaultDelay ?? 5,
          chunkStrategy,
        })
      }
    } catch {
      return null
    }
    return null
  }

  // 场景名：走缓存 + 目录查找
  const cached = scenarioCache.get(name)
  if (cached) {
    return cached
  }

  for (const dir of dirs) {
    const filePath = path.join(dir, `${name}.md`)
    try {
      if (fs.existsSync(filePath)) {
        const scenario = parseScenarioFile(filePath, {
          defaultDelay: defaultDelay ?? 5,
          chunkStrategy,
        })
        scenarioCache.set(name, scenario)
        return scenario
      }
    } catch {
      // 跳过无法解析的场景
    }
  }

  return null
}

/**
 * 预加载所有目录的场景到缓存。
 * 同名场景：优先级高的目录覆盖优先级低的。
 *
 * @param {string[]} dirs
 * @param {import('./types.ts').CliOptions} options
 */
function preloadScenarios(dirs, options) {
  // 从低优先级到高优先级加载（高优先级覆盖低优先级）
  const reversed = [...dirs].reverse()
  for (const dir of reversed) {
    try {
      const scenarios = listScenarios(dir)
      for (const s of scenarios) {
        try {
          const scenario = parseScenarioFile(s.file, {
            defaultDelay: options.defaultDelay ?? 5,
            chunkStrategy: options.chunkStrategy ?? "word",
          })
          scenarioCache.set(s.name, scenario)
        } catch {
          // 跳过无法解析的场景
        }
      }
    } catch {
      // 目录不存在则跳过
    }
  }

  if (options.list) {
    // 从高优先级到低优先级去重展示
    const seen = new Set()
    console.log("\n  Available scenarios:\n")
    console.log(
      "  " + "Name".padEnd(25) + " " + "Source".padEnd(22) + " Description",
    )
    console.log(
      "  " +
        "".padEnd(25, "─") +
        " " +
        "".padEnd(22, "─") +
        " " +
        "".padEnd(30, "─"),
    )
    for (const dir of dirs) {
      try {
        const scenarios = listScenarios(dir)
        for (const s of scenarios) {
          if (seen.has(s.name)) {
            continue
          }
          seen.add(s.name)
          const cached = scenarioCache.get(s.name)
          const source = dir === BUILTIN_DIR ? "builtin" : "custom"
          if (cached?.error) {
            console.log(
              "  " +
                s.name.padEnd(25) +
                " " +
                source.padEnd(22) +
                " " +
                (cached.description ||
                  "Simulates HTTP " + cached.error.type + " error"),
            )
          } else {
            console.log(
              "  " +
                s.name.padEnd(25) +
                " " +
                source.padEnd(22) +
                " " +
                (cached?.description || ""),
            )
          }
        }
      } catch {
        /* skip */
      }
    }
    console.log()
    process.exit(0)
  }
}

/**
 * 设置 CORS 头。
 *
 * @param {import('node:http').ServerResponse} res
 */
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

/**
 * 生成主页 HTML。
 *
 * @param {import('./types.ts').CliOptions} options
 * @param {string[]} dirs
 * @returns {string}
 */

function getIndexHtml(options, dirs) {
  const seen = new Set()
  const scenarioOpts = []
  for (const dir of dirs) {
    try {
      const scenarios = listScenarios(dir)
      for (const s of scenarios) {
        if (seen.has(s.name)) {
          continue
        }
        seen.add(s.name)
        const cached = scenarioCache.get(s.name)
        const label = cached?.description
          ? `${s.name} — ${cached.description}`
          : s.name
        scenarioOpts.push(
          `<option value="${s.name}"${s.name === options.scenario ? " selected" : ""}>${label}</option>`,
        )
      }
    } catch {
      /* skip */
    }
  }

  const eps =
    options.endpointPaths ??
    (options.provider === "anthropic"
      ? ["/v1/messages"]
      : ["/v1/chat/completions"])
  const ep = eps[0]

  return renderHTML({
    port: options.port,
    // @ts-expect-error
    apiPath: ep,
    scenarioOpts,
    model: options.model,
  })
}

/**
 * @param {string} text
 * @param {{defaultColor: keyof color; linkColor: keyof color}} colorType
 * @return {string}
 */
function colorize(text, { defaultColor = "yellow", linkColor = "green" }) {
  if (text.startsWith("http://") || text.startsWith("https://")) {
    return color.underline(color[linkColor](text))
  }

  return color[defaultColor](text)
}

/**
 *
 * @param {{ port: number; apiPath: string; scenarioOpts: string[]; model: string}} param0
 * @returns
 */
function renderHTML({ port, apiPath, scenarioOpts, model }) {
  // 2. 读取整个 HTML 模板
  const template = fs.readFileSync(
    path.join(__dirname, "index.template.html"),
    "utf-8",
  )

  const scenarioOptsHTML = scenarioOpts.join(`\n${" ".repeat(6)}`)

  return template
    .replaceAll("${port}", String(port))
    .replaceAll("${apiPath}", apiPath)
    .replaceAll("${scenarioOptsHTML}", scenarioOptsHTML)
    .replaceAll("${model}", model)
}
