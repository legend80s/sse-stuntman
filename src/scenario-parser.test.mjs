/**
 * @file scenario-parser 单元测试
 */

import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { DEFAULTS } from "./cli.mjs"
import {
  listScenarios,
  parseScenarioContent,
  parseScenarioFile,
} from "./scenario-parser.mjs"

describe("scenario-parser", () => {
  describe("parseScenarioFile()", () => {
    it("should parse a basic markdown scenario", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "test.md")
      writeFileSync(
        file,
        "# Hello\n\nThis is a test.\n\n<!-- @delay: 100 -->\n\nSecond paragraph.",
        "utf-8",
      )

      const result = parseScenarioFile(file, { chunkStrategy: "sentence" })

      // console.log("result:", result)

      assert.deepStrictEqual(result, {
        name: "test",
        chunks: [
          { content: "# Hello\n", delay: DEFAULTS.defaultDelay },
          { content: "This is a test.\n", delay: DEFAULTS.defaultDelay },
          { content: "\n", delay: 100 },
          { content: "Second paragraph.", delay: 100 },
        ],
        description: "",
        isBuiltin: false,
      })
    })

    it("should detect @error directive for error scenarios", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "test.md")
      writeFileSync(file, "<!-- @error: rate-limit -->", "utf-8")

      const result = parseScenarioFile(file)

      assert.deepStrictEqual(result, {
        name: "test",
        chunks: [],
        description: "",
        isBuiltin: false,
        error: { type: "rate-limit" },
      })
    })

    it("should handle @done directive", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "test.md")
      writeFileSync(
        file,
        "First part.\n\n<!-- @done -->\n\nSecond part that should not appear.",
        "utf-8",
      )

      const result = parseScenarioFile(file, { chunkStrategy: "sentence" })

      // Parser doesn't truncate after @done — just adds a done chunk.
      // Downstream (openai-stream) stops on done.
      const doneChunk = result.chunks.find((c) => c.done)
      assert.ok(doneChunk, "Should have a done chunk")
      assert.equal(result.chunks[0].content, "First part.\n")
      assert.equal(doneChunk.done, true)
    })

    it("should output word by word by default", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "test.md")
      writeFileSync(
        file,
        `这是逐句输出的效果 Hello world.

<!-- @delay: 100 -->

支持 **markdown** 语法、代码块、表格等。


<!-- @delay: 150 -->

\`\`\`javascript
console.log("Hello from temp");
\`\`\`


<!-- @delay: 120 -->


这是逐词输出的效果word1 word2 word3.`,
        "utf-8",
      )

      const result = parseScenarioFile(file)
      // console.log("result:", result)

      // first chunk: sentence-split "Hello world."
      // default word strategy -> 逐词切分
      assert.deepStrictEqual(result, {
        name: "test",
        chunks: [
          { content: "这", delay: DEFAULTS.defaultDelay },
          { content: "是", delay: DEFAULTS.defaultDelay },
          { content: "逐句", delay: DEFAULTS.defaultDelay },
          { content: "输出", delay: DEFAULTS.defaultDelay },
          { content: "的", delay: DEFAULTS.defaultDelay },
          { content: "效果", delay: DEFAULTS.defaultDelay },
          { content: " ", delay: DEFAULTS.defaultDelay },
          { content: "Hello", delay: DEFAULTS.defaultDelay },
          { content: " ", delay: DEFAULTS.defaultDelay },
          { content: "world", delay: DEFAULTS.defaultDelay },
          { content: ".", delay: DEFAULTS.defaultDelay },
          { content: "\n", delay: DEFAULTS.defaultDelay },
          { content: "\n", delay: 100 },
          { content: "支持", delay: 100 },
          { content: " ", delay: 100 },
          { content: "*", delay: 100 },
          { content: "*", delay: 100 },
          { content: "markdown", delay: 100 },
          { content: "*", delay: 100 },
          { content: "*", delay: 100 },
          { content: " ", delay: 100 },
          { content: "语法", delay: 100 },
          { content: "、", delay: 100 },
          { content: "代码", delay: 100 },
          { content: "块", delay: 100 },
          { content: "、", delay: 100 },
          { content: "表格", delay: 100 },
          { content: "等", delay: 100 },
          { content: "。", delay: 100 },
          { content: "\n", delay: 100 },
          { content: "\n", delay: 150 },
          { content: "`", delay: 150 },
          { content: "`", delay: 150 },
          { content: "`", delay: 150 },
          { content: "javascript", delay: 150 },
          { content: "\n", delay: 150 },
          { content: "console.log", delay: 150 },
          { content: "(", delay: 150 },
          { content: '"', delay: 150 },
          { content: "Hello", delay: 150 },
          { content: " ", delay: 150 },
          { content: "from", delay: 150 },
          { content: " ", delay: 150 },
          { content: "temp", delay: 150 },
          { content: '"', delay: 150 },
          { content: ")", delay: 150 },
          { content: ";", delay: 150 },
          { content: "\n", delay: 150 },
          { content: "`", delay: 150 },
          { content: "`", delay: 150 },
          { content: "`", delay: 150 },
          { content: "\n", delay: 150 },
          { content: "\n", delay: 120 },
          { content: "这", delay: 120 },
          { content: "是", delay: 120 },
          { content: "逐词", delay: 120 },
          { content: "输出", delay: 120 },
          { content: "的", delay: 120 },
          { content: "效果", delay: 120 },
          { content: "word1", delay: 120 },
          { content: " ", delay: 120 },
          { content: "word2", delay: 120 },
          { content: " ", delay: 120 },
          { content: "word3", delay: 120 },
          { content: ".", delay: 120 },
        ],
        description: "",
        isBuiltin: false,
      })
    })

    it("should split text word by word with chunk strategy", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "test.md")
      writeFileSync(
        file,
        "Hello world, this is a test.\n\nSecond sentence here.",
        "utf-8",
      )

      const result = parseScenarioFile(file, { chunkStrategy: "word" })

      // Each chunk should be a single word (including trailing whitespace)
      const wordChunks = result.chunks.filter(
        (c) => c.content.trim().length > 0,
      )
      assert.ok(wordChunks.length > 1, "Should produce multiple word chunks")

      // Every non-whitespace-only chunk should be a single word
      for (const chunk of wordChunks) {
        const trimmed = chunk.content.trim()
        assert.ok(
          trimmed.length > 0,
          "Each chunk should contain non-whitespace content",
        )
        // A word chunk should not contain internal spaces
        assert.ok(
          !/\s/.test(trimmed),
          `Chunk content "${trimmed}" should be a single word (no internal spaces)`,
        )
      }

      // Concatenating all chunks should reconstruct the original text
      const reconstructed = result.chunks.map((c) => c.content).join("")
      assert.ok(reconstructed.includes("Hello world, this is a test."))
      assert.ok(reconstructed.includes("Second sentence here."))

      // Verify delay is applied correctly to word chunks
      for (const chunk of wordChunks) {
        assert.equal(
          chunk.delay,
          DEFAULTS.defaultDelay,
          "Word chunks should carry the default delay",
        )
      }
    })

    it("should handle multiple directives", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "test.md")
      writeFileSync(
        file,
        "Start.\n\n<!-- @delay: 200 -->\n\nMiddle.\n\nword1.",
        "utf-8",
      )

      const result = parseScenarioFile(file, { chunkStrategy: "sentence" })

      assert.ok(result.chunks.length >= 2)
      assert.equal(result.chunks[1].delay, 200)
    })

    it("should parse name from filename", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "my-custom-name.md")
      writeFileSync(file, "Hello.", "utf-8")

      const result = parseScenarioFile(file)
      assert.equal(result.name, "my-custom-name")
    })

    it("should preserve newlines with line chunk strategy", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "line-test.md")
      const input = "# Echo Mode\n\nThis is bold\n\n## Try it\n- Item"
      writeFileSync(file, input, "utf-8")

      const result = parseScenarioFile(file, { chunkStrategy: "line" })

      const reconstructed = result.chunks.map((c) => c.content).join("")
      assert.equal(reconstructed, input)
    })
  })

  describe("@input directive", () => {
    it("should create an input placeholder chunk", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "echo.md")
      writeFileSync(file, "<!-- @delay: 30 -->\n<!-- @input -->", "utf-8")

      const result = parseScenarioFile(file)

      const inputChunks = result.chunks.filter((c) => c.input)
      assert.equal(inputChunks.length, 1)
      assert.equal(inputChunks[0].content, "")
      assert.equal(inputChunks[0].delay, 30)
    })

    it("should handle @input in block quote", (t) => {
      const content = `你问的这个问题

> <!-- @input -->

违背 AI 道德规范，我无法回答。
`

      const result = parseScenarioContent(content, {
        name: "inline-word-chunks",
      })

      t.assert.snapshot(result)
    })

    it("should handle inline @input with word chunk strategy", (t) => {
      const content =
        "你问的这个问题“**<!-- @input -->**”违背 AI 道德规范，我无法回答。"

      const result = parseScenarioContent(content, {
        name: "inline-word-chunks",
      })

      t.assert.snapshot(result)
    })

    it("should handle inline @input", () => {
      const content =
        "你问的这个问题“**<!-- @input -->**”违背 AI 道德规范，我无法回答。"

      const result = parseScenarioContent(content, {
        chunkStrategy: "sentence",
        name: "inline",
      })

      assert.deepStrictEqual(result, {
        chunks: [
          {
            content: "你问的这个问题“**",
            delay: 10,
          },
          {
            content: "",
            delay: 10,
            input: true,
          },
          {
            content: "**”违背 AI 道德规范，我无法回答。",
            delay: 10,
          },
        ],
        description: "",
        isBuiltin: false,
        name: "inline",
      })
    })

    it("should handle @input with static content", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "hybrid.md")
      writeFileSync(
        file,
        "Static start.\n\n<!-- @input -->\n\nStatic end.",
        "utf-8",
      )

      const result = parseScenarioFile(file, { chunkStrategy: "sentence" })

      // assert.equal(result, {})

      // 静态文本 chunks + 1 个 input placeholder
      const inputChunks = result.chunks.filter((c) => c.input)
      assert.equal(inputChunks.length, 1)
      assert.equal(inputChunks[0].input, true)
      assert.equal(inputChunks[0].content, "")

      // input 之前应有静态文本
      const firstInputIndex = result.chunks.indexOf(inputChunks[0])
      assert.ok(firstInputIndex > 0, "input should not be the first chunk")
      const beforeInput = result.chunks
        .slice(0, firstInputIndex)
        .map((c) => c.content)
        .join("")
      assert.ok(beforeInput.includes("Static start"))

      // input 之后也应有静态文本
      const afterInput = result.chunks
        .slice(firstInputIndex + 1)
        .map((c) => c.content)
        .join("")
      assert.ok(afterInput.includes("Static end"))
    })

    it("should handle multiple @input directives", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "multi-input.md")
      writeFileSync(
        file,
        "First.\n\n<!-- @input -->\n\nMiddle.\n\n<!-- @input -->\n\nLast.",
        "utf-8",
      )

      const result = parseScenarioFile(file, { chunkStrategy: "sentence" })

      const inputChunks = result.chunks.filter((c) => c.input)
      assert.equal(inputChunks.length, 2)
      assert.equal(inputChunks[0].input, true)
      assert.equal(inputChunks[1].input, true)
    })

    it("should preserve delay before @input", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "delay-input.md")
      writeFileSync(file, "<!-- @delay: 200 -->\n<!-- @input -->", "utf-8")

      const result = parseScenarioFile(file)

      const inputChunks = result.chunks.filter((c) => c.input)
      assert.equal(inputChunks.length, 1)
      assert.equal(inputChunks[0].delay, 200)
    })
  })

  describe("listScenarios()", () => {
    it("should list .md files in a directory", () => {
      const dir = mkdtempSync(join(tmpdir(), "scenarios-"))
      writeFileSync(join(dir, "default.md"), "# Default", "utf-8")
      writeFileSync(join(dir, "demo.md"), "# Demo", "utf-8")
      writeFileSync(join(dir, "notes.txt"), "not a scenario", "utf-8")

      const list = listScenarios(dir)

      assert.equal(list.length, 2)
      assert.ok(list.some((s) => s.name === "default"))
      assert.ok(list.some((s) => s.name === "demo"))
      assert.ok(!list.some((s) => s.name === "notes"))
    })

    it("should return empty array for empty directory", () => {
      const dir = mkdtempSync(join(tmpdir(), "empty-"))

      const list = listScenarios(dir)
      assert.equal(list.length, 0)
    })
  })
})
