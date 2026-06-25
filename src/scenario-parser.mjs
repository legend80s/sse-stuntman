/**
 * @file Scenario (.md) 文件解析器。
 *
 * 将包含 `@delay` / `@chunk` / `@done` / `@error` / `@desc` 指令的 Markdown 文件
 * 解析为 Chunk 数组供 openai-stream.mjs 消费。
 *
 * ## 指令参考
 *
 * | 指令 | 示例 | 作用 |
 * |------|------|------|
 * | `@delay:N` | `<!-- @delay: 200 -->` | 后续 chunk 的间隔延迟（ms） |
 * | `@chunk:TYPE` | `<!-- @chunk: word -->` | 后续文本的切分策略 |
 * | `@desc:TEXT` | `<!-- @desc: 标准对话场景 -->` | 场景描述，用于 --list 输出 |
 * | `@done` | `<!-- @done -->` | 在此处终止流 |
 * | `@error:TYPE` | `<!-- @error: rate-limit -->` | 整个场景为错误场景 |
 *
 * ## 切分策略
 *
 * | 策略 | 说明 |
 * |------|------|
 * | `sentence` (默认) | 按句子切分，最自然的流式效果 |
 * | `word` | 按单词切分，打字机效果 |
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
 * <!-- @chunk: word -->
 *
 * 这是逐词输出。
 *
 * <!-- @done -->
 * ```
 */

import fs from "node:fs"
import path from "node:path"

/**
 * @import { Chunk, ChunkStrategy, ErrorTrigger, Scenario } from './types.ts'
 */

/**
 * 解析单个 .md 场景文件。
 *
 * @param {string} filePath - .md 文件的绝对路径
 * @param {object} [options]
 * @param {number} [options.defaultDelay=5] - 场景内未显式指定 @delay 时的默认延迟（ms）
 * @returns {Scenario}
 */
export function parseScenarioFile(filePath, options = {}) {
  const { defaultDelay = 5 } = options
  const content = fs.readFileSync(filePath, "utf-8")
  const basename = path.basename(filePath, ".md")

  const errorMatch = content.match(/<!--\s*@error\s*:\s*(\S+?)\s*-->/)
  const descMatch = content.match(/<!--\s*@desc\s*:\s*(.*?)\s*-->/)

  if (errorMatch) {
    return {
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
  let currentStrategy = /** @type {ChunkStrategy} */ ("sentence")
  let description = ""
  let textBuffer = ""
  let lastIndex = 0

  // 正则匹配指令：<!-- @KEY: VALUE --> 或 <!-- @KEY -->
  const DIRECTIVE_RE = /<!--\s*@(\w+)(?:\s*:\s*(.*?))?\s*-->/gs

  let match
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
        if (Number.isNaN(currentDelay)) currentDelay = 50
        break
      }
      case "chunk": {
        flushBuffer()
        if (
          value &&
          ["sentence", "word", "char", "line", "paragraph"].includes(value)
        ) {
          currentStrategy = /** @type {ChunkStrategy} */ (value)
        }
        break
      }
      case "desc": {
        if (value) description = value
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

  return { name: basename, chunks, description }

  /** 将 textBuffer 按当前策略切分成 chunks */
  function flushBuffer() {
    const trimmed = textBuffer.trim()
    if (!trimmed) {
      textBuffer = ""
      return
    }
    const sub = splitContent(trimmed, currentStrategy)
    for (const s of sub) {
      chunks.push({ content: s, delay: currentDelay })
    }
    textBuffer = ""
  }
}

const segmenter = new Intl.Segmenter("zh-CN", {
  granularity: "word",
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
function splitContent(text, strategy) {
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
      const parts = text.match(/[^.!?]*[.!?]+(\s|$)/g)
      if (!parts || parts.length === 0) {
        const clauseParts = text.match(/[^,;]*[,;](\s|$)/g)
        if (!clauseParts || clauseParts.length === 0) {
          return [text]
        }
        return clauseParts.map((s) => s.trim()).filter(Boolean)
      }
      return parts.map((s) => s.trim()).filter(Boolean)
    }
  }
}

/**
 * 列出场景目录下所有内置场景的名称。
 *
 * @param {string} scenariosDir - 场景目录的绝对路径
 * @returns {Array<{ name: string, file: string }>}
 */
export function listScenarios(scenariosDir) {
  const files = fs.readdirSync(scenariosDir)
  const scenarios = []
  for (const f of files) {
    if (f.endsWith(".md")) {
      scenarios.push({
        name: path.basename(f, ".md"),
        file: path.join(scenariosDir, f),
      })
    }
  }
  return scenarios.sort((a, b) => a.name.localeCompare(b.name))
}
