/**
 * @file Scenario (.md) 文件解析器。
 *
 * 将包含 `@delay` / `@done` / `@error` / `@desc` 指令的 Markdown 文件
 * 解析为 Chunk 数组供 openai-stream.mjs 消费。
 *
 * ## 指令参考
 *
 * | 指令 | 示例 | 作用 |
 * |------|------|------|
 * | `@delay:N` | `<!-- @delay: 200 -->` | 后续 chunk 的间隔延迟（ms） |
 * | `@desc:TEXT` | `<!-- @desc: 标准对话场景 -->` | 场景描述，用于 --list 输出 |
 * | `@done` | `<!-- @done -->` | 在此处终止流 |
 * | `@error:TYPE` | `<!-- @error: rate-limit -->` | 整个场景为错误场景 |
 * | `@input` | `<!-- @input -->` | 占位符，请求处理时替换为最后一条用户消息内容 |
 *
 * ## 切分策略
 *
 * 通过 `--chunk-strategy` CLI 参数指定（默认 `word`）：
 *
 * | 策略 | 说明 |
 * |------|------|
 * | `word` (默认) | 按单词切分，打字机效果 |
 * | `sentence` | 按句子切分 |
 * | `char` | 逐字符输出 |
 * | `line` | 按行切分 |
 * | `paragraph` | 整个段落一个 chunk |
 *
 * ## 场景文件示例
 *
 * ```markdown
 * <!-- @desc: 代码审查演示 -->
 * # AI 助手
 *
 * 你好！我是 AI 助手。
 *
 * <!-- @delay: 150 -->
 *
 * ## 我能做什么
 *
 * - 回答问题
 * - 编写代码
 *
 * <!-- @delay: 200 -->
 *
 * 这是逐词输出。
 *
 * <!-- @done -->
 * ```
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { DEFAULTS } from "./cli.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const BUILTIN_DIR = path.join(__dirname, "scenarios")

/**
 * @import { Chunk, ChunkStrategy, ErrorTrigger, Scenario } from './types.ts'
 */

/**
 * 解析单个 .md 场景文件。
 *
 * @param {string} filePath - .md 文件的绝对路径
 * @param {object} [options]
 * @param {number} [options.defaultDelay=5]
 * @param {ChunkStrategy} [options.chunkStrategy]
 * @param {boolean} [options.isBuiltin=false]
 * @returns {Scenario}
 */
export function parseScenarioFile(filePath, options = {}) {
  const {
    defaultDelay = DEFAULTS.defaultDelay,
    chunkStrategy = DEFAULTS.chunkStrategy,
    isBuiltin = false,
  } = options
  const content = fs.readFileSync(filePath, "utf-8")
  const basename = path.basename(filePath, ".md")

  const errorMatch = content.match(/<!--\s*@error\s*:\s*(\S+?)\s*-->/)
  const descMatch = content.match(/<!--\s*@desc\s*:\s*(.*?)\s*-->/)

  if (errorMatch) {
    return {
      isBuiltin,
      name: basename,
      chunks: [],
      description: descMatch?.[1]?.trim() || "",
      error: {
        type: /** @type {import('./types.ts').ErrorType} */ (
          // @ts-expect-error
          errorMatch[1].trim()
        ),
      },
    }
  }

  /** @type {import('./types.ts').Chunk[]} */
  const chunks = []
  let currentDelay = defaultDelay
  let description = ""
  let textBuffer = ""
  let lastIndex = 0

  // 正则匹配指令：<!-- @KEY: VALUE --> 或 <!-- @KEY -->
  const DIRECTIVE_RE = /<!--\s*@(\w+)(?:\s*:\s*(.*?))?\s*-->/gs

  let match
  // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
  while ((match = DIRECTIVE_RE.exec(content)) !== null) {
    // 指令前的文本暂存到 buffer
    const textBefore = content.slice(lastIndex, match.index)
    textBuffer += textBefore

    const key = match[1]
    const value = match[2]?.trim()

    switch (key) {
      case "delay": {
        flushBuffer()
        currentDelay = parseInt(value ?? "50", 10)
        if (Number.isNaN(currentDelay)) {
          currentDelay = 50
        }
        break
      }
      case "input": {
        flushBuffer()
        chunks.push({
          content: "",
          input: true,
          delay: currentDelay,
        })
        break
      }
      case "desc": {
        if (value) {
          description = value
        }
        break
      }
      case "done": {
        flushBuffer()
        chunks.push({ content: "", delay: 0, done: true })
        break
      }
      case "error": {
        flushBuffer()
        chunks.push({
          content: "",
          error: {
            type: /** @type {import('./types.ts').ErrorType} */ (
              value ?? "server-error"
            ),
          },
        })
        break
      }
    }

    lastIndex = match.index + match[0].length
  }

  // 处理剩余文本
  const remaining = content.slice(lastIndex)
  if (remaining.trim()) {
    textBuffer += remaining
    flushBuffer()
  }

  const trimmedChunks = trimArrayStart(chunks, (firstChunk) => {
    return !!(
      firstChunk &&
      firstChunk.content.replace(/[\r\s]+$/, "") === "" &&
      // input will be filled with user prompt so we should keep it
      !firstChunk.input
    )
  })
  // const [firstChunk, ...rest] = chunks

  // console.log("filePath:", filePath)
  // console.log("firstChunk:", firstChunk)
  // console.log("rest:", rest.slice(0, 2))

  return { name: basename, chunks: trimmedChunks, description, isBuiltin }

  /** 将 textBuffer 按指定策略切分成 chunks */
  function flushBuffer() {
    const trimmed = textBuffer.replace(/\n{2,}/g, "\n")
    // 跳过纯空白 buffer —— 它们来自指令间的换行符，没有语义意义
    // e.g. echo.md 中 `<!-- @delay: 30 -->` 与 `<!-- @input -->` 之间的 \n
    if (trimmed.trim() === "") {
      textBuffer = ""
      return
    }
    const sub = splitContent(trimmed, chunkStrategy)
    // console.log("\n---------------------------------------")
    // console.log({ textBuffer, trimmed, currentStrategy })
    // console.log("sub:", sub)
    // console.log("---------------------------------------\n")
    for (const s of sub) {
      chunks.push({ content: s, delay: currentDelay })
    }
    textBuffer = ""
  }
}

