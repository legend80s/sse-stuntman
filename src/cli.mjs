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
 *
 * 配置优先级：CLI 参数 > ~/.sse-stuntman/config.mjs > 内置默认值
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
    -p, --port <number>      Server port                        (default: 16828)
    -s, --scenario <name>    Scenario name                      (default: "default")
    --delay-multiplier <number> Global delay multiplier          (default: 1)
                             Each chunk's delay (ms) is multiplied by this value.
                             e.g. @delay: 200 + --delay-multiplier 2 = 400ms per chunk
    -d, --default-delay <number> Default delay for chunks (ms)  (default: 5)
                             When scenario has no @delay, this value is used.
                             Can be overridden per-section with @delay in .md.
    --provider <name>       Output format provider              (default: "openai")
                             "openai" (Chat Completions SSE) or "anthropic" (Messages SSE)
    --chunk-strategy <name>  Text split strategy                (default: "word")
                             "word" (default), "sentence", "char", "line", or "paragraph"
    -m, --model <name>       Default model name in SSE events   (default: "gpt-4o")
    -e, --endpoint-path <path>  Custom POST endpoint path       (default: "/v1/chat/completions")
                             (can be specified multiple times for multiple paths)
                             Automatically defaults to "/v1/messages" when --provider anthropic
    --scenarios-dir <path>   Custom scenarios directory
    --open-scenarios-dir / --no-open-scenarios-dir
                             Open file manager after creating scenario
                             (default: on, use --no-open-scenarios-dir to disable)
    -l, --list               List all available scenarios
    -h, --help               Show this help text

  SUBCOMMANDS
    create-scenario <name>   Create a new scenario with template

  EXAMPLES
    $ sse-stuntman
    $ sse-stuntman --port 8080 --scenario markdown-demo
    $ sse-stuntman --delay-multiplier 0.5 --model deepseek-chat
    $ sse-stuntman -e /api/v1/chat -e /api/v2/chat
    $ sse-stuntman --list
    $ sse-stuntman create-scenario my-code-review
