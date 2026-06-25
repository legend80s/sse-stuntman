# AI SSE Mock

> **模拟主流 AI Provider 流式接口的本地 Mock 服务器**
>
> 前端开发时，AI 接口调通了但流式输出的打字机效果无法测试？
> 一键启动 `ai-sse-mock`，无需真实 API Key，即可模拟各种场景：
> 正常的 Markdown 流式输出、表格/代码块/Mermaid 图表、HTTP 错误、超时断连……

```bash
npx ai-sse-mock
# 🚀 AI SSE Mock Server running at http://localhost:11434
```

---

## 特性 / Features

- ✨ **零依赖** — Node.js 内置 `http` 模块，即装即用
- 🎯 **OpenAI 兼容** — `POST /v1/chat/completions`，标准 SSE 格式，主流前端 SDK 直接对接
- 📝 **场景即 Markdown** — 用 `.md` 文件描述 AI 输出内容和节奏，可读可版本控制
- ⏱ **精准时序控制** — 每条消息间隔毫秒级可控，模拟真实打字机效果
- 💥 **全面错误模拟** — `429` / `400` / `500` / 超时断连 / 空响应，覆盖真实异常
- 🌐 **CORS 全开** — 浏览器直接跨域调用
- 🖥 **内置 Web UI** — 浏览器打开首页即可测试流式输出

---

## 快速开始 / Quick Start

### 直接使用（推荐）

```bash
npx ai-sse-mock
```

### 全局安装

```bash
npm install -g ai-sse-mock

ai-sse-mock --port 8080 --scenario markdown-demo
```

### 项目内安装

```bash
npm install --save-dev ai-sse-mock

# package.json scripts 中添加
# "mock": "ai-sse-mock --port 11434"
```

---

## CLI 命令 / CLI Usage

```
ai-sse-mock [options]
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--port <number>` | `11434` | 服务端口（与 Ollama 默认端口一致，可零配置切换） |
| `--scenario <name>` | `default` | 初始场景 |
| `--delay <number>` | `1` | 全局延迟倍率（`0.5` 半速，`2` 倍速） |
| `--model <name>` | `gpt-4o` | SSE 事件中的模型名 |
| `--list` | — | 列出所有内置场景 |
| `--help` / `-h` | — | 显示帮助 |