const segmenter = new Intl.Segmenter("zh-CN", {
  granularity: "word",
})

const sentenceSegmenter = new Intl.Segmenter("zh-CN", {
  granularity: "sentence",
})
/**
 * @param {string} prompt
 * @returns {string[]}
 */
function toTokens(prompt) {
  const segments = [...segmenter.segment(prompt)]
  const words = segments.map((seg) => seg.segment)

  return words
}
/**
 * 将一段文本按策略切分为多个字符串（每个字符串对应一个 SSE chunk）。
 *
 * @param {string} text - 要切分的纯文本
 * @param {ChunkStrategy} strategy
 * @returns {string[]}
 */
export function splitContent(text, strategy) {
  switch (strategy) {
    case "word": {
      return toTokens(text)
    }
    case "char": {
      return [...text]
    }
    case "line": {
      return text.split("\n").filter((l) => l.trim().length > 0)
    }
    case "paragraph": {
      return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
    }
    case "sentence":
    default: {
      return [...sentenceSegmenter.segment(text)].map((seg) => seg.segment)
      // const parts = text.match(/[^.!?]*[.!?]+(\s|$)/g)
      // if (!parts || parts.length === 0) {
      //   const clauseParts = text.match(/[^,;]*[,;](\s|$)/g)
      //   if (!clauseParts || clauseParts.length === 0) {
      //     return [text]
      //   }
      //   return clauseParts.map((s) => s.trim()).filter(Boolean)
      // }
      // return parts.map((s) => s.trim()).filter(Boolean)
    }
  }
}

/**
 * 列出场景目录下所有内置场景的名称。
 *
 * @param {string} scenariosDir - 场景目录的绝对路径
 * @returns {Array<{ name: string, file: string, isBuiltin: boolean }>}
 */
export function listScenarios(scenariosDir) {
  const files = fs.readdirSync(scenariosDir)
  const scenarios = []

  const isBuiltin = scenariosDir === BUILTIN_DIR

  for (const f of files) {
    if (f.endsWith(".md")) {
      scenarios.push({
        name: path.basename(f, ".md"),
        file: path.join(scenariosDir, f),
        isBuiltin,
      })
    }
  }
  return scenarios.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * trim 数组开始部分，直到遇到第一个不满足 predicate 的元素。
 * @template T
 * @param {Array<T>} arr - 要处理的数组
 * @param {(item: T | undefined) => boolean} predicate - 判断元素是否满足条件的函数
 * @returns {Array<T>} - 处理后的数组
 */
function trimArrayStart(arr, predicate) {
  while (arr.length > 0 && predicate(arr[0])) {
    arr.shift()
  }

  return arr
}
