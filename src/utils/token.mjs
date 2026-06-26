const segmenter = new Intl.Segmenter("zh-CN", {
  granularity: "word",
})

// const text = '你好，请介绍一下你自己。Hello, please introduce yourself.'
// DeepSeek 计算 8 个
// ❯ uv run deepseek_tokenizer.py
// [transformers] PyTorch was not found. Models won't be available and only tokenizers, configuration and file/data utilities can be used.
// 你好，请介绍一下你自己。Hello, please introduce yourself. =>
// [19923, 14, 59324, 650, 116235, 33183, 2161, 16]
// len(text)=45 len(result)=8

// 方案 1 segments 计算 10 个 seg.isWordLike && seg.segment.trim().length > 0
// 方案 2 segments 计算 17 个
// 故采用近似的 10 个，即方案 1

/**
 *
 * @param {string} prompt
 * @returns {number}
 */
export function calculateTokens(prompt) {
  const segments = [...segmenter.segment(prompt)]
  const words = segments.filter(
    (seg) => seg.isWordLike && seg.segment.trim().length > 0,
  )

  // console.log("words:", words)

  return words.length
}
