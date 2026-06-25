/**
 * @file scenario-parser 单元测试
 */

import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { listScenarios, parseScenarioFile } from "./scenario-parser.mjs"

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

      const result = parseScenarioFile(file)

      assert.equal(result.name, "test")
      assert.equal(result.chunks.length, 2)
      // first chunk: "# Hello\n\nThis is a test." — sentence split
      assert.ok(result.chunks[0].content.length > 0)
      assert.equal(result.chunks[0].delay, 50) // default delay
      // second chunk after @delay:100
      assert.equal(result.chunks[1].content.trim(), "Second paragraph.")
      assert.equal(result.chunks[1].delay, 100)
    })

    it("should detect @error directive for error scenarios", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "test.md")
      writeFileSync(file, "<!-- @error: rate-limit -->", "utf-8")

      const result = parseScenarioFile(file)

      assert.equal(result.name, "test")
      assert.equal(result.chunks.length, 0)
      assert.ok(result.error)
      assert.equal(result.error.type, "rate-limit")
    })

    it("should handle @done directive", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "test.md")
      writeFileSync(
        file,
        "First part.\n\n<!-- @done -->\n\nSecond part that should not appear.",
        "utf-8",
      )

      const result = parseScenarioFile(file)

      // Parser doesn't truncate after @done — just adds a done chunk.
      // Downstream (openai-stream) stops on done.
      const doneChunk = result.chunks.find((c) => c.done)
      assert.ok(doneChunk, "Should have a done chunk")
      assert.equal(result.chunks[0].content, "First part.")
      assert.equal(doneChunk.done, true)
    })

    it.only("should handle @chunk strategy changes", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "test.md")
      writeFileSync(
        file,
        "这是逐句输出的效果 Hello world.\n\n<!-- @chunk: word -->\n\n这是逐词输出的效果word1 word2 word3.",
        "utf-8",
      )

      const result = parseScenarioFile(file)
      // console.log("result:", result)

      // first chunk: sentence-split "Hello world."
      // remaining text after @chunk:word is split by word strategy -> multiple chunks
      assert.deepStrictEqual(result, {
        name: "test",
        chunks: [
          { content: "这是逐句输出的效果 Hello world.", delay: 50 },
          { content: "这", delay: 50 },
          { content: "是", delay: 50 },
          { content: "逐词", delay: 50 },
          { content: "输出", delay: 50 },
          { content: "的", delay: 50 },
          { content: "效果", delay: 50 },
          { content: "word1", delay: 50 },
          { content: " ", delay: 50 },
          { content: "word2", delay: 50 },
          { content: " ", delay: 50 },
          { content: "word3", delay: 50 },
          { content: ".", delay: 50 },
        ],
        description: "",
      })
    })

    it("should split text word by word with @chunk: word", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "test.md")
      writeFileSync(
        file,
        "<!-- @chunk: word -->\n\nHello world, this is a test.\n\nSecond sentence here.",
        "utf-8",
      )

      const result = parseScenarioFile(file)

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
          50,
          "Word chunks should carry the default delay",
        )
      }
    })

    it("should handle multiple directives", () => {
      const dir = mkdtempSync(join(tmpdir(), "test-"))
      const file = join(dir, "test.md")
      writeFileSync(
        file,
        "Start.\n\n<!-- @delay: 200 -->\n\nMiddle.\n\n<!-- @chunk: word -->\n\nword1.",
        "utf-8",
      )

      const result = parseScenarioFile(file)

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
