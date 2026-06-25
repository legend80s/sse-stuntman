/**
 * @file CLI 参数解析器。
 *
 * 使用 Node.js built-in `parseArgs`（`node:util`），零外部依赖。
 *
 * 支持子命令模式：
 *   sse-stuntman [options]           # 启动服务器
 *   sse-stuntman create-scenario <n> # 创建场景
 *   sse-stuntman --list              # 列出场景
 *   sse-stuntman --help              # 帮助
 */

import { parseArgs } from "node:util"

/**
 * @import { CliOptions } from './types.ts'
 */

const HELP_TEXT = `
  SSE Stuntman — stunt double for your AI API

  USAGE
    $ sse-stuntman [options]              Start mock server
    $ sse-stuntman create-scenario <name>  Create a new scenario

  SERVER OPTIONS
    --port <number>          Server port                        (default: 11434)
    --scenario <name>        Scenario name                      (default: "default")
    --delay <number>         Global delay multiplier            (default: 1)
    --model <name>           Default model name in SSE events   (default: "gpt-4o")
    --scenarios-dir <path>   Custom scenarios directory
    --list                   List all available scenarios
    --help                   Show this help text

  SUBCOMMANDS
    create-scenario <name>   Create a new scenario with template

  EXAMPLES
    $ sse-stuntman
    $ sse-stuntman --port 8080 --scenario markdown-demo
    $ sse-stuntman --delay 0.5 --model deepseek-chat
    $ sse-stuntman --list
    $ sse-stuntman create-scenario my-code-review
`

/**
 * 解析 CLI 参数。
 *
 * @param {string[]} argv
 * @returns {import('./types.ts').CliOptions}
 */
export function parseCliArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      port: { type: "string", default: "11434" },
      scenario: { type: "string", default: "default" },
      delay: { type: "string", default: "1" },
      model: { type: "string", default: "gpt-4o" },
      "scenarios-dir": { type: "string" },
      list: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  })

  // 子命令 create-scenario
  if (positionals.length > 0 && positionals[0] === "create-scenario") {
    const name = positionals[1]
    if (!name) {
      console.error(
        "\x1b[31mError:\x1b[0m create-scenario requires a name argument.",
      )
      console.error(
        "  Example: \x1b[33msse-stuntman create-scenario my-scenario\x1b[0m",
      )
      process.exit(1)
    }
    return {
      port: 11434,
      scenario: "default",
      delay: 1,
      model: "gpt-4o",
      list: false,
      help: false,
      createScenario: name,
    }
  }

  // 校验 port
  const port = Number(values.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(
      `\x1b[31mError:\x1b[0m --port must be 1-65535, got "${values.port}"`,
    )
    process.exit(1)
  }

  // 校验 delay
  const delay = Number(values.delay)
  if (Number.isNaN(delay) || delay < 0) {
    console.error(
      `\x1b[31mError:\x1b[0m --delay must be >= 0, got "${values.delay}"`,
    )
    process.exit(1)
  }

  return {
    port,
    scenario: values.scenario ?? "default",
    delay,
    model: values.model ?? "gpt-4o",
    list: values.list ?? false,
    help: values.help ?? false,
    scenariosDir: values["scenarios-dir"],
  }
}

/**
 * 打印帮助文本。
 */
export function printHelp() {
  console.log(HELP_TEXT)
}
