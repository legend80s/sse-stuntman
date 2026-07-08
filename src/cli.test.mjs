// import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { describe, it } from "node:test"
import { stripVTControlCharacters } from "node:util"

describe("normal case", () => {
  describe("--list options", () => {
    it("should list all scenarios", async (t) => {
      const stdout = stripVTControlCharacters(
        execSync("node src/bin/index.mjs --list", {
          encoding: "utf-8",
        }),
      )

      // remove custom scenarios for test stability
      const lines = stdout.split("\n")
      // const customScenarios = lines.filter(line => /\s+custom\s+/.test(line))
      const builtinScenarios = lines.filter(
        (line) => !/\s+custom\s+/.test(line),
      )

      const actual = builtinScenarios.join("\n")

      // console.log("actual:", actual)

      t.assert.snapshot(actual)

      //       assert.equal(
      //         stdout,
      //         `
      //   Available scenarios:

      //   Name                      Source       Description
      //   ───────────────────────── ──────────── ──────────────────────────────
      //   temp                      custom       这是一个自定义场景 "temp"
      //   default                   builtin      标准对话演示，包含 markdown 列表 / 代码块 / 表格 / 任务列表
      //   different-pacing          builtin      演示具备不同生成速度
      //   echo                      builtin      Echo user messages as streaming markdown response — send any markdown as the last user message and see it streamed back
      //   empty                     builtin      直接返回 data: [DONE]，仅终止标记，无输出内容
      //   english-i-have-a-dream    builtin      👨🏿‍🦱🎤🗽 Martin Luther King, Jr. I Have a Dream
      //   error-content-filter      builtin      模拟 HTTP 400 内容过滤错误
      //   error-interrupted         builtin      输出到一半模拟流中断
      //   error-malformed           builtin      输出内容包含不完整 JSON，测试前端解析容错
      //   error-rate-limit          builtin      模拟 HTTP 429 限流错误，响应含 Retry-After 头
      //   error-server-error        builtin      模拟 HTTP 500 服务器内部错误
      //   error-timeout             builtin      模拟连接超时 —— 输出一段内容后直接断开连接
      //   markdown-demo             builtin      完整 GFM 演示 —— diff / Mermaid / 数学公式 / 嵌套引用 / Emoji

      // `,
      //       )
    })
  })
})
