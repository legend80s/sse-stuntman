# 架构设计 / Architecture

> 本文档描述 ai-sse-mock 的模块划分、数据流和核心类型。
> Architecture overview: modules, data flow, core types.

---

## 总体架构 / Overview

```
CLI 参数 (--port / --scenario / --delay / --model)
    │
    ▼
┌─────────────┐    ┌──────────────────┐    ┌────────────────┐
│  cli.mjs    │───▶│   server.mjs     │───▶│ openai-stream  │
│  (argparse) │    │  (HTTP server)   │    │   .mjs         │
└─────────────┘    │                  │    │  (SSE writer)  │
                   │  POST /v1/chat/  │    └────────────────┘
                   │  completions     │
                   │  GET /           │
                   │  GET /health     │
                   └──────┬───────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │  scenario-parser.mjs │
              │  (.md → Chunk[])     │
              └──────────────────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │  scenarios/*.md      │
              │  (场景文件)          │
              └──────────────────────┘
```

### 设计原则 / Design Principles

- **零外部依赖**：仅使用 Node.js 内置 `http`、`fs`、`path` 模块，`npm install` 即用
- **场景即文档**：场景文件本身是 Markdown，可通过 `<!-- @指令 -->` 控制流式行为
- **渐进式 Provider**：当前实现 OpenAI 格式（生态最广），预留 Provider 抽象层后续扩展
- **可测试**：每个模块有独立 `.test.mjs`，`npm test` 一键验证

---

## 模块说明 / Modules

### cli.mjs — CLI 参数解析

解析命令行参数，返回 `CliOptions` 对象。纯函数，无副作用。

```
--port <number>      端口号                    (默认: 11434)
--scenario <name>    场景名                    (默认: "default")
--delay <number>     全局延迟倍率              (默认: 1)
--model <name>       SSE 事件的 model 字段     (默认: "gpt-4o")
--list               列出所有内置场景并退出
--help / -h          帮助信息
```

> 参考：[CLI 参数参考](api-reference.md#cli-参数参考)

### server.mjs — HTTP 服务器

使用 Node.js `http.createServer` 启动服务器，路由：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/` | HTML 主页（内置测试 UI） |
| `GET` | `/health` | 健康检查 |
| `POST` | `/v1/chat/completions` | OpenAI Chat Completions |
| `OPTIONS` | `*` | CORS 预检 |

流式请求处理流程：

```
1. 解析请求体 → 提取 model / stream 参数
2. 选择场景（URL query > 请求体 > CLI 默认）
3. 加载 .md 场景文件 → 解析为 Chunk[]
4. 错误场景 → writeErrorResponse() → HTTP 错误返回
5. 正常场景 → writeOpenAIStream() → SSE 流输出
```

场景选择优先级：`POST /v1/chat/completions?scenario=xxx` > 请求体中无字段 > CLI `--scenario`

### scenario-parser.mjs — 场景解析器

将 `.md` 场景文件解析为 `Scenario` 对象。核心流程：

```
.md 文件内容
    │
    ▼
扫描 HTML 注释指令 (DIRECTIVE_RE)
    │
    ├── @delay:N    → 更新 currentDelay
    ├── @chunk:TYPE → 更新 currentStrategy
    ├── @done       → 插入 done chunk
    └── @error:TYPE → 整体标记为错误场景
    │
    ▼
指令间的文本根据 currentStrategy 切分
    │
    ├── sentence (默认) — 按句子切分
    ├── word           — 按单词切分
    ├── char           — 逐字符
    ├── line           — 按行
    └── paragraph      — 按段落
    │
    ▼
生成 Chunk[] 列表
```

> 详细指令参考：[场景编写指南](scenario-guide.md#指令参考)

### openai-stream.mjs — SSE 输出器

将 `Chunk[]` 以 OpenAI Chat Completions 格式写入 HTTP 响应。

**SSE 事件序列：**

```
data: {"choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"choices":[{"index":0,"delta":{"content":"第一段"},"finish_reason":null}]}

data: {"choices":[{"index":0,"delta":{"content":"第二段"},"finish_reason":null}]}

data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**错误响应：**

| 场景 | HTTP 状态码 | 说明 |
|------|------------|------|
| rate-limit | 429 | JSON 错误体 + `Retry-After` |
| content-filter | 400 | JSON 错误体 |
| server-error | 500 | JSON 错误体 |
| timeout | 200 → destroy | 输出一段内容后断开连接 |
| empty | 200 | 仅 `data: [DONE]` |

---

## 核心类型 / Core Types

```typescript
/** 文本切分策略 */
type ChunkStrategy = 'sentence' | 'word' | 'char' | 'line' | 'paragraph'

/** 错误类型 */
type ErrorType = 'rate-limit' | 'content-filter' | 'server-error' | 'timeout' | 'empty' | 'malformed'

/** 单个输出片段 */
interface Chunk {
  content: string
  delay?: number           // 输出后等待 (ms)
  strategy?: ChunkStrategy
  done?: boolean           // 流终止标记
  error?: ErrorTrigger     // 错误触发
}

/** 场景定义 */
interface Scenario {
  name: string
  chunks: Chunk[]
  error?: ErrorTrigger     // 错误场景
}

/** SSE 事件 */
interface SSEEvent {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: [{ delta: { role?, content? }, finish_reason? }]
}
```

> 完整类型见 `src/types.ts`

---

## 数据流 / Data Flow

```
前端请求
  │
  ▼ HTTP POST /v1/chat/completions
  │
server.mjs 解析请求
  │  ├─ 读 body → JSON.parse → { model, stream }
  │  └─ 选场景 → ?scenario=name | --scenario
  │
  ▼
loadScenario(name)
  │  └─ scenarioCache.get → parseScenarioFile() → cache
  │
  ▼
scenario-parser.mjs
  │  └─ scenario.md → Chunk[]
  │
  ▼
  if scenario.error → writeErrorResponse() → HTTP 4xx/5xx
  │
  ▼ else
writeOpenAIStream(chunks, res, { delay, model })
  │  1. write role chunk
  │  2. for each chunk → delay → write content
  │     - chunk.done → data: [DONE], 立即返回
  │  3. write finish_reason chunk
  │  4. data: [DONE]
  │
  ▼
前端收到 SSE 流 → 解析 data: {...} → 逐步渲染
```
