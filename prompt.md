下面是哪一家 AI Provider 的返回值格式？ 


```js
while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // 解析 SSE 格式数据
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const jsonStr = line.slice(5).trim();
          if (jsonStr && jsonStr !== '[DONE]') {
            try {
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                assistantMessage += content;
                messages.value[messageIndex].content = assistantMessage;
                await scrollToBottom();
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    }
```

我想要做一个 AI SSE 接口的 mock 服务，通过 npm 包发布，cli 的形式，需要覆盖主流的 Provider，目的是给前端 mock 使用，痛点是 web UI 开发完毕但是需要测试流式输出。

需要涵盖各各种场景，正常下输出各种 markdown 语法（包括 gfm），异常情况等。帮我 brainstorm 完整的规划，然后分期开发。
