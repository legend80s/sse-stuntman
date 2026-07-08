export default async function sse(req, res) {
  // 设置 SSE 头部
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no") // 防止 Nginx 缓冲
  res.setHeader("X-Mock-Server", "based-on-file")

  // 文本内容
  const text = `在 Node.js（以及 JavaScript）中，\`Array.prototype.slice()\` 方法确实会返回一个新的数组，而不是修改原数组。这种行为在某些情况下可能会对性能产生影响，但具体是否“性能很低”取决于多个因素，包括数组的大小、调用频率以及应用场景。以下是对这个问题的详细分析：

### \`slice()\` 的工作原理
\`slice()\` 方法会创建一个新数组，并将原数组中指定范围的元素复制到新数组中。这个过程涉及以下步骤：
1. 创建一个新的空数组。
2. 遍历原数组中指定范围的元素。
3. 将每个元素逐个复制到新数组中。

### 性能影响因素
1. **数组大小**：
   - 如果数组非常大（例如包含数千或数万个元素），每次调用 \`slice()\` 都会涉及大量的内存分配和元素复制操作，这可能会导致性能下降。
   - 对于较小的数组（例如只有几个元素），\`slice()\` 的性能影响通常可以忽略不计。

2. **调用频率**：
   - 如果 \`slice()\` 在高频场景中被调用（例如在循环中频繁使用），即使每次操作的开销较小，累积起来也可能导致显著的性能问题。
   - 如果调用频率较低，性能影响可能不明显。

3. **内存分配**：
   - 每次调用 \`slice()\` 都会创建一个新的数组，这意味着会分配新的内存。频繁的内存分配和释放可能会导致垃圾回收（GC）的频率增加，从而影响性能。

### 性能优化建议
如果你发现 \`slice()\` 的性能确实是一个瓶颈，可以考虑以下优化方法：

1. **避免不必要的 \`slice()\` 调用**：
   - 如果可能，尽量减少对 \`slice()\` 的调用次数。例如，如果可以通过其他方式（如索引访问）实现相同的功能，尽量避免使用 \`slice()\`。

2. **使用原生数组操作**：
   - 如果只需要访问数组的一部分，但不需要创建新数组，可以使用索引直接访问原数组的元素，而不是通过 \`slice()\` 创建副本。

3. **分批处理**：
   - 如果需要处理非常大的数组，可以将数组分成多个小块，逐块处理，以减少每次调用 \`slice()\` 的开销。

4. **使用其他数据结构**：
   - 如果频繁的数组操作导致性能问题，可以考虑使用其他数据结构，例如 \`Set\`、\`Map\` 或自定义的链表结构，这些结构可能更适合某些场景。

5. **性能测试**：
   - 在实际应用中，建议对代码进行性能测试，以确定 \`slice()\` 是否真的是性能瓶颈。可以使用 Node.js 的 \`console.time()\` 和 \`console.timeEnd()\` 方法来测量代码的执行时间。

### 示例：性能对比
以下是一个简单的性能测试示例，比较直接访问数组和使用 \`slice()\` 的性能差异：

\`\`\`javascript
const arr = Array.from({ length: 1000000 }, (_, i) => i);

console.time("Direct Access");
for (let i = 0; i < 1000000; i++) {
    const value = arr[i];
}
console.timeEnd("Direct Access");

console.time("Slice");
for (let i = 0; i < 1000000; i++) {
    const newArr = arr.slice(i, i + 1);
}
console.timeEnd("Slice");
\`\`\`

运行结果可能如下：
\`\`\`
Direct Access: 1.234ms
Slice: 123.456ms
\`\`\`

从这个简单的测试可以看出，\`slice()\` 的性能明显低于直接访问数组。

### 总结
\`slice()\` 每次返回新数组确实会带来一定的性能开销，尤其是在处理大数组或高频调用的场景下。然而，在许多实际应用中，这种开销是可以接受的，尤其是在数组较小或调用频率较低的情况下。如果性能确实是一个问题，可以通过优化代码逻辑、减少调用次数或使用其他数据结构来缓解。`

  const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" })
  const words = Array.from(segmenter.segment(text), (s) => s.segment)
  // const words = text.split(' ') // 按单词分割
  // console.log(words)
  const timeLabel = `SSE costs ${crypto.randomUUID()}`
  console.time(timeLabel)

  let index = 0
  const separator = "\r\n\r\n"
  res.write(
    `data: {"id":"f9b42131-50b7-45f0-9856-xxxxxxxx","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}],"model":"deepseek-deep-think","object":"chat.completion.chunk"}${separator}`,
  )

  index++

  // 定时器每 100ms 发送一个单词
  const interval = setInterval(() => {
    if (index < words.length) {
      const word = words[index]
      // console.log(word)

      res.write(
        `data: ${JSON.stringify({
          id: crypto.randomUUID(),
          choices: [
            { index: 0, delta: { content: word }, finish_reason: null },
          ],
          model: "deepseek-deep-think",
          object: "chat.completion.chunk",
        })}${separator}`,
      )
      index++
    } else {
      res.write(
        `data: {"id":"f9b42131-50b7-45f0-9856-3986149c4112","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"model":"deepseek-deep-think","object":"chat.completion.chunk","usage":{"prompt_tokens":71,"completion_tokens":8,"total_tokens":79},"performance":{"total_latency":2.4254555702209473,"ttft":1.6984522342681885,"tpot":0.09087541699409485,"without_ttft_tps":11.004076053538007,"total_tps":32.57120063131212}}${separator}`,
      )
      res.write(`data: [DONE]${separator}`)

      // console.log('END')
      console.timeEnd(timeLabel)
      clearInterval(interval) // 发送完毕,清除定时器
      res.end() // 结束 SSE 响应
    }
  }, 100)
}
