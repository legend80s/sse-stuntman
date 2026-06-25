/**
 * @file CLI 参数解析器。
 *
 * 支持子命令模式：
 *   sse-stuntman [options]           # 启动服务器
 *   sse-stuntman create-scenario <n> # 创建场景
 *   sse-stuntman --list              # 列出场景
 *   sse-stuntman --help              # 帮助
 */

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

		// 子命令
		if (arg === 'create-scenario') {
			options.createScenario = argv[++i] ?? ''
			if (!options.createScenario) {
				console.error('\x1b[31mError:\x1b[0m create-scenario requires a name argument.')
				console.error('  Example: \x1b[33msse-stuntman create-scenario my-scenario\x1b[0m')
				process.exit(1)
			}
			continue
		}

		switch (arg) {
			case '--port': {
				const val = argv[++i]
				const parsed = Number(val)
				if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
					console.error(`\x1b[31mError:\x1b[0m --port must be 1-65535, got "${val}"`)
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
					console.error(`\x1b[31mError:\x1b[0m --delay must be >= 0, got "${val}"`)
					process.exit(1)
				}
				options.delay = parsed
				break
			}
			case '--model': {
				options.model = argv[++i] ?? 'gpt-4o'
				break
			}
			case '--scenarios-dir': {
				options.scenariosDir = argv[++i]
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
					console.error(`\x1b[31mUnknown option:\x1b[0m ${arg}`)
					console.error(`Run "\x1b[33msse-stuntman --help\x1b[0m" for usage.`)
					process.exit(1)
				}
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
