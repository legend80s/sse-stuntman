/**
 * @file openai-stream 单元测试
 */

import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { writeOpenAIStream, writeErrorResponse } from './openai-stream.mjs'

/**
 * 创建一个模拟的 ServerResponse。
 * @returns {import('node:http').ServerResponse}
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
    res.emit('finish')
  })
  res.destroy = mock.fn(() => {
    ended = true
    res.ended = true
  })

  Object.defineProperty(res, 'destroyed', { get: () => ended })

  return res
}

describe('openai-stream', () => {
  describe('writeOpenAIStream()', () => {
    it('should write role-assistant chunk first', async () => {
      const res = mockResponse()
      await writeOpenAIStream([{ content: 'hello' }], res, { delayMultiplier: 0, model: 'gpt-4o' })

      const firstData = res.chunks[0]
      const parsed = JSON.parse(firstData.slice(6)) // strip "data: "
      assert.equal(parsed.choices[0].delta.role, 'assistant')
    })

    it('should write content chunks', async () => {
      const res = mockResponse()
      await writeOpenAIStream([{ content: 'hello' }, { content: ' world' }], res, { delayMultiplier: 0, model: 'gpt-4o' })

      // first is role, next two are content
      const contentEvents = res.chunks.filter(c => {
        if (c.startsWith('data: [DONE]')) return false
        try {
          const d = JSON.parse(c.slice(6))
          return d.choices[0].delta.content
        } catch { return false }
      })

      assert.equal(contentEvents.length, 2)
    })

    it('should emit data: [DONE] at end', async () => {
      const res = mockResponse()
      await writeOpenAIStream([{ content: 'test' }], res, { delayMultiplier: 0, model: 'gpt-4o' })

      const doneLine = res.chunks.find(c => c.includes('[DONE]'))
      assert.ok(doneLine, 'Should have [DONE]')
    })

    it('should handle @done chunk by sending immediate [DONE]', async () => {
      const res = mockResponse()
      await writeOpenAIStream([{ content: 'before' }, { content: '', done: true }, { content: 'after' }], res, { delayMultiplier: 0, model: 'gpt-4o' })

      // should not include "after"
      const allContent = res.chunks.join('')
      assert.ok(allContent.includes('before'))
      assert.ok(allContent.includes('[DONE]'))
      assert.ok(!allContent.includes('after'))
    })

    it('should honor delay multiplier', async () => {
      const res = mockResponse()
      const start = Date.now()
      await writeOpenAIStream([{ content: 'first', delay: 100 }, { content: 'second', delay: 100 }], res, { delayMultiplier: 0.5, model: 'gpt-4o' })
      const elapsed = Date.now() - start

      // 2 * (100 * 0.5) ≈ 100ms, plus role chunk overhead
      assert.ok(elapsed < 300, `Took ${elapsed}ms, expected ~100ms`)
    })

    it('should use custom model name', async () => {
      const res = mockResponse()
      await writeOpenAIStream([{ content: 'hi' }], res, { delayMultiplier: 0, model: 'deepseek-chat' })

      const roleEvent = JSON.parse(res.chunks[0].slice(6))
      assert.equal(roleEvent.model, 'deepseek-chat')
    })
  })

  describe('writeErrorResponse()', () => {
    it('should return 429 for rate-limit', () => {
      const res = mockResponse()
      writeErrorResponse({ type: 'rate-limit' }, res)

      const writeHeadCall = res.writeHead.mock.calls[0]
      assert.equal(writeHeadCall.arguments[0], 429)

      const body = JSON.parse(res.chunks[0])
      assert.equal(body.error.code, 429)
      assert.equal(body.error.type, 'rate_limit_error')
    })

    it('should return 400 for content-filter', () => {
      const res = mockResponse()
      writeErrorResponse({ type: 'content-filter' }, res)

      const writeHeadCall = res.writeHead.mock.calls[0]
      assert.equal(writeHeadCall.arguments[0], 400)
    })

    it('should return 500 for server-error', () => {
      const res = mockResponse()
      writeErrorResponse({ type: 'server-error' }, res)

      const writeHeadCall = res.writeHead.mock.calls[0]
      assert.equal(writeHeadCall.arguments[0], 500)
    })

    it('should return SSE with partial data for timeout', async () => {
      const res = mockResponse()
      writeErrorResponse({ type: 'timeout' }, res)

      // timeout writes some content then destroys after 200ms setTimeout
      assert.ok(res.chunks.length > 0)

      // wait for the setTimeout to fire
      await new Promise(r => setTimeout(r, 300))
      assert.ok(res.destroy.mock.calls.length > 0 || res.ended)
    })

    it('should return immediate [DONE] for empty', () => {
      const res = mockResponse()
      writeErrorResponse({ type: 'empty' }, res)

      const sentData = res.chunks.join('')
      assert.ok(sentData.includes('[DONE]'))
    })
  })
})
