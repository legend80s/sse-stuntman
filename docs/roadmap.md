# 开发路线图 / Development Roadmap

> 基于 [prompt.md](../prompt.md) 的原始需求，经头脑风暴后的分期开发规划。
> Derived from the original requirements, planned in phases with incremental value delivery.

---

## 总体思路 / Philosophy

- **第优先级交付价值**：Phase 1 覆盖最广泛的 OpenAI 生态，前端可即刻用
- **零外部依赖**：内置 `http` 模块，`npm install` 即用
- **渐进式复杂**：从单 Provider → 多 Provider → 高级功能
- **场景即代码**：.md 场景文件可读、可版本控制、可分享

---

## Phase 1 — MVP: OpenAI 格式 ✅ (已完成)

### 目标 / Goal

覆盖 `POST /v1/chat/completions` OpenAI 流式接口，提供基础场景模拟。

### 已实现功能 / Delivered

- [x] HTTP 服务器（零外部依赖，CORS 全开）
- [x] OpenAI SSE 流式格式（role → content → stop → [DONE]）
- [x] 非流式支持（`stream: false` → 完整 JSON）
- [x] Markdown 场景解析器（`@delay` / `@chunk` / `@done` / `@error` 指令）
- [x] 5 种切分策略（sentence / word / char / line / paragraph）
- [x] 5 种错误场景（429 / 400 / 500 / timeout / empty）
- [x] CLI 参数（`--port` / `--scenario` / `--delay` / `--model` / `--list`）
- [x] HTML 内置测试 UI（`GET /`）
- [x] 健康检查（`GET /health`）
- [x] 27 个测试用例全通过

### 内置场景 / Built-in Scenarios

| 场景 | 类型 | 用途 |
|------|------|------|
| `default` | 正常 | 标准对话，含 markdown 列表、代码块、表格 |
| `markdown-demo` | 正常 | 完整 GFM：diff、Mermaid、数学公式、引用 |
| `empty` | 正常 | 直接 `[DONE]`，测试空响应 |
| `error-interrupted` | 正常 | 流中断测试 |
| `error-malformed` | 正常 | 输出包含非法 JSON |
| `error-rate-limit` | 错误 | HTTP 429 |
| `error-content-filter` | 错误 | HTTP 400 |
| `error-server-error` | 错误 | HTTP 500 |
| `error-timeout` | 错误 | 输出部分后断连 |

---

## Phase 2 — 场景增强 + 插件系统 (规划中)

### 目标 / Goal

丰富场景生态，支持自定义场景插件和动态变量插值。

### 功能清单 / Backlog

- [ ] **新场景**：代码生成（多文件输出）、工具调用(function calling)、多轮对话、超长输出(10k+ tokens)
- [ ] **场景插件系统**：`--load ./plugin.mjs` 加载外部插件，插件可返回动态 Chunk（从 API/DB 读取）
- [ ] **变量插值**：`{{input.name}}` 引用请求体字段，`{{random.uuid}}` 等内置变量
- [ ] **配置文件支持**：`.aisemockrc.yaml` / `aisemock.config.ts` 配置默认参数和场景路径

### 技术细节

```js
// 插件接口
export default {
  name: 'my-plugin',
  async getChunks(requestBody) {
    const data = await fetch('https://api.example.com/chat')
    return [{ content: data.text, delay: 50 }]
  },
}
```

```yaml
# .aisemockrc.yaml
port: 8080
scenario: code-review
delay: 0.8
model: gpt-4o
scenarios:
  custom: ./my-scenarios/custom.md
plugins:
  - ./plugins/weather.mjs
```

---

## Phase 3 — 多 Provider 格式 (规划中)

### 目标 / Goal

覆盖 Anthropic Claude 和 Google Gemini 的流式格式。

### 功能清单 / Backlog

#### Anthropic Claude (Messages API)

```
POST /v1/messages
Content-Type: application/json

{
  "model": "claude-3-opus-20240229",
  "messages": [{"role": "user", "content": "你好"}],
  "stream": true
}
```

