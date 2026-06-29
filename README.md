```
         ╱▔▔▔▔╲
        ╱      ╲     🏍️  SSE Stuntman
       ╱   🏍️   ╲    ~~~~ 特技替身
      ╱   ╱╲    ╲   ~~~~ >>> data: {...}
     ╱   ╱  ╲    ╲  ~~~~ >>> [DONE]
    ╱   ╱    ╲    ╲
   ╱▔▔▔▔▔▔▔▔▔▔▔▔▔▔╲
  ╱        ░░░░      ╲
 ╱   429 │ 500 │ 400  ╲
╱─────────────────────────╲
```

# SSE Stuntman 🏍️

> **特技替身 (Stuntman) — 替真实 AI API 完成"危险"的测试任务**
>
> 前端开发时，AI 接口调通了但流式输出的打字机效果无法测试？
> 一键启动 `sse-stuntman`，无需真实 API Key，即可模拟各种场景：
> 正常的 Markdown 流式输出、表格/代码块/Mermaid 图表、HTTP 错误、超时断连……

```bash
npx sse-stuntman
# 🏍️  SSE Stuntman — server ready at http://localhost:11434
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
- 📂 **自定义场景** — 在 `~/.sse-stuntman/scenarios/` 放 `.md` 文件自动生效
- 🎤 **自定义输入** — 把请求消息内容注入场景流，用 `@input` 指令让静态场景"活"起来

## 快速开始 / Quick Start

### 直接使用（推荐）

```bash
npx sse-stuntman
```

### 全局安装

```bash
npm install -g sse-stuntman
```

### 项目内安装

```bash
npm install --save-dev sse-stuntman

# package.json scripts 中添加
# "mock": "sse-stuntman --port 11434"
```

### 使用

假设有一个 `POST http://localhost:9095/management-service/api/intelligent-qa/chat` SSE 请求，期待返回 OpenAI 标准格式的 Markdown 流式输出，前端想测试该接口：

```bash
npx sse-stuntman --port 9095 --endpoint-path 'management-service/api/intelligent-qa/chat'
```

这样就开启了一个 SSE 请求模拟服务，你可以直接在你的代码中发起请求。可先试试 curl 看看是否输出了你预期的格式:

```bash
curl -N -X POST http://localhost:9095/management-service/api/intelligent-qa/chat \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-5.5", "stream": true, "messages": [] }'
```

## CLI 命令 / CLI Usage

```
sse-stuntman [options]
sse-stuntman create-scenario <name>
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--port <number>` | `11434` | 服务端口（与 Ollama 一致，可零成本切换） |
| `--scenario <name>` | `default` | 初始场景 |
| `--delay-multiplier <number>` | `1` | 全局延迟倍率（`0.5` 半速，`2` 倍速） |
| `--default-delay <number>` / `-d` | `5` | 场景内无 `@delay` 时的默认 chunk 间隔（毫秒） |
| `--model <name>` | `gpt-4o` | SSE 事件中的模型名 |
| `--endpoint-path <path>` / `-e` | `/v1/chat/completions` | 自定义 POST 端点路径，可多次指定支持多路径（如 `-e /chat -e /api/chat`） |
| `--provider <name>` | `openai` | 输出格式：`openai`（Chat Completions SSE）或 `anthropic`（Messages SSE） |
| `--chunk-strategy <name>` | `word` | 文本切分策略：`word` / `sentence` / `char` / `line` / `paragraph` |
| `--scenarios-dir <path>` | — | 自定义场景目录（覆盖默认路径） |
| `--list` | — | 列出所有内置 + 自定义场景 |
| `create-scenario <name>` | — | 创建新场景模板 |
| `--help` / `-h` | — | 显示帮助 |

