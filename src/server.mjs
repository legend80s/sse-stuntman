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

import http from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { parseScenarioFile, listScenarios } from './scenario-parser.mjs'
import { writeOpenAIStream, writeErrorResponse } from './openai-stream.mjs'
import { getUserScenariosDir } from './commands/create-scenario.mjs'

/**
 * @import { Scenario, CliOptions } from './types.ts'
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BUILTIN_DIR = path.join(__dirname, 'scenarios')

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

  const endpointPaths = options.endpointPaths ?? ['/v1/chat/completions']

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const pathname = url.pathname

    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }))
      return
    }

    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(getIndexHtml(options, scenarioDirs))
      return
    }

    if (req.method === 'POST' && endpointPaths.includes(pathname)) {
      let body = ''
      try {
        for await (const chunk of req) {
          body += chunk
        }
      } catch { /* ignore */ }

      let requestModel = null
      let stream = true
      if (body) {
        try {
          const parsed = JSON.parse(body)
          requestModel = parsed.model ?? null
          stream = parsed.stream !== false
        } catch { /* ignore */ }
      }

      const scenarioName = url.searchParams.get('scenario') ?? options.scenario
      const scenario = loadScenario(scenarioName, scenarioDirs, options.defaultDelay)

      if (!scenario) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: `Scenario "${scenarioName}" not found` } }))
        return
      }

      if (!stream) {
        const fullContent = scenario.chunks.map((c) => c.content).join('')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: requestModel ?? options.model,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: fullContent },
                finish_reason: 'stop',
              },
            ],
          }),
        )
        return
      }

      if (scenario.error) {
        writeErrorResponse(scenario.error, res)
        return
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      try {
        await writeOpenAIStream(scenario.chunks, res, {
          delay: options.delay,
          model: requestModel ?? options.model,
        })
      } catch {
        if (!res.destroyed) res.end()
      }
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'Not Found' } }))
  })

  const shutdown = () => {
    server.close(() => {
      console.log('\nServer shut down.')
      process.exit(0)
    })
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  const port = options.port
  server.listen(port, () => {
    console.log(`\n  🏍️  SSE Stuntman — server ready\n`)
    console.log(`  Server:    http://localhost:${port}`)
    console.log(`  Endpoint(s): POST ${endpointPaths.join(', POST ')}`)
    console.log(`  Scenario:  ${options.scenario}  (use ?scenario=name to switch)`)
    const baseDelay = options.defaultDelay ?? 5
    console.log(`  Delay:     ${options.delay}x  (multiplier — each @delay in scenario is multiplied by this)`)
    console.log(`  Default:   ${baseDelay}ms  (used when scenario has no @delay)`)
    if (options.delay !== 1) {
      console.log(`             effective: ${options.delay * baseDelay}ms`)
    }
    console.log(`\n  Press Ctrl+C to stop.\n`)
  })

  return server
}

/**
 * 在多个目录中查找场景（优先级：先找到的为准）。
 *
 * @param {string} name
 * @param {string[]} dirs
 * @param {number} [defaultDelay]
 * @returns {Scenario | null}
 */
function loadScenario(name, dirs, defaultDelay) {
  const cached = scenarioCache.get(name)
  if (cached) return cached

  for (const dir of dirs) {
    const filePath = path.join(dir, `${name}.md`)
    try {
      if (fs.existsSync(filePath)) {
        const scenario = parseScenarioFile(filePath, defaultDelay != null ? { defaultDelay } : undefined)
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
          const scenario = parseScenarioFile(s.file, options.defaultDelay != null ? { defaultDelay: options.defaultDelay } : undefined)
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
    console.log('\n  Available scenarios:\n')
    console.log('  ' + 'Name'.padEnd(25) + ' ' + 'Source'.padEnd(22) + ' Description')
    console.log('  ' + ''.padEnd(25, '─') + ' ' + ''.padEnd(22, '─') + ' ' + ''.padEnd(30, '─'))
    for (const dir of dirs) {
      try {
        const scenarios = listScenarios(dir)
        for (const s of scenarios) {
          if (seen.has(s.name)) continue
          seen.add(s.name)
          const cached = scenarioCache.get(s.name)
          const source = dir === BUILTIN_DIR ? 'builtin' : 'custom'
          if (cached?.error) {
            console.log('  ' + s.name.padEnd(25) + ' ' + (source + ' [' + cached.error.type + ']').padEnd(22) + ' ' + (cached.description || 'Simulates HTTP ' + cached.error.type + ' error'))
          } else {
            console.log('  ' + s.name.padEnd(25) + ' ' + source.padEnd(22) + ' ' + (cached?.description || ''))
          }
        }
      } catch { /* skip */ }
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
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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
        if (seen.has(s.name)) continue
        seen.add(s.name)
        scenarioOpts.push(`<option value="${s.name}"${s.name === options.scenario ? ' selected' : ''}>${s.name}</option>`)
      }
    } catch { /* skip */ }
  }

  const eps = options.endpointPaths ?? ['/v1/chat/completions']
  const ep = eps[0]

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>SSE Stuntman</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; padding: 40px; }
  .container { max-width: 800px; margin: 0 auto; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  p { color: #666; margin-bottom: 24px; }
  .card { background: white; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); padding: 24px; margin-bottom: 16px; }
  label { display: block; font-weight: 600; margin-bottom: 6px; }
  select, input { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; margin-bottom: 16px; }
  button { background: #0070f3; color: white; border: none; padding: 10px 24px; border-radius: 4px; font-size: 14px; cursor: pointer; }
  button:hover { background: #0051a8; }
  pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 4px; overflow-x: auto; font-size: 13px; min-height: 200px; white-space: pre-wrap; word-break: break-word; }
  .info { background: #eef2ff; border-left: 4px solid #6366f1; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #4338ca; margin-bottom: 16px; }
  code { background: #e8e8e8; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
</style>
</head>
<body>
<div class="container">
  <h1>🏍️  SSE Stuntman</h1>
  <p>Stunt double for your AI API — simulate streaming responses.</p>

  <div class="info">
    Endpoint: <code>POST http://localhost:${options.port}${ep}</code><br>
    Use <code>?scenario=name</code> to switch scenarios.
  </div>

  <div class="card">
    <label for="scenario">Scenario</label>
    <select id="scenario">${scenarioOpts.join('\n')}</select>

    <label for="model">Model</label>
    <input id="model" type="text" value="${options.model}" placeholder="gpt-4o">

    <button onclick="testStream()">Test Stream</button>
  </div>

  <div class="card">
    <pre id="output">Click "Test Stream" to see the response...</pre>
  </div>
</div>

<script>
async function testStream() {
  const output = document.getElementById('output');
  const scenario = document.getElementById('scenario').value;
  const model = document.getElementById('model').value;

  output.textContent = 'Connecting...';

  try {
    const res = await fetch('${ep}?scenario=' + scenario, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: 'Hello' }] })
    });

    if (!res.ok) {
      const err = await res.json();
      output.textContent = 'HTTP ' + res.status + '\\n' + JSON.stringify(err, null, 2);
      return;
    }

    output.textContent = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const data = JSON.parse(jsonStr);
            const content = data.choices?.[0]?.delta?.content || '';
            output.textContent += content;
          } catch {}
        }
      }
    }
  } catch (e) {
    output.textContent = 'Error: ' + e.message;
  }
}
</script>
</body>
</html>`
}
