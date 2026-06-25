<!-- @desc: 标准对话演示，包含 markdown 列表 / 代码块 / 表格 / 任务列表 -->
# 🌟 AI 助理

<!-- @delay: 50 -->

你好！我是 **AI 助理**，一个模拟的流式对话助手。

<!-- @delay: 120 -->

## 我能做什么

这是一个 **markdown** 演示场景，涵盖了常见的格式：

- **列表**：无序列表和有序列表
- **代码**：内联 `code` 和代码块
- **引用**：引用块
- **表格**：GFM 表格

<!-- @delay: 150 -->

### 代码示例

```javascript
// 一个简单的函数
function greet(name) {
  return `Hello, ${name}!`;
}

console.log(greet("World"));
```

<!-- @delay: 120 -->

> 💡 **提示**：使用 `--delay` 参数可以控制输出速度。

### 有序列表

1. 第一步：初始化项目
2. 第二步：编写代码
3. 第三步：测试运行

<!-- @delay: 100 -->

### 表格示例

| 特性 | 支持情况 | 备注 |
|------|---------|------|
| SSE 流式 | ✅ | OpenAI 格式 |
| Markdown | ✅ | 完整 GFM |
| 错误模拟 | ✅ | HTTP + 流内错误 |

<!-- @delay: 80 -->

### 任务列表

- [x] 实现基础 SSE 流
- [x] 支持 Markdown 输出
- [ ] 支持更多 Provider
- [ ] Web UI 控制台

<!-- @delay: 1000 -->

---

感谢使用 AI SSE Mock Server！🎉 你可以在请求中带 `?scenario=场景名` 切换不同的场景。