> 💡 **为什么是 11434？** [Ollama](https://ollama.com) 的默认端口就是 `11434`。
> 选择相同端口意味着你可以在 Ollama 和 `sse-stuntman` 之间无缝切换 —
> 前端代码不改动 URL，只需关掉一个、启动另一个。开发时用 mock，
> 联调时切回 Ollama，零成本切换。

### 示例

```bash
# 启动服务
sse-stuntman

# 查看所有场景
sse-stuntman --list

# 创建自定义场景
sse-stuntman create-scenario my-code-review

# 使用自定义场景
sse-stuntman --scenario my-code-review

# 半速输出
sse-stuntman --delay-multiplier 0.5

# 自定义端点路径（用于无法修改代码的客户端）
sse-stuntman --endpoint-path /management-service/api/intelligent-qa/chat

# 多个端点路径（同时 mock 多个 URL）
sse-stuntman -e /api/v1/chat -e /api/v2/chat -e /chat
```

---

## 自定义场景 / Custom Scenarios

### 方式一：create-scenario 子命令（推荐）

```bash
sse-stuntman create-scenario review
# ✅ 场景已创建！
# 继续编辑: ~/.sse-stuntman/scenarios/review.md
# (自动打开目录)
```

### 方式二：手动创建文件

在 `~/.sse-stuntman/scenarios/` 目录下放任意 `.md` 文件即可：

```bash
echo '<!-- @desc: 我的场景 -->' > ~/.sse-stuntman/scenarios/my-scenario.md
```

### 场景文件格式

```markdown
<!-- @desc: Code Review 场景 -->
# Code Review

我来帮你审查代码。

<!-- @delay: 200 -->

| 文件 | 问题 | 严重度 |
|------|------|--------|
| `src/auth.ts` | 缺少验证 | 🔴 高 |

<!-- @delay: 150 -->

这是逐词输出的内容（通过 `--chunk-strategy word` 启用）。

<!-- @done -->
```

**指令一览：**

| 指令 | 示例 | 作用 |
|------|------|------|
| `@delay:N` | `<!-- @delay: 200 -->` | chunk 间隔（毫秒） |
| `@desc:TEXT` | `<!-- @desc: 描述 -->` | 场景描述（`--list` 显示） |
| `@done` | `<!-- @done -->` | 在此处终止流 |
| `@error:TYPE` | `<!-- @error: rate-limit -->` | 整文件标记为错误场景 |
| `@input` | `<!-- @input -->` | 占位符，请求时替换为最后一条用户消息内容 |

### 场景加载顺序

```
1. --scenarios-dir 指定目录    (显式指定，最高优先级)
2. ~/.sse-stuntman/scenarios/  (用户全局场景)
3. 内置场景                    (fallback)
```

同名场景，高优先级覆盖低优先级。

---

## 配置文件 / Config File

通过 `~/.sse-stuntman/config.mjs` 持久化配置，免去每次启动传参。

```js
export default {
  port: 8080,
  scenario: 'my-scenario',
  delay: 0.5,
  model: 'deepseek-chat',
  endpointPaths: ['/management-service/api/intelligent-qa/chat', '/api/v2/chat'],
  scenariosDir: '/path/to/scenarios',
}
```

**优先级：** CLI 参数 > 配置文件 > 内置默认值

---

## 前端集成 / Frontend Integration

### curl 测试

```bash
# 流式请求
curl -N -X POST http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-4o", "stream": true, "messages": [] }'

# 切换场景
curl -N -X POST "http://localhost:11434/v1/chat/completions?scenario=markdown-demo" \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-4o", "stream": true, "messages": [] }'

# 非流式
curl -s -X POST http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-4o", "stream": false, "messages": [] }' | jq .
```

### Fetch API (浏览器)

```js
const res = await fetch('http://localhost:11434/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-4o', messages: [], stream: true }),
})
```

### Vercel AI SDK

```ts
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

const result = streamText({
  model: openai('gpt-4o'),
  messages: [{ role: 'user', content: 'Hello' }],
  baseURL: 'http://localhost:11434/v1',
})
```

### OpenAI SDK

```ts
import OpenAI from 'openai'
const client = new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'sk-mock' })
const stream = await client.chat.completions.create({ model: 'gpt-4o', messages: [], stream: true })
```

---

## 内置场景 / Built-in Scenarios

| 场景 | 说明 |
|------|------|
| `default` | 标准对话，markdown 列表/代码块/表格 |
| `markdown-demo` | 完整 GFM 演示 — diff/Mermaid/数学公式 |
| `echo` | 将请求中最后一条用户消息内容作为 SSE 流式输出返回 |
| `empty` | 直接返回 `[DONE]` |
| `error-interrupted` | 回复到一半中断 |
| `error-malformed` | 输出包含非法 JSON |
| `error-rate-limit` | HTTP 429 限流 |
| `error-content-filter` | HTTP 400 内容过滤 |
| `error-server-error` | HTTP 500 服务器错误 |
| `error-timeout` | 输出一段后连接断开 |

---

## `@input` 指令：让静态场景"活"起来

`@input` 是一个**位置占位符指令**，可以在任意 `.md` 场景文件的任意位置插入 `<!-- @input -->`。请求处理时，它会被替换为请求体中最后一条 `role: "user"` 消息的内容。

### 为什么需要 `@input`？

内置场景的输出内容都是固定的。前端测试时，希望看到**自己的输入内容**被流式返回，而非预设的示例文本。`@input` 的出现解决两个问题：

1. **自定义测试** — 把自己的 markdown 内容发给后端，看它如何被渲染成 SSE 流
2. **混合场景** — 在预设场景的上下文中间插入用户输入，让对话更真实

### 纯回显：echo 场景

内置的 `echo` 场景只有一行指令：

```markdown
<!-- @delay: 30 -->
<!-- @input -->
```

请求时自动将最后一条用户消息逐词流式返回：

```bash
curl -N -X POST "http://localhost:11434/v1/chat/completions?scenario=echo" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "# Hello\n\nYour **markdown** here"}]
  }'
# → 逐词流式输出 "# Hello\n\nYour **markdown** here"
```

### 混合示例：静态 + 动态

自定义场景文件 `interview.md`：

```markdown
欢迎！我来回答你的问题。

<!-- @delay: 200 -->

<!-- @input -->

<!-- @delay: 150 -->

以上是我的回答，有疑问请继续。
```

请求时 `@input` 展开为用户消息内容，得到 `"欢迎！...<用户消息>...以上是我的回答"` 的完整流。

---

## 开发命令 / Dev Commands

```bash
# 启动服务
npm start

# 运行测试（74 个用例）
npm test

# 查看场景列表
npx sse-stuntman --list
```

---

## License

MIT &copy; 2026 [legend80s](https://github.com/legend80s)