> 💡 **为什么是 11434？** [Ollama](https://ollama.com) 的默认端口就是 `11434`。
> 选择相同端口意味着你可以在 Ollama 和 `ai-sse-mock` 之间无缝切换 ——
> 前端代码不改动 URL，只需关掉一个、启动另一个。开发时用 mock，
> 联调时切回 Ollama，零成本切换。

### 示例

```bash
# 启动后访问 http://localhost:11434 在线测试
ai-sse-mock

# 查看所有内置场景
ai-sse-mock --list

# 指定场景和端口
ai-sse-mock --port 8080 --scenario markdown-demo

# 半速输出（延迟加倍，更像真人打字）
ai-sse-mock --delay 0.5

# 使用 DeepSeek 模型名
ai-sse-mock --model deepseek-chat
```

---

## 前端集成 / Frontend Integration

### curl 测试

```bash
# 流式请求（实时观察 SSE 事件输出）
curl -N -X POST http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-4o", "stream": true, "messages": [] }'

# 切换场景
curl -N -X POST "http://localhost:11434/v1/chat/completions?scenario=markdown-demo" \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-4o", "stream": true, "messages": [] }'

# 非流式请求（stream=false）
curl -s -X POST http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-4o", "stream": false, "messages": [] }' | jq .

# 测试错误场景（返回 HTTP 429）
curl -s -X POST "http://localhost:11434/v1/chat/completions?scenario=error-rate-limit" \
  -H "Content-Type: application/json" \
  -d '{ "stream": true, "messages": [] }'
```

### Fetch API (浏览器)

```js
const res = await fetch('http://localhost:11434/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: '你好' }],
    stream: true,
  }),
})
```

#### 切换场景

`POST /v1/chat/completions?scenario=markdown-demo`

#### 解析流式响应

```js
const reader = res.body.getReader()
const decoder = new TextDecoder()
let assistantMessage = ''
let buffer = ''

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

      const data = JSON.parse(jsonStr)
      const content = data.choices?.[0]?.delta?.content
      if (content) {
        assistantMessage += content
        // 更新 UI...
      }
    }
  }
}
```

### 使用 Vercel AI SDK

```ts
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

const result = streamText({
  model: openai('gpt-4o'),
  messages: [{ role: 'user', content: 'Hello' }],
  // 只需改 baseURL
  baseURL: 'http://localhost:11434/v1',
})
```

### 使用 LangChain / OpenAI SDK

```ts
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'sk-mock', // 不校验
})

const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
})

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '')
}
```

---

## 场景系统 / Scenario System

场景是 `ai-sse-mock` 的核心概念 — 每个场景是一个 `.md` 文件，描述 AI 输出的内容、节奏和错误。

### 内置场景

| 场景 | 类型 | 说明 |
|------|------|------|
| `default` | 正常 ✅ | 标准对话，markdown 列表/代码块/表格 |
| `markdown-demo` | 正常 ✅ | 完整 GFM 演示 —— diff/Mermaid/数学公式 |
| `empty` | 正常 ✅ | 直接返回 `[DONE]` |
| `error-interrupted` | 正常 ✅ | 回复到一半中断 |
| `error-malformed` | 正常 ✅ | 输出包含非法 JSON |
| `error-rate-limit` | 错误 ❌ | HTTP 429 限流 |
| `error-content-filter` | 错误 ❌ | HTTP 400 内容过滤 |
| `error-server-error` | 错误 ❌ | HTTP 500 服务器错误 |
| `error-timeout` | 错误 ❌ | 输出一段后连接断开 |

### 切换场景

```bash
# 通过 URL query
POST /v1/chat/completions?scenario=markdown-demo

# 通过 CLI 默认场景
ai-sse-mock --scenario error-rate-limit
```

### 自定义场景

场景文件就是 Markdown，通过 HTML 注释控制流式行为：

```markdown
# Code Review 结果

我来帮你审查代码。

<!-- @delay: 200 -->

| 文件 | 问题 | 严重度 |
|------|------|--------|
| `src/auth.ts` | 缺少验证 | 🔴 高 |

<!-- @delay: 150 -->
<!-- @chunk: word -->

这是逐词输出的内容。

<!-- @done -->
```

**指令一览：**

| 指令 | 示例 | 作用 |
|------|------|------|
| `@delay:N` | `<!-- @delay: 200 -->` | chunk 间隔（毫秒） |
| `@chunk:TYPE` | `<!-- @chunk: word -->` | 切分策略：`sentence`(默认) / `word` / `char` / `line` / `paragraph` |
| `@done` | `<!-- @done -->` | 在此处终止流 |
| `@error:TYPE` | `<!-- @error: rate-limit -->` | 整文件标记为错误场景 |

把你的 `.md` 文件丢进 `src/scenarios/` 目录（或自定义路径），重启即生效。

---

## 错误场景 / Error Simulation

只需一个 `@error` 指令即可模拟各种 API 错误：

```markdown
<!-- @error: rate-limit -->
```

```markdown
<!-- @error: server-error -->
```

| 错误 | HTTP | 响应 |
|------|------|------|
| `rate-limit` | `429` | JSON 错误体 + `Retry-After` 头 |
| `content-filter` | `400` | JSON 错误体 |
| `server-error` | `500` | JSON 错误体 |
| `timeout` | `200 → destroy` | 输出一段内容后断开连接 |
| `empty` | `200` | 唯一响应：`data: [DONE]` |

---

## 开发命令 / Dev Commands

```bash
# 启动服务
npm start

# 运行测试（27 个用例）
npm test

# 查看场景列表
npx ai-sse-mock --list
```

---

## 已实现功能 / Implemented ✅

### 核心服务
- [x] HTTP 服务器（零外部依赖，CORS 全开）
- [x] `POST /v1/chat/completions` — OpenAI 兼容流式接口
- [x] `GET /` — 内置 Web UI 测试页
- [x] `GET /health` — 健康检查
- [x] `OPTIONS` — CORS 预检

### SSE 流式输出
- [x] OpenAI 标准格式（`role → content → stop → [DONE]`）
- [x] 非流式支持（`stream: false` 返回完整 JSON）
- [x] 5 种切分策略：`sentence` / `word` / `char` / `line` / `paragraph`
- [x] 毫秒级延迟控制（`@delay` 指令）
- [x] 流中断模拟（`@done` 指令）

### 场景系统
- [x] Markdown 场景文件解析（`@delay` / `@chunk` / `@done` / `@error` / `@desc` 指令）
- [x] 9 个内置场景覆盖正常 / 错误 / 边界情况
- [x] `--list` 表格输出带 Name / Type / Description
- [x] 场景描述（`@desc`）帮助用户选择
- [x] URL query 切换场景（`?scenario=name`）

### 错误模拟
- [x] HTTP 429 — 限流错误
- [x] HTTP 400 — 内容过滤
- [x] HTTP 500 — 服务端错误
- [x] Timeout — 输出一段后连接断开
- [x] Empty — 仅返回 `[DONE]`
- [x] Malformed — 输出包含非法 JSON

### CLI
- [x] `--port` / `--scenario` / `--delay` / `--model` / `--list` / `--help`
- [x] 默认端口 11434（与 Ollama 一致，零成本切换）

### 工程
- [x] 零外部依赖
- [x] 27 个测试用例，`npm test` 一键验证
- [x] API 参考文档（`docs/api-reference.md`）
- [x] 场景编写指南（`docs/scenario-guide.md`）
- [x] 贡献指南（`docs/contributing.md`）

---

## 未来路线 / Roadmap 📋

| 版本 | 功能 | 优先级 |
|------|------|--------|
| **v0.2.0** | **场景增强 + 插件系统** | 🔜 下一个 |
| | 场景插件机制（`--load ./plugin.mjs`） | |
| | 变量插值（`{{input.name}}`、`{{random.uuid}}`） | |
| | 配置文件支持（`.aisemockrc.yaml`） | |
| | 更多内置场景（代码生成、function calling、多轮对话） | |
| **v0.3.0** | **多 Provider 支持** | 🔜 |
| | Anthropic Claude Messages API（`POST /v1/messages`） | |
| | Google Gemini API（`POST /v1beta/chat/completions`） | |
| | Provider 抽象层，统一适配器接口 | |
| **v0.5.0** | **录播 + Proxy 模式** | 🔜 |
| | `--record` — 录制真实 API 响应为场景文件 | |
| | `--proxy` — 透传到真实 Provider，可选注入延迟/错误 | |
| **v1.0.0** | **稳定版** | 🎯 |
| | Web UI 控制台（可视化选择场景、实时流预览） | |
| | OpenAPI 规范导出 | |
| | Docker 镜像发布 | |

> 完整规划见 [TODO.md](TODO.md) 或 [docs/roadmap.md](docs/roadmap.md)

---

## 为什么做这个工具？/ Why This Tool？

**痛点：** 前端开发 AI Chat 界面时，后端的 AI 接口可能还没就绪，或者需要真实的 API Key、有调用次数限制。但我们需要测试：

- 流式输出的打字机动画是否顺滑
- 表格 / 代码块 / Mermaid 图表的渲染是否正确
- 各种异常情况（限流、超时、中断）的 UI 表现

**解决方案：** 一个本地 mock 服务器，模拟主流 AI Provider 的流式接口。把你想让 AI 说的内容写到 `.md` 文件里，通过指令控制输出节奏，剩下的交给 `ai-sse-mock`。

---

## License

MIT &copy; 2026 [legend80s](https://github.com/legend80s)
