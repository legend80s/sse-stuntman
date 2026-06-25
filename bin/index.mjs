#!/usr/bin/env node

/**
 * @file CLI 入口文件。
 *
 * 供 package.json 的 bin 字段引用：`ai-sse-mock` 命令指向此文件。
 */

import { parseCliArgs, printHelp } from '../src/cli.mjs'
import { startServer } from '../src/server.mjs'

const args = process.argv.slice(2)
const options = parseCliArgs(args)

if (options.help) {
	printHelp()
	process.exit(0)
}

startServer(options)
