<!-- @desc: 输出内容包含不完整 JSON，测试前端解析容错 -->
# 非法 JSON 输出

这个场景会输出不完整的 JSON。

<!-- @delay: 80 -->

开始正常输出一些内容。

<!-- @delay: 120 -->

```json
{
  "name": "AI SSE Mock",
  "version": "0.1.0"
```

<!-- @delay: 100 -->

后面还有一些内容。

<!-- @done -->
