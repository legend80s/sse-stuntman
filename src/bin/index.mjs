#!/usr/bin/env node

/**
 * @file CLI 入口。
 *
 * 启动流程：
 *   1. 解析 CLI 参数
 *   2. 加载用户配置文件 ~/.sse-stuntman/config.mjs
 *   3. 合并配置（CLI > 配置文件 > 默认值）
 *   4. 启动服务器或执行子命令
 *
 * 路由分发：
 *   create-scenario → executeCreateScenario()
 *   其他            → startServer()
 */

import { mergeOptions, parseCliArgs, printHelp } from "../cli.mjs"
import { executeCreateScenario } from "../commands/create-scenario.mjs"
import { loadUserConfig } from "../config-loader.mjs"
import { startServer } from "../server.mjs"

const args = process.argv.slice(2)
const cliValues = parseCliArgs(args)

// 子命令：create-scenario
if (cliValues.createScenario) {
  executeCreateScenario(cliValues.createScenario, {
    openDir: cliValues.openScenariosDir !== false,
  })
  process.exit(0)
}

// --help
if (cliValues.help) {
  printHelp()
  process.exit(0)
}

// 加载用户配置并合并
const configValues = await loadUserConfig()
const options = mergeOptions(cliValues, configValues)

// 启动服务器
startServer(options)