SSE 格式（基于 Server-Sent Events 规范）：

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_1","content":[],"model":"claude-3-opus-20240229"}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好！"}}

event: message_done
data: {"type":"message_done","message":{"content":[{"type":"text","text":"你好！"}]}}
```

#### Google Gemini

```
POST /v1beta/chat/completions
```

流式格式（单行 JSON 带 `data: ` 前缀）：

```
data: {"candidates":[{"content":{"role":"model","parts":[{"text":"你好"}]}}]}
```

#### Provider 抽象层

```typescript
interface ProviderAdapter {
  name: string
  endpoint: string                     // 监听路径
  writeStream(chunks, res, opts): Promise<void>
  writeError(error, res): void
  parseRequest(body): RequestContext
  identify(req): boolean               // 自动识别 Provider
}
```

- 通过 `--provider openai` 切换单 Provider
- 默认自动识别（根据 endpoint path）
- 可选：一次启动多 Provider（多个端口）

---

## Phase 4 — 高级功能 (规划中)

### 目标 / Goal

录播、Proxy 模式、Web UI 控制台等生产级功能。

### 功能清单 / Backlog

#### 录播模式 / Record Mode

```bash
sse-stuntman --record --proxy https://api.openai.com
sse-stuntman --record --proxy https://api.openai.com --scenario-name my-saved
```

流程：
1. 请求透传到真实 API（需要 `OPENAI_API_KEY` 环境变量）
2. 完整记录 SSE 流保存为场景 `.md` 文件
3. 关闭 `--record` 后，可用 `--scenario my-saved` 离线回放
4. 可手动编辑录制的 `.md` 文件调整延迟和内容

#### Proxy 模式 / Proxy Mode

```bash
sse-stuntman --proxy https://api.deepseek.com
sse-stuntman --proxy https://api.openai.com --inject-delay 200
sse-stuntman --proxy https://api.openai.com --inject-error 0.1
```

- 透传请求+响应，行为与真实 Provider 一致
- `--inject-delay`：额外注入延迟（模拟慢网）
- `--inject-error`：概率注入错误（测试容错）
- 非破坏性集成测试的好工具

#### Web UI 控制台 / Web Console

- 可视化的场景选择和实时流预览
- 请求历史记录查看
- Provider 格式切换
- 录制/回放管理界面
- 内嵌 `GET /ui` 路径

#### 其他 / Others

- **OpenAPI 规范导出**：`sse-stuntman openapi > openapi.json`
- **指标端点**：`GET /metrics` 提供请求数、延迟分布（与 Prometheus 兼容格式）
- **会话持久化**：`conversation_id` 参数跨请求串联上下文
- **WebSocket 支持**：部分 Provider 的 WS 流实验性支持
- **Docker 镜像**：`ghcr.io/xxx/sse-stuntman` 容器化发布

---

## 发布计划 / Release Plan

| 版本 | 内容 | 状态 |
|------|------|------|
| `v0.1.0` | Phase 1 — OpenAI 格式 MVP | ✅ 已完成 |
| `v0.2.0` | Phase 2 — 场景增强 + 插件系统 | 📝 规划中 |
| `v0.3.0` | Phase 3 — Anthropic + Gemini 格式 | 📝 规划中 |
| `v0.5.0` | Phase 4 — 录播 + Proxy 模式 | 📝 规划中 |
| `v1.0.0` | 稳定版 — Web UI + 完整文档 | 🎯 目标 |

---

## 技术债 / Technical Debt

- [ ] 集成测试独立端口（`server.listen(0)` 自动分配而非固定端口）
- [ ] 添加类型检查 CI（`tsc --noEmit`）
- [ ] `scenario-parser` 跳过 UTF-8 BOM 头
- [ ] 大请求体流式解析（当前是全量读入）
- [ ] `[DONE]` 格式检查（严格对齐 OpenAI 规范）
- [ ] 跨平台路径处理验证