`

/** 内置默认值 */
export const DEFAULTS = {
  port: 16828,
  scenario: "default",
  delayMultiplier: 1,
  defaultDelay: 10, // ms
  provider: /** @type {import('./types.ts').Provider} */ ("openai"),
  model: "gpt-4o",
  endpointPaths: ["/v1/chat/completions"],
  list: false,
  help: false,
  chunkStrategy: /** @type {import('./types.ts').ChunkStrategy} */ ("word"),
}

/**
 * 场景缓存 key。
 *
 * 避免每次请求都重新解析 .md 文件。parseScenarioFile 是纯函数：
 * 入参相同则输出相同，所以用入参做 key。
 *
 * 包含 name + strategy + defaultDelay——三者都直接影响解析结果：
 *    name            → 选择哪个文件
 *    strategy        → splitContent 如何切分文本
 *    defaultDelay    → 无 @delay 指令的 chunk 的延迟值
 *
 * 曾踩过的坑：defaultDelay 不在 key 中时，UI 改了延迟但命中旧缓存，
 * 导致修改不生效。见 cli.mjs 历史。
 *
 * 不包含 provider / delayMultiplier / port——它们不影响解析结果，
 * 仅在后续写入 SSE 流时消费。
 *
 * @param {string} name
 * @param {import('./types.ts').ChunkStrategy} [strategy]
 * @param {number} [defaultDelay]
 */
export function scenarioCacheKey(
  name,
  strategy = /** @type {import('./types.ts').ChunkStrategy} */ (DEFAULTS.chunkStrategy),
  defaultDelay = DEFAULTS.defaultDelay,
) {
  return `${name}::${strategy}::${defaultDelay}`
}

/**
 * 解析 CLI 参数（不加载配置文件）。
 * 返回的对象可能缺少部分字段（未在 CLI 中提供时），
 * 需通过 mergeOptions() 合并默认值和配置文件。
 *
 * @param {string[]} argv
 * @returns {Partial<import('./types.ts').CliOptions>}
 */
export function parseCliArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      port: { type: "string", short: "p" },
      scenario: { type: "string", short: "s" },
      "delay-multiplier": {
        type: "string",
        default: String(DEFAULTS.delayMultiplier),
      },
      "default-delay": {
        type: "string",
        short: "d",
        default: String(DEFAULTS.defaultDelay),
      },
      provider: { type: "string" },
      "chunk-strategy": { type: "string", default: DEFAULTS.chunkStrategy },
      model: { type: "string", short: "m" },
      "endpoint-path": { type: "string", multiple: true, short: "e" },
      "scenarios-dir": { type: "string" },
      "open-scenarios-dir": { type: "boolean", default: true },
      list: { type: "boolean", default: false, short: "l" },
      help: { type: "boolean", default: false, short: "h" },
    },
    allowPositionals: true,
    allowNegative: true,
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
      ...DEFAULTS,
      createScenario: name,
      openScenariosDir: values["open-scenarios-dir"],
    }
  }

  // 收集 CLI 显式提供的值（未提供时不包含该属性）
  const cliValues = {}
  if (values.port !== undefined) {
    cliValues.port = Number(values.port)
  }
  if (values.scenario !== undefined) {
    cliValues.scenario = values.scenario
  }
  if (values["delay-multiplier"] !== undefined) {
    cliValues.delayMultiplier = Number(values["delay-multiplier"])
  }
  if (values["default-delay"] !== undefined) {
    cliValues.defaultDelay = Number(values["default-delay"])
  }
  if (values.model !== undefined) {
    cliValues.model = values.model
  }
  if (values.provider !== undefined) {
    cliValues.provider = normalizeProvider(values.provider)
  }
  if (values["chunk-strategy"] !== undefined) {
    cliValues.chunkStrategy = normalizeChunkStrategy(values["chunk-strategy"])
  }
  if (values["endpoint-path"]) {
    cliValues.endpointPaths = values["endpoint-path"]
      .map(normalizePath)
      .filter(Boolean)
  }
  if (values["scenarios-dir"] !== undefined) {
    cliValues.scenariosDir = values["scenarios-dir"]
  }
  cliValues.list = values.list ?? false
  cliValues.help = values.help ?? false

  // 校验 port
  if (cliValues.port != null) {
    if (
      !Number.isInteger(cliValues.port) ||
      cliValues.port < 1 ||
      cliValues.port > 65535
    ) {
      console.error(
        `\x1b[31mError:\x1b[0m --port must be 1-65535, got "${values.port}"`,
      )
      process.exit(1)
    }
  }

  // 校验 delay-multiplier
  if (cliValues.delayMultiplier != null) {
    if (
      Number.isNaN(cliValues.delayMultiplier) ||
      cliValues.delayMultiplier < 0
    ) {
      console.error(
        `[31mError:[0m --delay-multiplier must be >= 0, got "${values["delay-multiplier"]}"`,
      )
      process.exit(1)
    }
  }

  // 校验 default-delay
  if (cliValues.defaultDelay != null) {
    if (Number.isNaN(cliValues.defaultDelay) || cliValues.defaultDelay < 0) {
      console.error(
        `\x1b[31mError:\x1b[0m --default-delay must be >= 0, got "${values["default-delay"]}"`,
      )
      process.exit(1)
    }
  }

  return cliValues
}

/**
 * 规范化并校验 provider 值。
 *
 * @param {string} s
 * @returns {import('./types.ts').Provider}
 */
function normalizeProvider(s) {
  const v = s.toLowerCase()
  if (v !== "openai" && v !== "anthropic") {
    console.error(
      `\x1b[31mError:\x1b[0m --provider must be "openai" or "anthropic", got "${s}"`,
    )
    process.exit(1)
  }
  return v
}

/**
 * 规范化并校验 chunk-strategy 值。
 *
 * @param {string} s
 * @returns {import('./types.ts').ChunkStrategy}
 */
function normalizeChunkStrategy(s) {
  const v = s.toLowerCase()
  const valid = ["sentence", "word", "char", "line", "paragraph"]
  if (!valid.includes(v)) {
    console.error(
      `\x1b[31mError:\x1b[0m --chunk-strategy must be one of: ${valid.join(", ")}, got "${s}"`,
    )
    process.exit(1)
  }
  return /** @type {import('./types.ts').ChunkStrategy} */ (v)
}

/**
 * 合并 CLI 参数与配置文件（CLI 优先）。
 *
 * @param {Partial<import('./types.ts').CliOptions>} cliValues
 * @param {Partial<import('./types.ts').CliOptions> | null} configValues
 * @returns {import('./types.ts').CliOptions}
 */
export function mergeOptions(cliValues, configValues) {
  /** @type {import('./types.ts').CliOptions} */
  const result = { ...DEFAULTS }

  if (configValues) {
    if (configValues.port != null) {
      result.port = configValues.port
    }
    if (configValues.scenario != null) {
      result.scenario = configValues.scenario
    }
    if (configValues.delayMultiplier != null) {
      result.delayMultiplier = configValues.delayMultiplier
    }
    if (configValues.defaultDelay != null) {
      result.defaultDelay = configValues.defaultDelay
    }
    if (configValues.model != null) {
      result.model = configValues.model
    }
    if (configValues.provider != null) {
      result.provider = normalizeProvider(configValues.provider)
    }
    if (configValues.chunkStrategy != null) {
      result.chunkStrategy = normalizeChunkStrategy(configValues.chunkStrategy)
    }
    if (configValues.endpointPaths != null) {
      result.endpointPaths = configValues.endpointPaths
    }
    if (configValues.scenariosDir != null) {
      result.scenariosDir = configValues.scenariosDir
    }
  }

  // CLI 覆盖
  if (cliValues.port != null) {
    result.port = cliValues.port
  }
  if (cliValues.scenario != null) {
    result.scenario = cliValues.scenario
  }
  if (cliValues.delayMultiplier != null) {
    result.delayMultiplier = cliValues.delayMultiplier
  }
  if (cliValues.defaultDelay != null) {
    result.defaultDelay = cliValues.defaultDelay
  }
  if (cliValues.model != null) {
    result.model = cliValues.model
  }
  if (cliValues.provider != null) {
    result.provider = cliValues.provider
  }
  if (cliValues.chunkStrategy != null) {
    result.chunkStrategy = cliValues.chunkStrategy
  }
  if (cliValues.endpointPaths != null) {
    result.endpointPaths = cliValues.endpointPaths
  }
  if (cliValues.scenariosDir != null) {
    result.scenariosDir = cliValues.scenariosDir
  }

  // 当 provider 为 anthropic 且未显式指定 endpointPaths 时，默认路径切换到 /v1/messages
  if (
    result.provider === "anthropic" &&
    !cliValues.endpointPaths &&
    !configValues?.endpointPaths
  ) {
    result.endpointPaths = ["/v1/messages"]
  }

  // 布尔值
  if (cliValues.list != null) {
    result.list = cliValues.list
  }
  if (cliValues.help != null) {
    result.help = cliValues.help
  }
  if (cliValues.createScenario != null) {
    result.createScenario = cliValues.createScenario
  }

  return result
}

/**
 * 规范化路径：确保前导 /，去除尾部 /。
 *
 * @param {string} p
 * @returns {string}
 */
function normalizePath(p) {
  let result = p
  if (!result.startsWith("/")) {
    result = "/" + result
  }
  while (result.endsWith("/") && result !== "/") {
    result = result.slice(0, -1)
  }
  return result
}

/**
 * 打印帮助文本。
 */
export function printHelp() {
  console.log(HELP_TEXT)
}
