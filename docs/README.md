# AI SSE Mock — 文档索引

> **模拟主流 AI Provider 流式接口的 CLI 工具**
>
> 前端开发时，AI 接口已调通但流式输出界面无法测试？一键启动本地 mock 服务，覆盖正常流式、GFM 富文本、异常断连、HTTP 错误等场景。
>
> Simulate AI streaming responses for frontend development — zero dependencies, one command.

---

## 文档导航 / Documentation Index

| 文档 | 说明 | Document |
|------|------|----------|
| [架构设计](architecture.md) | 模块划分、数据流、核心类型 | Architecture Design |
| [场景编写指南](scenario-guide.md) | .md 场景文件指令详解 | Scenario Writing Guide |
| [API 参考](api-reference.md) | 接口端点、CLI 参数、SSE 事件格式 | API Reference |
| [开发路线图](roadmap.md) | Phase 1~4 规划与优先级 | Development Roadmap |
| [贡献指南](contributing.md) | 本地开发、测试、PR 流程 | Contributing Guide |

---

## 快速入口 / Quick Start

```bash
# 一键启动
npx sse-stuntman

# 或本地安装后
npm install -g sse-stuntman
sse-stuntman --port 16828 --scenario markdown-demo
```

```js
// 前端集成
const res = await fetch('http://localhost:16828/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-4o', stream: true, messages: [] }),
})
// 标准 OpenAI SSE 消费者解析 choices[].delta.content
```
