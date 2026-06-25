#!/usr/bin/env node

/**
 * @file CLI 入口。
 *
 * 路由分发：
 *   create-scenario → executeCreateScenario()
 *   其他            → startServer()
 */

import { parseCliArgs, printHelp } from '../src/cli.mjs'
import { executeCreateScenario } from '../src/create-scenario.mjs'
import { startServer } from '../src/server.mjs'

const args = process.argv.slice(2)
const options = parseCliArgs(args)

// 子命令：create-scenario
if (options.createScenario) {
	executeCreateScenario(options.createScenario)
	process.exit(0)
}

// --help
if (options.help) {
	printHelp()
	process.exit(0)
}

// 启动服务器
startServer(options)
