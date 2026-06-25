/**
 * @file CLI 参数解析器。
 *
 * 零外部依赖，手写参数解析。支持的选项：
 *
 * ```
 * ai-sse-mock [options]
 *
 * Options:
 *   --port <number>      Server port (default: 11434)
 *   --scenario <name>    Scenario name (default: "default")
 *   --delay <number>     Global delay multiplier, 0.5 = half speed, 2 = double (default: 1)
 *   --model <name>       Default model name in SSE responses (default: "gpt-4o")
 *   --list               List all built-in scenarios and exit
 *   --help               Show help text and exit
 * ```
 */

/**
 * @import { CliOptions } from './types.ts'
 */

const HELP_TEXT = `
  AI SSE Mock Server — simulate AI streaming responses

  USAGE
    $ ai-sse-mock [options]

  OPTIONS
    --port <number>      Server port                        (default: 11434)
    --scenario <name>    Scenario name                      (default: "default")
    --delay <number>     Global delay multiplier            (default: 1)
    --model <name>       Default model name in SSE events   (default: "gpt-4o")
    --list               List all built-in scenarios
    --help               Show this help text

  EXAMPLES
    $ ai-sse-mock
    $ ai-sse-mock --port 8080 --scenario markdown-demo
    $ ai-sse-mock --delay 0.5 --model deepseek-chat
    $ ai-sse-mock --list

  SCENARIOS
    delay:set delay in ms between chunks (e.g. <!-- @delay: 200 -->)
    chunk: change split strategy — sentence|word|char|line|paragraph
    done:  stop the stream at this point
    error: whole-file error scenario — rate-limit|content-filter|server-error|timeout|empty

`.trim()

/**
 * 解析 CLI 参数。
 *
 * @param {string[]} argv - 命令行参数（不含 node 和脚本路径）
 * @returns {import('./types.ts').CliOptions}
 */
export function parseCliArgs(argv) {
	/** @type {import('./types.ts').CliOptions} */
	const options = {
		port: 11434,
		scenario: 'default',
		delay: 1,
		model: 'gpt-4o',
		list: false,
		help: false,
	}

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		switch (arg) {
			case '--port': {
				const val = argv[++i]
				const parsed = Number(val)
				if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
					console.error(`Error: --port must be a valid port number (1-65535), got "${val}"`)
					process.exit(1)
				}
				options.port = parsed
				break
			}
			case '--scenario': {
				options.scenario = argv[++i] ?? 'default'
				break
			}
			case '--delay': {
				const val = argv[++i]
				const parsed = Number(val)
				if (Number.isNaN(parsed) || parsed < 0) {
					console.error(`Error: --delay must be a non-negative number, got "${val}"`)
					process.exit(1)
				}
				options.delay = parsed
				break
			}
			case '--model': {
				options.model = argv[++i] ?? 'gpt-4o'
				break
			}
			case '--list': {
				options.list = true
				break
			}
			case '--help':
			case '-h': {
				options.help = true
				break
			}
			default: {
				if (arg.startsWith('-')) {
					console.error(`Unknown option: ${arg}`)
					console.error(`Run "ai-sse-mock --help" for usage.`)
					process.exit(1)
				}
				// 位置参数忽略
			}
		}
	}

	return options
}

/**
 * 打印帮助文本。
 */
export function printHelp() {
	console.log(HELP_TEXT)
}
