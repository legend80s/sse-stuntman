/**
 * @file anthropic-stream 单元测试
 */

import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { describe, it, mock } from "node:test"
import {
  writeAnthropicErrorStream,
  writeAnthropicNonStreamingResponse,
  writeAnthropicStream,
} from "./stream.mjs"

/**
 * @import { SSEEvent } from '../../../types.ts'
 */

/**
 * 创建一个模拟的 ServerResponse。
 * @returns {import('node:http').ServerResponse & { chunks: string[] }}
 */
function mockResponse() {
  const chunks = []
  let ended = false
  let statusCode = 200

  const res = new EventEmitter()
  res.statusCode = 200
  res._headers = {}
  res.chunks = chunks
  res.ended = false

  res.setHeader = mock.fn((name, value) => {
    res._headers[name] = value
  })
  res.writeHead = mock.fn((code, headers) => {
    statusCode = code
    if (headers) Object.assign(res._headers, headers)
  })
  res.write = mock.fn((data) => {
    chunks.push(data.toString())
    return true
  })
  res.end = mock.fn((data) => {
    if (data) chunks.push(data.toString())
    ended = true
    res.ended = true
    res.emit("finish")
  })
  res.destroy = mock.fn(() => {
    ended = true
    res.ended = true
  })

  Object.defineProperty(res, "destroyed", { get: () => ended })

  return res
}

