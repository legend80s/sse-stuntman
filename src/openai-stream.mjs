/**
 * @file OpenAI Chat Completions SSE 流输出器。
 *
 * 将 Chunk[] 以 OpenAI 兼容的 SSE 格式写入 HTTP 响应。
 * 格式严格遵循：https://platform.openai.com/docs/api-reference/streaming
 *
 * 典型输出：
 * ```
 * data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk",...,"choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}
 *
 * data: {"id":"chatcmpl-xxx",...,"choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}
 *
 * data: [DONE]
 * ```
 */

import { generateId } from "./utils/string.mjs"

/**
 * @import { Chunk, SSEEvent, SSEChoice } from './types.ts'
 */

/**
 * 将 Chunk 列表以 OpenAI SSE 格式写入 HTTP 响应。
 *
 * @param {import('./types.ts').Chunk[]} chunks
 * @param {import('node:http').ServerResponse} res
 * @param {object} options
 * @param {number} [options.delayMultiplier] - 全局延迟倍率（1 = 正常，0.5 = 半速，2 = 倍速）
 * @param {string} [options.model] - 模型名，默认 "gpt-4o"
 */
export async function writeOpenAIStream(chunks, res, options = {}) {
  const { delayMultiplier: delay = 1, model = "gpt-4o" } = options

  const id = generateId()
  const created = Math.floor(Date.now() / 1000)

  // 1. 角色声明 chunk（始终立即发送）
  writeEvent(res, {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  })

  // 2. 遍历内容 chunks
  for (const chunk of chunks) {
    // 错误场景
    if (chunk.error) {
      // 已经通过 HTTP 错误码处理的场景不会走到这里。
      // 只有流中内嵌的 @error 才会在此处处理。
      await applyDelay(chunk.delay ?? 0)
      writeEvent(res, {
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "content_filter",
          },
        ],
      })
      res.write("data: [DONE]\n\n")
      res.end()
      return
    }

    // @done 终止指令
    if (chunk.done) {
      res.write("data: [DONE]\n\n")
      res.end()
      return
    }

    // 正常内容 chunk
    await applyDelay(chunk.delay ?? 0, delay)

    writeEvent(res, {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        { index: 0, delta: { content: chunk.content }, finish_reason: null },
      ],
    })
  }

  // 3. 结束标记
  // 最后一条 content event 带 finish_reason
  writeEvent(res, {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  })
  res.write("data: [DONE]\n\n")
  res.end()
}

/**
 * 如果场景是错误场景（非流式），通过 HTTP 状态码和 JSON 体返回错误。
 *
 * @param {import('./types.ts').ErrorTrigger} error
 * @param {import('node:http').ServerResponse} res
 */
export function writeErrorResponse(error, res) {
  switch (error.type) {
    case "rate-limit": {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": "30",
        "Access-Control-Allow-Origin": "*",
      })
      res.end(
        JSON.stringify({
          error: {
            message: "Rate limit exceeded. Please wait and retry.",
            type: "rate_limit_error",
            code: 429,
          },
        }),
      )
      break
    }
    case "content-filter": {
      res.writeHead(400, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      })
      res.end(
        JSON.stringify({
          error: {
            message: "The response was filtered due to content policy.",
            type: "content_filter",
            code: 400,
          },
        }),
      )
      break
    }
    case "server-error": {
      res.writeHead(500, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      })
      res.end(
        JSON.stringify({
          error: {
            message: "Internal server error.",
            type: "server_error",
            code: 500,
          },
        }),
      )
      break
    }
    case "timeout": {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      })
      // 写几条数据后直接断开
      writeEvent(res, {
        id: generateId(),
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4o",
        choices: [
          {
            index: 0,
            delta: { content: "正在处理您的请求" },
            finish_reason: null,
          },
        ],
      })
      // 不发送 [DONE]，直接关闭连接
      setTimeout(() => res.destroy(), 200)
      break
    }
    case "empty":
    default: {
      // 空响应：直接返回 [DONE]，无任何内容
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      })
      res.write("data: [DONE]\n\n")
      res.end()
      break
    }
  }
}

/**
 * 向响应流写入一条 SSE data: 事件。
 *
 * @param {import('node:http').ServerResponse} res
 * @param {import('./types.ts').SSEEvent} data
 */
function writeEvent(res, data) {
  console.log("[writEvent]")
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/**
 * 延迟等待。
 *
 * @param {number} ms - 基准延迟（毫秒）
 * @param {number} [multiplier=1] - 倍率
 */
function applyDelay(ms, multiplier = 1) {
  const actual = ms * multiplier
  if (actual <= 0) {
    return
  }
  return new Promise((resolve) => setTimeout(resolve, actual))
}
