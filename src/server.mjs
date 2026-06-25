/**
 * @file HTTP 服务器。
 *
 * 使用 Node.js 内置 http 模块启动服务器，零外部依赖。
 * 提供 POST /v1/chat/completions 端点模拟 OpenAI 流式输出。
 */

import http from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseScenarioFile, listScenarios } from './scenario-parser.mjs'
import { writeOpenAIStream, writeErrorResponse } from './openai-stream.mjs'
import { parseCliArgs } from './cli.mjs'

/**
 * @import { Scenario, CliOptions } from './types.ts'
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCENARIOS_DIR = path.join(__dirname, 'scenarios')

// 场景缓存（每次请求按需加载）
/** @type {Map<string, Scenario>} */
const scenarioCache = new Map()

/**
 * 启动服务器。
 *
 * @param {import('./types.ts').CliOptions} options
 */
export function startServer(options) {
	// 缓存场景
	preloadScenarios(options, options.scenario)

	const server = http.createServer(async (req, res) => {
		// CORS 头（对非错误响应也适用）
		setCorsHeaders(res)

		// OPTIONS 预检
		if (req.method === 'OPTIONS') {
			res.writeHead(204)
			res.end()
			return
		}

		const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
		const pathname = url.pathname

		// 健康检查
		if (req.method === 'GET' && pathname === '/health') {
			res.writeHead(200, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }))
			return
		}

		// 主页
		if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
			res.end(getIndexHtml(options))
			return
		}

		// OpenAI Chat Completions
		if (req.method === 'POST' && pathname === '/v1/chat/completions') {
			// 读取请求体
			let body = ''
			try {
				for await (const chunk of req) {
					body += chunk
				}
			} catch {
				// 忽略读取错误
			}

			// 尝试解析请求体中的 model 和 stream 参数
			let requestModel = null
			let stream = true
			if (body) {
				try {
					const parsed = JSON.parse(body)
					requestModel = parsed.model ?? null
					// stream 可以为 false，但 mock 始终返回流式
					stream = parsed.stream !== false
				} catch {
					// 非 JSON 请求体忽略
				}
			}

			// 从请求中选择场景（优先 URL query，其次 body，其次 CLI 参数）
			const scenarioName = url.searchParams.get('scenario') ?? options.scenario

			// 加载场景
			const scenario = loadScenario(scenarioName)

			if (!scenario) {
				res.writeHead(404, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ error: { message: `Scenario "${scenarioName}" not found` } }))
				return
			}

			// 如果 stream=false，返回完整 JSON 而非 SSE
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

			// 错误场景（HTTP 错误）
			if (scenario.error) {
				writeErrorResponse(scenario.error, res)
				return
			}

			// 设置 SSE 响应头
			res.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no',
			})

			// 写入流
			try {
				await writeOpenAIStream(scenario.chunks, res, {
					delay: options.delay,
					model: requestModel ?? options.model,
				})
			} catch (err) {
				// 客户端断开连接等错误不做处理
				if (!res.destroyed) {
					res.end()
				}
			}
			return
		}

		// 404
		res.writeHead(404, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify({ error: { message: 'Not Found' } }))
	})

	// 优雅关闭
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
		console.log(`\n  🚀 AI SSE Mock Server\n`)
		console.log(`  Server:    http://localhost:${port}`)
		console.log(`  Endpoint:  POST /v1/chat/completions`)
		console.log(`  Scenario:  ${options.scenario}  (use ?scenario=name to switch)`)
		console.log(`  Delay:     ${options.delay}x`)
		console.log(`\n  Press Ctrl+C to stop.\n`)
	})

	return server
}

/**
 * 加载一个场景（带缓存）。
 *
 * @param {string} name
 * @returns {Scenario | null}
 */
function loadScenario(name) {
	// 检查缓存
	const cached = scenarioCache.get(name)
	if (cached) return cached

	// 尝试从 scenarios 目录加载
	const filePath = path.join(SCENARIOS_DIR, `${name}.md`)
	try {
		const scenario = parseScenarioFile(filePath)
		scenarioCache.set(name, scenario)
		return scenario
	} catch {
		return null
	}
}

/**
 * 预加载场景到缓存。
 *
 * @param {import('./types.ts').CliOptions} options
 * @param {string} defaultScenario
 */
function preloadScenarios(options, defaultScenario) {
	const scenarios = listScenarios(SCENARIOS_DIR)
	for (const s of scenarios) {
		try {
			const scenario = parseScenarioFile(s.file)
			scenarioCache.set(s.name, scenario)
		} catch {
			// 跳过不能解析的场景
		}
	}

	if (options.list) {
		console.log('Available scenarios:\n')
		console.log('  ' + 'Name'.padEnd(25) + ' ' + 'Type'.padEnd(20) + ' Description')
		console.log('  ' + ''.padEnd(25, '─') + ' ' + ''.padEnd(20, '─') + ' ' + ''.padEnd(30, '─'))
		for (const s of scenarios) {
			const cached = scenarioCache.get(s.name)
			if (cached?.error) {
				console.log('  ' + s.name.padEnd(25) + ' ' + ('[' + cached.error.type + ']').padEnd(20) + ' ' + (cached.description || 'Simulates HTTP ' + cached.error.type + ' error'))
			} else {
				console.log('  ' + s.name.padEnd(25) + ' ' + 'normal'.padEnd(20) + ' ' + (cached?.description || ''))
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
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

/**
 * 生成主页 HTML（内置状态页，不依赖前端框架）。
 *
 * @param {import('./types.ts').CliOptions} options
 * @returns {string}
 */
function getIndexHtml(options) {
	const scenarios = listScenarios(SCENARIOS_DIR)
	const scenarioOpts = scenarios
		.map((s) => `<option value="${s.name}"${s.name === options.scenario ? ' selected' : ''}>${s.name}</option>`)
		.join('\n')

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>AI SSE Mock Server</title>
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
  <h1>AI SSE Mock Server</h1>
  <p>Simulates AI streaming responses for frontend development.</p>

  <div class="info">
    Endpoint: <code>POST http://localhost:${options.port}/v1/chat/completions</code><br>
    Use <code>?scenario=name</code> to switch scenarios via query string.
  </div>

  <div class="card">
    <label for="scenario">Scenario</label>
    <select id="scenario">${scenarioOpts}</select>

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
    const res = await fetch('/v1/chat/completions?scenario=' + scenario, {
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
