# 场景编写指南 / Scenario Writing Guide

> 场景文件是核心概念 — 用 Markdown 描述 AI 输出的内容、节奏和错误。
> Scenarios are `.md` files that define the content, pacing, and errors of simulated AI responses.

---

## 文件格式 / File Format

场景文件本质是 Markdown，通过 HTML 注释嵌入控制指令。文件名（不含 `.md`）即场景名。

```markdown
# 场景标题

普通段落内容。

<!-- @delay: 200 -->

包含 **markdown** 格式的内容。

逐词输出的文字（通过 `--chunk-strategy word` 启用）。

<!-- @done -->
```

### 指令参考 / Directive Reference

| 指令 | 示例 | 作用 |
|------|------|------|
| `@delay:N` | `<!-- @delay: 200 -->` | 设置此后每个 chunk 的间隔延迟（毫秒），默认 50ms |
| `--chunk-strategy` | CLI 参数 | 文本切分策略：`word`(默认)/`sentence`/`char`/`line`/`paragraph` |
| `@done` | `<!-- @done -->` | 在此处终止流，后续内容不输出 |
| `@error:TYPE` | `<!-- @error: rate-limit -->` | 标记整个文件为错误场景（通常放第一行） |

所有指令不区分大小写。

---

## 切分策略 / Chunk Strategy

切分策略决定一段文本被拆成几个 SSE chunk 发送。策略由 `--chunk-strategy` CLI 参数指定。

| 策略 | 说明 | 示例输入 | 输出 chunk 数 |
|------|------|---------|--------------|
| `word` (默认) | 按单词/词切分，打字机效果 | `Hello World` | 2 |
| `sentence` | 按句号、感叹号、问号切分 | `你好！我是AI。` | 2 |
| `char` | 逐字符输出，最细腻 | `Hi` | 2 |
| `line` | 按行切分 | `A\nB\nC` | 3 |
| `paragraph` | 按空行分隔的段落 | `P1\n\nP2` | 2 |

### 选择建议

- **默认 word** 模拟真实 AI 逐词生成的感觉
- **sentence** 按句子切分，适合摘要性场景
- **char** 测试前端最细粒度的渲染能力
- **line** 适合代码输出场景
- **paragraph** 适合长段落、需要整段显示的场景

---

## 错误场景 / Error Scenarios

错误场景文件只有一个 `@error` 指令（通常放第一行），无其他内容。

```markdown
<!-- @error: rate-limit -->
```

```markdown
<!-- @error: server-error -->
```

| 错误类型 | HTTP 状态码 | 说明 |
|----------|------------|------|
| `rate-limit` | 429 | 限流错误，响应含 Retry-After 头 |
| `content-filter` | 400 | 内容过滤 |
| `server-error` | 500 | 服务器内部错误 |
| `timeout` | 200 → 断开 | 输出一段内容后模拟连接中断 |
| `empty` | 200 | 仅返回 `data: [DONE]` |

---

## 完整示例 / Complete Example

```markdown
# 📝 Code Review 结果

<!-- @delay: 80 -->

我来帮你 review 代码。发现以下问题：

<!-- @delay: 150 -->

## 修改建议

| 文件 | 问题 | 严重度 |
|------|------|--------|
| `src/auth.ts` | 缺少输入验证 | 🔴 高 |
| `src/api.ts` | 未处理超时 | 🟡 中 |

<!-- @delay: 200 -->
```diff
- const token = req.header('Authorization');
+ const token = req.header('Authorization')?.replace('Bearer ', '');
```

<!-- @delay: 100 -->

### 总结

- [x] 修复高严重度问题
- [x] 补充类型声明
- [ ] 添加单元测试

> 以上修改建议仅供参考。

<!-- @done -->
```

---

## 最佳实践 / Best Practices

1. **延迟设置**：默认 50ms 适合大多数场景。表格、代码块前后加 150-200ms 延迟更真实
2. **策略选择**：`--chunk-strategy word` 默认，大段代码用 `char`，摘要性文字用 `sentence`
3. **中断测试**：用 `@done` 模拟回复到一半中断
4. **错误覆盖**：正确定义 `@error` 场景测试前端错误处理
5. **文件名**：简短、语义化，用连字符分隔（如 `code-review.md`）
