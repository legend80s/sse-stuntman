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