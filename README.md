# SSE Stuntman 🏍️

<p>
  <a href="https://www.npmjs.com/package/sse-stuntman" target="_blank">
    <img src="https://img.shields.io/npm/v/sse-stuntman.svg" alt="npm version" />
  </a>

  <a href="https://www.npmjs.com/package/sse-stuntman">
    <img src="https://img.shields.io/npm/dm/sse-stuntman.svg" alt="npm downloads" />
  </a>

  <a href="https://github.com/legend80s/sse-stuntman/blob/main/advance.md" target="_blank">
    <img alt="coverage" src="https://img.shields.io/badge/coverage%2095.8%25-green" />
  </a>
</p>

```md
╔═══════════════════════════════════════════════════╗
║   ███████╗████████╗██╗   ██╗███╗   ██╗████████╗   ║
║   ██╔════╝╚══██╔══╝██║   ██║████╗  ██║╚══██╔══╝   ║
║   ███████╗   ██║   ██║   ██║██╔██╗ ██║   ██║      ║
║   ╚════██║   ██║   ██║   ██║██║╚██╗██║   ██║      ║
║   ███████║   ██║   ╚██████╔╝██║ ╚████║   ██║      ║
║   ╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═══╝   ╚═╝      ║
║                                                   ║
║     SSE Stuntman  |  Your AI's Stunt Double       ║
╚═══════════════════════════════════════════════════╝

✓ OpenAI provider ready
✓ SSE endpoint: http://localhost:16828
```

> **特技替身 (Stuntman) — 替真实 AI API 完成"危险"的测试任务**
>
> 前端开发时，如何快速测试 AI 流式输出的打字机效果？
>
> 一键启动 `sse-stuntman`，无需真实 API Key，即可模拟各种场景：
>
> 正常的 Markdown 流式输出、表格/代码块/Mermaid 图表、HTTP 错误、超时断连……

## 特性

- ✨ **零依赖** — 充分使用 Node.js 内置模块
- 🎯 **OpenAI 兼容** — `POST /v1/chat/completions`，标准 SSE 格式，主流前端 SDK 直接对接
- ⏱ **精准时序控制** — 每条消息间隔毫秒级可控，模拟真实打字机效果
- 💥 **全面错误模拟** — `429` / `400` / `500` / 超时断连 / 空响应，覆盖真实异常
- 🌐 **CORS 全开** — 浏览器直接跨域调用
- 🖥 **内置 Web UI** — 浏览器打开首页即可演示流式输出
- 📝 **场景即 Markdown** — 内置 13 个场景。用 `.md` 文件描述 AI 输出内容和节奏，可读可版本控制，场景文件可放入代码库
- 📂 **自定义场景** — 默认 `~/.sse-stuntman/scenarios/` 放 `.md` 文件自动生效，支持自定义目录，场景可纳入 git 管理
- 🎤 **自定义输入** — 把请求消息内容注入场景流，用 `@input` 指令让静态场景"活"起来

## 快速开始

```bash
npx sse-stuntman --default-delay 100 --scenario echo
# 🏍️  SSE Stuntman — server ready at http://localhost:16828
```

```bash
curl -N -X POST http://localhost:16828/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"# Hello\n\nYour **markdown** here"}],"stream": true}'
```

### 使用

假设有一个 `POST http://localhost:9095/api/my/chat` SSE 请求，期待返回 OpenAI 标准格式的 Markdown 流式输出，前端想测试该接口：

```bash
npx sse-stuntman --port 9095 --endpoint-path 'api/my/chat'
```

这样就开启了一个 SSE 请求模拟服务，你可以直接在你的代码中发起请求。可先试试 curl 看看是否输出了你预期的格式:

```bash
curl -N -X POST http://localhost:9095/api/my/chat \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-5.5", "stream": true, "messages": [] }'
```

## CLI 命令常用参数

```bash
sse-stuntman -h
```

| 参数 | 默认值 | 说明 |
| ------ | -------- | ------ |
| `--port <number>` | `16828` | 服务端口 |
| `--scenario <name>` | `default` | 场景名或 `.md` 文件路径（支持绝对/相对路径） |
| `--delay-multiplier <number>` | `1` | 全局延迟倍率（`0.5` 半速，`2` 倍速） |
| `--default-delay <number>` / `-d` | `10` | 场景内无 `@delay` 时的默认 chunk 间隔（毫秒） |
| `--model <name>` | `gpt-4o` | SSE 事件中的模型名 |
| `--endpoint-path <path>` / `-e` | `/v1/chat/completions` | 自定义 POST 端点路径，可多次指定支持多路径（如 `-e /chat -e /api/chat`） |
| `--provider <name>` | `openai` | 输出格式：`openai`（Chat Completions SSE）或 `anthropic`（Messages SSE） |
| `--chunk-strategy <name>` | `word` | 文本切分策略：`word` / `sentence` / `char` / `line` / `paragraph` |
| `--scenarios-dir <path>` | — | 自定义场景目录（覆盖默认路径） |
| `--list` | — | 列出所有内置 + 自定义场景 |
| `create-scenario <name>` | — | 创建新场景模板 |
| `--help` / `-h` | — | 显示帮助 |

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

# 直接使用 .md 文件作为场景（无需放入场景目录）
sse-stuntman --scenario ./relative/test.md

# 半速输出
sse-stuntman --delay-multiplier 0.5

# 自定义端点路径（用于无法修改代码的客户端）
sse-stuntman --endpoint-path /api/my/chat

# 多个端点路径（同时 mock 多个 URL）
sse-stuntman -e /api/v1/chat -e /api/v2/chat -e /chat
```

---

## 开发

```bash
# 启动服务
node --watch --watch-preserve-output src/bin/index.mjs -s english-i-have-a-dream.md -p 16828

# 运行测试（74 个用例）
npm test

# 查看场景列表
node src/bin/index.mjs --list
```

## 高级用法

[advance.md](./advance.md) 包括：CLI 命令参数、内置场景、自定义场景、配置文件、前端集成、特殊指令介绍

## License

MIT &copy; 2026 [legend80s](https://github.com/legend80s)
