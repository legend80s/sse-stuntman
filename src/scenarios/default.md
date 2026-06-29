<!-- @desc: 标准对话演示，包含 markdown 列表 / 代码块 / 表格 / 任务列表 -->
# 🌟 AI 助理 SSE Stuntman 🏍️

你好！我是 **AI 助理**，一个模拟的流式对话助手。

> **特技替身 (Stuntman) — 替真实 AI API 完成"危险"的测试任务**
>
> 前端开发时，AI 接口调通了但流式输出的打字机效果无法测试？
> 一键启动 `sse-stuntman`，无需真实 API Key，即可模拟各种场景：
> 正常的 Markdown 流式输出、表格/代码块/Mermaid 图表、HTTP 错误、超时断连……

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

## Markdown 演示

这是一个 **markdown** 演示场景，涵盖了常见的格式：

- **列表**：无序列表和有序列表
- **代码**：内联 `code` 和代码块
- **引用**：引用块
- **表格**：GFM 表格

### 代码示例

```javascript
// 一个简单的函数
function greet(name) {
  return `Hello, ${name}!`;
}

console.log(greet("World"));
```

<!-- @delay: 50 -->

> 💡 **提示**：使用 `--delay` 参数可以控制输出速度。

### 有序列表

1. 第一步：初始化项目
2. 第二步：编写代码
3. 第三步：测试运行

### 表格示例

| 特性 | 支持情况 | 备注 |
|------|---------|------|
| SSE 流式 | ✅ | OpenAI 格式 |
| Markdown | ✅ | 完整 GFM |
| 错误模拟 | ✅ | HTTP + 流内错误 |

### 任务列表

- [x] 实现基础 SSE 流
- [x] 支持 Markdown 输出
- [ ] 支持更多 Provider
- [ ] Web UI 控制台

---

感谢使用 AI SSE Mock Server！🎉 你可以在请求中带 `?scenario=场景名` 切换不同的场景。
