# API 参考 / API Reference

> sse-stuntman 的 CLI 参数和服务端接口文档。
> CLI options and server endpoint reference.

---

## CLI 参数参考 / CLI Options

```
sse-stuntman [options]
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--port` | number | `11434` | 服务器端口，范围 1-65535 |
| `--scenario` | string | `"default"` | 初始场景名，可被 URL query 覆盖 |
| `--delay` | number | `1` | 全局延迟倍率。`0.5`=半速，`2`=倍速 |
| `--model` | string | `"gpt-4o"` | SSE 事件中 `model` 字段的默认值 |
| `--endpoint-path` / `-e` | string | `"/v1/chat/completions"` | 自定义 POST 端点路径（可多次指定，如 `-e /a -e /b`） |
| `--list` | boolean | — | 列出所有内置场景并退出 |
| `--help` / `-h` | boolean | — | 显示帮助文本并退出 |

### 配置文件 / Config File

通过 `~/.sse-stuntman/config.mjs` 持久化配置：

```js
export default {
  port: 8080,
  scenario: 'my-scenario',
  delay: 0.5,
  model: 'deepseek-chat',
  endpointPaths: ['/chat/api', '/api/v2/chat'],  // 支持多路径
  scenariosDir: '/path/to/scenarios',
}
```

**优先级**：CLI 参数 > 配置文件 > 内置默认值

### 使用示例 / Examples

```bash
# 默认启动 (port 11434, scenario: default)
sse-stuntman

# 自定义端口和场景
sse-stuntman --port 8080 --scenario markdown-demo

# 半速输出 + 指定模型名
sse-stuntman --delay 0.5 --model deepseek-chat

# 查看可用场景
sse-stuntman --list

# 查看帮助
sse-stuntman --help

# 自定义端点路径
sse-stuntman --endpoint-path /management-service/api/intelligent-qa/chat

# 多个端点路径（同时 mock 多个 URL）
sse-stuntman -e /api/v1/chat -e /api/v2/chat
```

### 通过 npx 直接使用

```bash
npx sse-stuntman --port 11434
```

---

## HTTP 接口 / HTTP Endpoints

### POST <endpoint-path>（默认 /v1/chat/completions）

模拟 OpenAI Chat Completions 流式接口。端点路径可通过 `--endpoint-path` CLI 参数自定义。

#### 请求头

| 头 | 值 | 必填 |
|---|-----|------|
| `Content-Type` | `application/json` | 是 |
| `Authorization` | `Bearer <任意值>` | 否（mock 不校验） |

#### 请求体

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "你好" }
  ],
  "stream": true
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 否 | 覆盖 SSE 事件中的 `model` 字段 |
| `messages` | array | 否 | 注意：mock 当前忽略 messages 内容，仅记录 |
| `stream` | boolean | 否 | `false` 时返回完整 JSON 而非 SSE（默认 `true`） |

#### 场景选择 / Scenario Selection

场景优先级：URL query > CLI 参数

```
POST /v1/chat/completions?scenario=markdown-demo
```

未指定时使用 `--scenario` CLI 参数的值。可通过 `--endpoint-path` 自定义端点路径。

#### 流式响应 (stream: true)

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
Access-Control-Allow-Origin: *
```

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1718000000,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1718000000,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1718000000,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

SSE 事件顺序：

1. **role chunk** — `delta.role: "assistant"`，表示 AI 开始回复
2. **content chunks** — 0 到多个，`delta.content` 包含文本内容
3. **finish chunk** — `delta: {}`, `finish_reason: "stop"`，表示流结束
4. **terminator** — `data: [DONE]`

#### 非流式响应 (stream: false)

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1718000000,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "# 标题\n\n完整内容合并为一段。"
      },
      "finish_reason": "stop"
    }
  ]
}
```

#### 错误响应

**rate-limit** — HTTP 429
```json
{
  "error": {
    "message": "Rate limit exceeded. Please wait and retry.",
    "type": "rate_limit_error",
    "code": 429
  }
}
```

**content-filter** — HTTP 400
```json
{
  "error": {
    "message": "The response was filtered due to content policy.",
    "type": "content_filter",
    "code": 400
  }
}
```

**server-error** — HTTP 500
```json
{
  "error": {
    "message": "Internal server error.",
    "type": "server_error",
    "code": 500
  }
}
```

**timeout** — HTTP 200，输出一段内容后断开连接
```
data: {"delta":{"content":"正在处理您的请求"}}
```
（连接中断，无 `[DONE]`）

**empty** — HTTP 200，立即返回终止
```
data: [DONE]
```

---

### GET /health

健康检查。

```json
// HTTP 200
{ "status": "ok", "uptime": 123.45 }
```

### GET /

HTML 主页，包含内置测试 UI：选择场景、输入模型名、点击"Test Stream"直接观察流式输出。

### OPTIONS *

CORS 预检响应。

```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## 前端集成示例 / Frontend Integration

### 浏览器端 (Fetch API)

```js
async function testStream(scenario = 'default') {
  const res = await fetch(`http://localhost:11434/v1/chat/completions?scenario=${scenario}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o', stream: true }),
  })

  if (!res.ok) {
    const err = await res.json()
    console.error('Error:', err)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim()
        if (jsonStr === '[DONE]') continue
        try {
          const data = JSON.parse(jsonStr)
          const content = data.choices?.[0]?.delta?.content || ''
          result += content
          console.log('Received:', content)
        } catch { /* ignore malformed */ }
      }
    }
  }

  return result
}
```

### Node.js

```js
import http from 'node:http'

const body = JSON.stringify({
  model: 'gpt-4o',
  stream: true,
  messages: [{ role: 'user', content: 'Hello' }],
})

const req = http.request({
  hostname: 'localhost',
  port: 11434,
  path: '/v1/chat/completions?scenario=default',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
})

req.write(body)
req.end()

req.on('response', (res) => {
  console.log('Status:', res.statusCode)
  res.on('data', (chunk) => process.stdout.write(chunk.toString()))
})
```
