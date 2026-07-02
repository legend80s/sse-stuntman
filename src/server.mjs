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
import { DEFAULTS, scenarioCacheKey } from "./cli.mjs"
import { getUserScenariosDir } from "./commands/create-scenario.mjs"
import { writeErrorResponse, writeOpenAIStream } from "./openai-stream.mjs"
import {
  BUILTIN_DIR,
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
import { showLaunchScreen } from "./utils/server.mjs"
import { isFilePath, SPACE } from "./utils/string.mjs"
import { calculateTokens } from "./utils/token.mjs"

const { red, green } = color

/**
 * @import { Scenario, UserMessage, CliOptions } from './types.ts'
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {Map<string, Scenario>} */
const scenarioCache = new Map()

/**
 * 构建有序的场景目录列表（优先级从高到低）。
 *
 * @param {CliOptions} options
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
 * @param {CliOptions} options
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

      const reqProvider = url.searchParams.get("provider") ?? options.provider
      const reqChunkStrategy =
        /** @type {import('./types.ts').ChunkStrategy} */ (
          url.searchParams.get("chunk-strategy") ?? options.chunkStrategy
        )
      const reqDelayMultiplier = Number(
        url.searchParams.get("delay-multiplier") ?? options.delayMultiplier,
      )
      const reqDefaultDelay = Number(
        url.searchParams.get("default-delay") ?? options.defaultDelay,
      )

      const { startTime, traceId } = logStart({
        method: req.method,
        pathname: pathname + url.search,
        scenario: scenarioName,
        parsedMessages,
        requestModel,
      })

      // const resDestroyed = req.aborted
      // console.log("1 req.aborted:", req.aborted)
      // console.log("1 res.destroyed:", res.destroyed)
      // res.on("error", (err) => {
      //   console.log("ERR:", err)
      // })

      // 监听连接关闭
      // req.on("close", () => {
      //   console.log("close")
      //   console.log("1 res.destroyed:", res.destroyed)
      //   if (req.destroyed) {
      //     console.log("🛑 请求流已被销毁（客户端中止）")
      //     // cleanup();
      //   } else {
      //     console.log("连接正常关闭")
      //   }
      // })

      // 监听客户端断开连接
      // req.on("aborted", () => {
      //   console.log("客户端已断开连接（aborted事件）")
      //   console.log("1 res.destroyed:", res.destroyed)
      //   // 清理资源、停止处理等
      // })

      res.on("close", () => {
        // console.log("2 res.destroyed:", res.destroyed)
        // console.log("2 req.aborted:", req.aborted)
        logEnd({
          traceId,
          startTime,
          statusCode: res.statusCode,
        })
      })

      let scenario = loadScenario(
        scenarioName,
        scenarioDirs,
        reqDefaultDelay,
        reqChunkStrategy,
      )

      if (!scenario) {
        const message = `Scenario "${scenarioName}" not found`

        console.error(red("ERR:"), message)

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
        const chunkStrategy =
          /** @type {import('./types.ts').ChunkStrategy} */ (reqChunkStrategy)

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
        if (reqProvider === "anthropic") {
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
        if (reqProvider === "anthropic") {
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
        if (reqProvider === "anthropic") {
          await writeAnthropicStream(scenario.chunks, res, {
            delayMultiplier: reqDelayMultiplier,
            model: requestModel ?? options.model,
            inputTokens,
          })
        } else {
          await writeOpenAIStream(scenario.chunks, res, {
            delayMultiplier: reqDelayMultiplier,
            model: requestModel ?? options.model,
          })
        }
      } catch (err) {
        console.error(red("ERR:"), err)
        if (!res.destroyed) {
          res.end()
        }
      }
      return
    }

    if (req.method === "POST" && pathname === "/scenarios/create") {
      // Try JSON body first, fall back to ?name= query param
      let body = ""
      try {
        for await (const chunk of req) {
          body += chunk
        }
      } catch {
        /* ignore */
      }

      let name = url.searchParams.get("name")
      let content = ""
      if (body) {
        try {
          const parsed = JSON.parse(body)
          name = parsed.name ?? name
          content = parsed.content ?? ""
        } catch {
          /* ignore */
        }
      }

      if (!name) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Missing 'name' field" }))
        return
      }
      try {
        const scenariosDir = getUserScenariosDir()
        fs.mkdirSync(scenariosDir, { recursive: true })
        const filePath = path.join(scenariosDir, `${name}.md`)
        const exists = fs.existsSync(filePath)
        fs.writeFileSync(filePath, content, "utf-8")
        // Invalidate all cached entries for this scenario name
        // Otherwise the overwritten scenario will respond with old content.
        for (const key of scenarioCache.keys()) {
          if (key.startsWith(name + "::")) {
            scenarioCache.delete(key)
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            name,
            filePath,
            overwritten: exists,
            message: exists
              ? `Scenario "${name}" overwritten.`
              : `Scenario "${name}" created.`,
          }),
        )
      } catch (/** @type {unknown} */ e) {
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: /** @type {Error} */ (e).message }))
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
    showLaunchScreen(options, scenarioCache, endpointPaths)

    //     console.log(`\n  ${title}`)

    //     console.log(`
    //   Server:    http://localhost:${port}
    //   Provider:  ${options.provider}
    //   Endpoint(s): POST ${endpointPaths.join(", POST ")}
    //   Scenario:  ${options.scenario}  (use ?scenario=name to switch)
    //   Chunk:     ${options.chunkStrategy ?? DEFAULTS.chunkStrategy}
    //   Delay:             ${baseDelay}ms  (used when scenario has no @delay)
    //   Delay Multiplier:  ${options.delayMultiplier}x  (each @delay in scenario is multiplied by this)
    //   ${effectiveDelay}

    //   Press Ctrl+C to stop.
    // `)
  })

  return server
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
function loadScenario(
  name,
  dirs,
  defaultDelay = DEFAULTS.defaultDelay,
  chunkStrategy = DEFAULTS.chunkStrategy,
) {
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
  const cacheKey = scenarioCacheKey(name, chunkStrategy, defaultDelay)
  const cached = scenarioCache.get(cacheKey)
  if (cached) {
    return cached
  }

  for (const dir of dirs) {
    const filePath = path.join(dir, `${name}.md`)
    try {
      if (fs.existsSync(filePath)) {
        const scenario = parseScenarioFile(filePath, {
          defaultDelay,
          chunkStrategy,
        })
        scenarioCache.set(cacheKey, scenario)
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
 * @param {CliOptions} options
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
            chunkStrategy: options.chunkStrategy ?? DEFAULTS.chunkStrategy,
            isBuiltin: s.isBuiltin,
          })
          scenarioCache.set(
            scenarioCacheKey(
              s.name,
              options.chunkStrategy,
              options.defaultDelay,
            ),
            scenario,
          )
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
    const sourceLabelUnderlineLength = 12

    console.log("\n  Available scenarios:\n")
    console.log(
      "  " + "Name".padEnd(25) + " " + "Source".padEnd(12) + " Description",
    )
    console.log(
      "  " +
        "".padEnd(25, "─") +
        " " +
        "".padEnd(sourceLabelUnderlineLength, "─") +
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
          const cached = scenarioCache.get(
            scenarioCacheKey(
              s.name,
              options.chunkStrategy,
              options.defaultDelay,
            ),
          )
          const source = s.isBuiltin
            ? "builtin"
            : `${green("custom")}${SPACE.repeat(6)}`

          if (cached?.error) {
            console.log(
              "  " +
                s.name.padEnd(25) +
                " " +
                source.padEnd(sourceLabelUnderlineLength) +
                " " +
                (cached.description ||
                  "Simulates HTTP " + cached.error.type + " error"),
            )
          } else {
            console.log(
              "  " +
                s.name.padEnd(25) +
                " " +
                source.padEnd(sourceLabelUnderlineLength) +
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
 * @param {CliOptions} options
 * @param {string[]} dirs
 * @returns {string}
 */

function getIndexHtml(options, dirs) {
  const seen = new Set()
  /** @type {string[]} */
  const customOpts = []
  /** @type {string[]} */
  const builtinOpts = []
  for (const dir of dirs) {
    // const isBuiltin = dir === BUILTIN_DIR
    try {
      const scenarios = listScenarios(dir)
      for (const s of scenarios) {
        if (seen.has(s.name)) {
          continue
        }
        seen.add(s.name)
        const cached = scenarioCache.get(
          scenarioCacheKey(s.name, options.chunkStrategy, options.defaultDelay),
        )
        const label = cached?.description
          ? `${s.name} — ${cached.description}`
          : s.name
        const opt = `<option value="${s.name}"${s.name === options.scenario ? " selected" : ""}>${label}</option>`
        ;(s.isBuiltin ? builtinOpts : customOpts).push(opt)
      }
    } catch {
      /* skip */
    }
  }

  const scenarioOpts = []
  if (customOpts.length > 0) {
    scenarioOpts.push('<optgroup label="Your Scenarios">')
    scenarioOpts.push(...customOpts)
    scenarioOpts.push("</optgroup>")
  }
  scenarioOpts.push('<optgroup label="Built-in">')
  scenarioOpts.push(...builtinOpts)
  scenarioOpts.push("</optgroup>")

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
    scenarioCount: scenarioOpts.length,
    delayMultiplier: options.delayMultiplier,
    defaultDelay: options.defaultDelay,
    provider: options.provider,
    chunkStrategy: options.chunkStrategy,
  })
}

/**

 * @param {{ port: number; apiPath: string; scenarioOpts: string[]; model: string; scenarioCount: number; delayMultiplier: number; defaultDelay: number; provider: string; chunkStrategy: string }} param0
 * @returns
 */
function renderHTML({
  port,
  apiPath,
  scenarioOpts,
  model,
  scenarioCount,
  delayMultiplier,
  defaultDelay,
  provider,
  chunkStrategy,
}) {
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
    .replaceAll("${scenarioCount}", String(scenarioCount))
    .replaceAll("${delayMultiplier}", String(delayMultiplier))
    .replaceAll("${defaultDelay}", String(defaultDelay))
    .replaceAll("${provider}", provider)
    .replaceAll("${chunkStrategy}", chunkStrategy)
}
