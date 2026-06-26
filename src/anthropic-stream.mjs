/**
 * @file Anthropic Messages API SSE 流输出器。
 *
 * 将 Chunk[] 以 Anthropic 兼容的 SSE 格式写入 HTTP 响应。
 * 格式遵循：https://docs.anthropic.com/en/api/messages-streaming
 *
 * 典型输出：
 * ```
 * event: message_start
 * data: {"type":"message_start","message":{"id":"msg_xxx","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-20250514","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":8,"output_tokens":0}}}
 *
 * event: content_block_start
 * data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}
 *
 * event: content_block_delta
 * data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}
 *
 * event: content_block_stop
 * data: {"type":"content_block_stop","index":0}
 *
 * event: message_delta
 * data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":8,"output_tokens":5}}
 *
 * event: message_stop
 * data: {"type":"message_stop"}
 * ```
 */

import { calculateTokens } from "./utils/token.mjs"
import { anthropicMsger } from "./utils/provider-anthropic.mjs"

/**
 * @import { Chunk } from './types.ts'
 */

/**
 * 将 Chunk 列表以 Anthropic Messages SSE 格式写入 HTTP 响应。
 *
 * @param {Chunk[]} chunks
 * @param {import('node:http').ServerResponse} res
 * @param {object} options
 * @param {number} [options.delayMultiplier] - 全局延迟倍率（1 = 正常，0.5 = 半速，2 = 倍速）
 * @param {string} [options.model] - 模型名，默认 "claude-sonnet-4-20250514"
 * @param {number} [options.inputTokens] - 请求的 input_tokens 统计
 */
export async function writeAnthropicStream(chunks, res, options = {}) {
  const { delayMultiplier: delay = 1, model = "claude-sonnet-4-20250514", inputTokens = 0 } = options

  const messageId = `msg_${generateId()}`

  // 1. message_start
  res.write(anthropicMsger.message_start({ model, messageId, inputTokens }))

  // 2. content_block_start
  res.write(anthropicMsger.content_block_start())

  // 3. 遍历内容 chunks
  let totalOutput = ""
  for (const chunk of chunks) {
    // 错误场景 - 流中内嵌的 @error
    if (chunk.error) {
      await applyDelay(chunk.delay ?? 0)
      res.write(
        anthropicMsger.error({
          error: mapAnthropicError(chunk.error.type),
        }),
      )
      res.end()
      return
    }

    // @done 终止指令 — 正常结束流
    if (chunk.done) {
      res.write(anthropicMsger.content_block_stop())
      res.write(
        anthropicMsger.message_delta({
          done_reason: "end_turn",
          prompt_eval_count: inputTokens,
          eval_count: calculateTokens(totalOutput),
        }),
      )
      res.write(anthropicMsger.message_stop())
      res.end()
      return
    }

    // 正常内容 chunk
    await applyDelay(chunk.delay ?? 0, delay)
    totalOutput += chunk.content
    res.write(anthropicMsger.content_block_delta(chunk.content))
  }

  // 4. 结束标记
  res.write(anthropicMsger.content_block_stop())
  res.write(
    anthropicMsger.message_delta({
      done_reason: "end_turn",
      prompt_eval_count: inputTokens,
      eval_count: calculateTokens(totalOutput),
    }),
  )
  res.write(anthropicMsger.message_stop())
  res.end()
}

/**
 * 通过 error 事件写入错误响应（200 状态码，SSE 格式）。
 *
 * @param {import('./types.ts').ErrorTrigger} error
 * @param {import('node:http').ServerResponse} res
 */
export function writeAnthropicErrorStream(error, res) {
  res.write(
    anthropicMsger.error({
      error: mapAnthropicError(error.type),
    }),
  )
  res.end()
}

/**
 * 非流式 Anthropic Messages API 响应。
 *
 * @param {string} content - 完整输出内容
 * @param {import('node:http').ServerResponse} res
 * @param {object} options
 * @param {string} [options.model] - 模型名
 * @param {number} [options.inputTokens] - input_tokens 统计
 */
export function writeAnthropicNonStreamingResponse(content, res, options = {}) {
  const { model = "claude-sonnet-4-20250514", inputTokens = 0 } = options
  const outputTokens = calculateTokens(content)

  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(
    JSON.stringify({
      id: `msg_${generateId()}`,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: content }],
      model,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    }),
  )
}

/**
 * 将内部 ErrorType 映射为 Anthropic API 风格的 error 对象。
 *
 * @param {string} type
 * @returns {{ type: string; message: string }}
 */
function mapAnthropicError(type) {
  switch (type) {
    case "rate-limit":
      return {
        type: "rate_limit_error",
        message: "Rate limit exceeded. Please wait and retry.",
      }
    case "content-filter":
      return {
        type: "content_filter_error",
        message: "The response was filtered due to content policy.",
      }
    case "server-error":
      return {
        type: "api_error",
        message: "Internal server error.",
      }
    case "timeout":
      return {
        type: "api_error",
        message: "Request timed out.",
      }
    default:
      return {
        type: "api_error",
        message: "An unexpected error occurred.",
      }
  }
}

/**
 * 生成短 id。
 *
 * @returns {string}
 */
function generateId() {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 6)
  return `${timestamp}${random}`
}

/**
 * 延迟等待。
 *
 * @param {number} ms - 基准延迟（毫秒）
 * @param {number} [multiplier=1] - 倍率
 */
function applyDelay(ms, multiplier = 1) {
  const actual = ms * multiplier
  if (actual <= 0) return
  return new Promise((resolve) => setTimeout(resolve, actual))
}
