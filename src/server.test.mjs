/**
 * @file server 集成测试
 *
 * 使用 Node.js http 模块直接发送请求测试服务器。
 * 每个测试用例启动/停止独立服务器实例。
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { startServer } from './server.mjs'

/**
 * 向指定服务器发送请求并获取响应（字符串模式）。
 */
function request(server, options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', ...options, ...(server.address?.() ?? {}) },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk.toString() })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
      },
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

/**
 * 向指定服务器发送请求并获取 SSE 事件流。
 */
function sseRequest(server, options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', ...options, ...(server.address?.() ?? {}) },
      (res) => {
        const events = []
        let buffer = ''
        let finished = false
        res.on('data', (chunk) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              events.push(data)
              if (data === '[DONE]') finished = true
            }
          }
        })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, events, finished }))
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function getPort() {
  return 20000 + Math.floor(Math.random() * 10000)
}

describe('server', () => {
  describe('/v1/chat/completions (streaming)', () => {
    it('should return SSE with content chunks and [DONE]', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default' })

      // wait for server to be ready
      await new Promise(resolve => server.on('listening', resolve))
      // small yield for any pending init
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status, events, finished } = await sseRequest(server, {
          method: 'POST',
          path: '/v1/chat/completions',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], stream: true }))

        assert.equal(status, 200)
        assert.ok(events.length > 2) // role + at least 1 content + [DONE]
        assert.ok(finished)
        // first event should be the role announcement
        const first = JSON.parse(events[0])
        assert.equal(first.choices[0].delta.role, 'assistant')
        // last before [DONE] should have content
        const contentEvents = events.filter(e => e !== '[DONE]' && JSON.parse(e).choices[0].delta.content)
        assert.ok(contentEvents.length > 0)
      } finally {
        server.close()
      }
    })

    it('should respect ?scenario= query parameter', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default' })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status, events } = await sseRequest(server, {
          method: 'POST',
          path: '/v1/chat/completions?scenario=empty',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))

        assert.equal(status, 200)
        // empty scenario should start with role, maybe content, then [DONE]
        assert.ok(events.some(e => e === '[DONE]'))
      } finally {
        server.close()
      }
    })

    it('should return 404 for unknown scenario', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default' })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status, body } = await request(server, {
          method: 'POST',
          path: '/v1/chat/completions?scenario=nonexistent',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))

        assert.equal(status, 404)
        const parsed = JSON.parse(body)
        assert.ok(parsed.error)
      } finally {
        server.close()
      }
    })

    it('should return 429 for error-rate-limit scenario', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default' })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status } = await request(server, {
          method: 'POST',
          path: '/v1/chat/completions?scenario=error-rate-limit',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))

        assert.equal(status, 429)
      } finally {
        server.close()
      }
    })
  })

  describe('/v1/chat/completions (non-streaming)', () => {
    it('should return full JSON when stream=false', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default' })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status, body } = await request(server, {
          method: 'POST',
          path: '/v1/chat/completions?scenario=default',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: false }))

        assert.equal(status, 200)
        const parsed = JSON.parse(body)
        assert.equal(parsed.object, 'chat.completion')
        assert.ok(parsed.choices[0].message.content.length > 0)
        assert.equal(parsed.choices[0].finish_reason, 'stop')
      } finally {
        server.close()
      }
    })
  })

  describe('/health', () => {
    it('should return ok status', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default' })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status, body } = await request(server, { method: 'GET', path: '/health' })
        assert.equal(status, 200)
        const parsed = JSON.parse(body)
        assert.equal(parsed.status, 'ok')
      } finally {
        server.close()
      }
    })
  })

  describe('/', async () => {
    it('should return HTML page', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default' })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status, body, headers } = await request(server, { method: 'GET', path: '/' })
        assert.equal(status, 200)
        assert.ok(headers['content-type'].includes('text/html'))
        assert.ok(body.includes('SSE Stuntman'))
      } finally {
        server.close()
      }
    })
  })

  describe('custom endpoint path', () => {
    it('should handle POST to custom endpoint path', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default', endpointPaths: ['/my-custom/path'] })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status, events, finished } = await sseRequest(server, {
          method: 'POST',
          path: '/my-custom/path',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], stream: true }))

        assert.equal(status, 200)
        assert.ok(events.length > 2)
        assert.ok(finished)
      } finally {
        server.close()
      }
    })

    it('should return 404 for default path when custom path is set', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default', endpointPaths: ['/my-custom/path'] })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status } = await request(server, {
          method: 'POST',
          path: '/v1/chat/completions',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))

        assert.equal(status, 404)
      } finally {
        server.close()
      }
    })

    it('should handle ?scenario= query with custom endpoint path', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default', endpointPaths: ['/my-custom/path'] })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status, events } = await sseRequest(server, {
          method: 'POST',
          path: '/my-custom/path?scenario=empty',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))

        assert.equal(status, 200)
        assert.ok(events.some(e => e === '[DONE]'))
      } finally {
        server.close()
      }
    })

    it('should handle error scenario with custom endpoint path', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default', endpointPaths: ['/my-custom/path'] })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status } = await request(server, {
          method: 'POST',
          path: '/my-custom/path?scenario=error-rate-limit',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))

        assert.equal(status, 429)
      } finally {
        server.close()
      }
    })

    it('should handle multiple endpoint paths', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default', endpointPaths: ['/api/v1/chat', '/api/v2/chat'] })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        // Both paths should return SSE
        const r1 = await sseRequest(server, {
          method: 'POST', path: '/api/v1/chat',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))
        assert.equal(r1.status, 200)
        assert.ok(r1.finished)

        const r2 = await sseRequest(server, {
          method: 'POST', path: '/api/v2/chat',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))
        assert.equal(r2.status, 200)
        assert.ok(r2.finished)

        // Default path should return 404
        const r3 = await request(server, {
          method: 'POST', path: '/v1/chat/completions',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))
        assert.equal(r3.status, 404)
      } finally {
        server.close()
      }
    })
  })

  describe('CORS', () => {
    it('should return CORS headers on OPTIONS', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default' })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status, headers } = await request(server, { method: 'OPTIONS', path: '/v1/chat/completions' })
        assert.equal(status, 204)
        assert.equal(headers['access-control-allow-origin'], '*')
      } finally {
        server.close()
      }
    })
  })

  describe('custom scenarios (--scenarios-dir)', () => {
    /** @type {string} */
    let customDir

    before(() => {
      customDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sse-custom-scenarios-'))
      // 自定义场景：普通流式
      fs.writeFileSync(path.join(customDir, 'custom-chat.md'),
        '<!-- @desc: 自定义对话场景 -->\n# Custom Chat\n\n这是自定义场景的内容。\n\n<!-- @delay: 50 -->\n\n第二段内容。',
        'utf-8',
      )
      // 自定义错误场景
      fs.writeFileSync(path.join(customDir, 'custom-error.md'),
        '<!-- @error: content-filter -->',
        'utf-8',
      )
      // 空场景
      fs.writeFileSync(path.join(customDir, 'custom-empty.md'),
        '# Empty\n',
        'utf-8',
      )
    })

    after(() => {
      fs.rmSync(customDir, { recursive: true, force: true })
    })

    it('should serve a custom scenario from --scenarios-dir', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default', scenariosDir: customDir })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status, events, finished } = await sseRequest(server, {
          method: 'POST',
          path: '/v1/chat/completions?scenario=custom-chat',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], stream: true }))

        assert.equal(status, 200)
        assert.ok(events.length > 2)
        assert.ok(finished)

        const contentEvents = events
          .filter(e => e !== '[DONE]')
          .map(e => JSON.parse(e).choices[0].delta.content)
          .filter(Boolean)
        const fullText = contentEvents.join('')
        assert.ok(fullText.includes('自定义场景'))
      } finally {
        server.close()
      }
    })

    it('should serve a custom error scenario from --scenarios-dir', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default', scenariosDir: customDir })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status } = await request(server, {
          method: 'POST',
          path: '/v1/chat/completions?scenario=custom-error',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))

        assert.equal(status, 400) // content-filter → 400
      } finally {
        server.close()
      }
    })

    it('should serve a custom scenario as default when --scenario points to it', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'custom-empty', scenariosDir: customDir })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status, events, finished } = await sseRequest(server, {
          method: 'POST',
          path: '/v1/chat/completions',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))

        assert.equal(status, 200)
        assert.ok(finished)
      } finally {
        server.close()
      }
    })

    it('should serve builtin scenarios as fallback when scenario not found in custom dir', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default', scenariosDir: customDir })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        // "empty" 是内置场景，customDir 中没有，应 fallback 到内置
        const { status, events, finished } = await sseRequest(server, {
          method: 'POST',
          path: '/v1/chat/completions?scenario=empty',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))

        assert.equal(status, 200)
        assert.ok(finished)
      } finally {
        server.close()
      }
    })
  })

  describe('custom scenario overriding builtin scenario', () => {
    /** @type {string} */
    let customDir

    before(() => {
      customDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sse-override-'))
      // 覆盖内置 "empty" 场景
      fs.writeFileSync(path.join(customDir, 'empty.md'),
        '<!-- @desc: 覆盖的内置场景 -->\n# Override\n\n这是覆盖版本。',
        'utf-8',
      )
    })

    after(() => {
      fs.rmSync(customDir, { recursive: true, force: true })
    })

    it('should prefer custom scenario over builtin with same name', async () => {
      const port = getPort()
      const server = startServer({ port, delay: 0, model: 'gpt-4o', scenario: 'default', scenariosDir: customDir })
      await new Promise(resolve => server.on('listening', resolve))
      await new Promise(r => setTimeout(r, 50))

      try {
        const { status, events, finished } = await sseRequest(server, {
          method: 'POST',
          path: '/v1/chat/completions?scenario=empty',
          headers: { 'Content-Type': 'application/json' },
        }, JSON.stringify({ model: 'gpt-4o', stream: true }))

        assert.equal(status, 200)
        assert.ok(finished)

        // 内容应该是覆盖版的 "这是覆盖版本"，而不是内置版的空内容
        const contentEvents = events
          .filter(e => e !== '[DONE]')
          .map(e => JSON.parse(e).choices[0].delta.content)
          .filter(Boolean)
        const fullText = contentEvents.join('')
        assert.ok(fullText.includes('覆盖版本'), `Expected override content, got: "${fullText}"`)
      } finally {
        server.close()
      }
    })
  })
})