describe("anthropic-stream", () => {
  describe("writeAnthropicStream()", () => {
    it("should emit message_start event first", async () => {
      const res = mockResponse()
      await writeAnthropicStream([{ content: "hello" }], res, {
        delayMultiplier: 0,
        model: "claude-sonnet-4-20250514",
        inputTokens: 5,
      })

      const msgStartEvent = res.chunks.find((c) =>
        c.startsWith("event: message_start"),
      )
      assert.ok(msgStartEvent, "Should have message_start event")
      const data = JSON.parse(msgStartEvent.match(/data: (.+)/)[1])
      assert.equal(data.type, "message_start")
      assert.equal(data.message.role, "assistant")
      assert.equal(data.message.model, "claude-sonnet-4-20250514")
      assert.equal(data.message.usage.input_tokens, 5)
    })

    it("should emit content_block_start after message_start", async () => {
      const res = mockResponse()
      await writeAnthropicStream([{ content: "hello" }], res, {
        delayMultiplier: 0,
      })

      const cbStartEvents = res.chunks.filter((c) =>
        c.startsWith("event: content_block_start"),
      )
      assert.equal(cbStartEvents.length, 1)
      const data = JSON.parse(cbStartEvents[0].match(/data: (.+)/)[1])
      assert.equal(data.type, "content_block_start")
      assert.equal(data.index, 0)
    })

    it("should emit content_block_delta for each chunk", async () => {
      const res = mockResponse()
      await writeAnthropicStream(
        [{ content: "hello" }, { content: " world" }],
        res,
        { delayMultiplier: 0 },
      )

      const deltaEvents = res.chunks.filter((c) =>
        c.startsWith("event: content_block_delta"),
      )
      assert.equal(deltaEvents.length, 2)
      const firstDelta = JSON.parse(deltaEvents[0].match(/data: (.+)/)[1])
      assert.equal(firstDelta.delta.text, "hello")
      const secondDelta = JSON.parse(deltaEvents[1].match(/data: (.+)/)[1])
      assert.equal(secondDelta.delta.text, " world")
    })

    it("should emit content_block_stop, message_delta, message_stop at end", async () => {
      const res = mockResponse()
      await writeAnthropicStream([{ content: "test" }], res, {
        delayMultiplier: 0,
        inputTokens: 3,
      })

      const lines = res.chunks.join("")
      assert.ok(lines.includes("content_block_stop"))
      assert.ok(lines.includes("message_delta"))
      assert.ok(lines.includes("message_stop"))

      // Verify message_delta has usage
      const msgDeltaEvent = res.chunks.find((c) =>
        c.startsWith("event: message_delta"),
      )
      const msgDelta = JSON.parse(msgDeltaEvent.match(/data: (.+)/)[1])
      assert.equal(msgDelta.delta.stop_reason, "end_turn")
      assert.equal(msgDelta.usage.input_tokens, 3)
      assert.ok(msgDelta.usage.output_tokens > 0)
    })

    it("should handle @done chunk by stopping normally", async () => {
      const res = mockResponse()
      await writeAnthropicStream(
        [
          { content: "before" },
          { content: "", done: true },
          { content: "after" },
        ],
        res,
        { delayMultiplier: 0 },
      )

      const allContent = res.chunks.join("")
      // should include "before" content and normal stop events
      assert.ok(allContent.includes("before"))
      assert.ok(allContent.includes("content_block_stop"))
      assert.ok(allContent.includes("message_stop"))
      // should NOT include "after"
      assert.ok(!allContent.includes("after"))
    })

    it("should handle @error chunk by sending error event", async () => {
      const res = mockResponse()
      await writeAnthropicStream(
        [{ content: "before" }, { content: "", error: { type: "rate-limit" } }],
        res,
        { delayMultiplier: 0 },
      )

      const allContent = res.chunks.join("")
      assert.ok(allContent.includes("event: error"))
      assert.ok(allContent.includes("rate_limit_error"))
      // should not include content after error
      assert.ok(!allContent.includes("after"))
    })

    it("should honor delay multiplier", async () => {
      const res = mockResponse()
      const start = Date.now()
      await writeAnthropicStream(
        [
          { content: "first", delay: 100 },
          { content: "second", delay: 100 },
        ],
        res,
        { delayMultiplier: 0.5 },
      )
      const elapsed = Date.now() - start

      // 2 * (100 * 0.5) ≈ 100ms
      assert.ok(elapsed < 300, `Took ${elapsed}ms, expected ~100ms`)
    })

    it("should use custom model name", async () => {
      const res = mockResponse()
      await writeAnthropicStream([{ content: "hi" }], res, {
        delayMultiplier: 0,
        model: "claude-3-opus-20240229",
      })

      const msgStartEvent = res.chunks.find((c) =>
        c.startsWith("event: message_start"),
      )
      const data = JSON.parse(msgStartEvent.match(/data: (.+)/)[1])
      assert.equal(data.message.model, "claude-3-opus-20240229")
    })
  })

  describe("writeAnthropicErrorStream()", () => {
    it("should emit error SSE event for rate-limit", () => {
      const res = mockResponse()
      writeAnthropicErrorStream({ type: "rate-limit" }, res)

      const errorLine = res.chunks.find((c) => c.startsWith("event: error"))
      assert.ok(errorLine, "Should have error event")
      const data = JSON.parse(errorLine.match(/data: (.+)/)[1])
      assert.equal(data.error.type, "rate_limit_error")
    })

    it("should emit error SSE event for content-filter", () => {
      const res = mockResponse()
      writeAnthropicErrorStream({ type: "content-filter" }, res)

      const errorLine = res.chunks.find((c) => c.startsWith("event: error"))
      assert.ok(errorLine, "Should have error event")
      const data = JSON.parse(errorLine.match(/data: (.+)/)[1])
      assert.equal(data.error.type, "content_filter_error")
    })

    it("should emit error SSE event for server-error", () => {
      const res = mockResponse()
      writeAnthropicErrorStream({ type: "server-error" }, res)

      const errorLine = res.chunks.find((c) => c.startsWith("event: error"))
      assert.ok(errorLine, "Should have error event")
      const data = JSON.parse(errorLine.match(/data: (.+)/)[1])
      assert.equal(data.error.type, "api_error")
    })
  })

  describe("writeAnthropicNonStreamingResponse()", () => {
    it("should return JSON with Anthropic Messages API format", () => {
      const res = mockResponse()
      writeAnthropicNonStreamingResponse("Hello world", res, {
        model: "claude-sonnet-4-20250514",
        inputTokens: 5,
      })

      const body = JSON.parse(res.chunks[0])
      assert.equal(body.type, "message")
      assert.equal(body.role, "assistant")
      assert.equal(body.content[0].type, "text")
      assert.equal(body.content[0].text, "Hello world")
      assert.equal(body.stop_reason, "end_turn")
    })

    it("should include usage statistics", () => {
      const res = mockResponse()
      writeAnthropicNonStreamingResponse("Hello world", res, {
        inputTokens: 5,
      })

      const body = JSON.parse(res.chunks[0])
      assert.equal(body.usage.input_tokens, 5)
      assert.ok(body.usage.output_tokens > 0)
    })

    it("should contain valid message id", () => {
      const res = mockResponse()
      writeAnthropicNonStreamingResponse("test", res)

      const body = JSON.parse(res.chunks[0])
      assert.ok(
        body.id.startsWith("msg_"),
        `id should start with msg_, got ${body.id}`,
      )
    })
  })
})
