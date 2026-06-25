/**
 * @file 用户配置文件加载器。
 *
 * 从 ~/.sse-stuntman/config.mjs 加载用户配置。
 * 配置文件是可选的 .mjs 模块，export default 一个配置对象。
 *
 * 优先级：CLI 参数 > 配置文件 > 内置默认值
 *
 * 示例 ~/.sse-stuntman/config.mjs：
 *
 *   export default {
 *     port: 8080,
 *     scenario: 'my-scenario',
 *     delayMultiplier: 0.5,
 *     defaultDelay: 10,
 *     model: 'deepseek-chat',
 *     endpointPaths: ['/management-service/api/intelligent-qa/chat'],
 *     scenariosDir: '/path/to/scenarios',
 *   }
 */

import path from "node:path"
import fs from "node:fs"
import os from "node:os"

/**
 * @import { CliOptions } from './types.ts'
 */

/**
 * 获取用户配置文件路径。
 *
 * @returns {string}
 */
export function getConfigFilePath() {
  return path.join(os.homedir(), ".sse-stuntman", "config.mjs")
}

/**
 * 加载用户配置文件。
 *
 * @returns {Promise<Partial<import('./types.ts').CliOptions> | null>}
 */
export async function loadUserConfig() {
  const configPath = getConfigFilePath()
  // console.log("configPath:", configPath)

  if (!fs.existsSync(configPath)) {
    return null
  }

  try {
    const config = await requireConfigFile(configPath)
    // console.log("config:", config)
    return normalizeConfig(config)
  } catch (/** @type {unknown} */ err) {
    console.warn(
      `\x1b[33mWarning:\x1b[0m Failed to load config file: ${configPath}`,
    )
    console.warn(`  ${/** @type {Error} */ (err).message}`)
    return null
  }
}

/**
 * 动态 import 配置文件。
 *
 * @param {string} configPath
 * @returns {Promise<Record<string, unknown>>}
 */
async function requireConfigFile(configPath) {
  const fileUrl = new URL(`file://${configPath.replace(/\\/g, "/")}`)
  // console.log("fileUrl:", fileUrl)
  const mod = await import(fileUrl.href)
  const config = /** @type {Record<string, unknown>} */ (mod.default ?? mod)

  return config
}

/**
 * 规范化配置值。
 *
 * @param {Record<string, unknown>} raw
 * @returns {Partial<import('./types.ts').CliOptions>}
 */
function normalizeConfig(raw) {
  /** @type {Partial<import('./types.ts').CliOptions>} */
  const config = {}

  if (raw.port != null) {
    const port = Number(raw.port)
    if (Number.isInteger(port) && port >= 1 && port <= 65535) {
      config.port = port
    }
  }

  if (raw.scenario != null) {
    config.scenario = String(raw.scenario)
  }

  if (raw.defaultDelay != null) {
    const defaultDelay = Number(raw.defaultDelay)
    if (!Number.isNaN(defaultDelay) && defaultDelay >= 0) {
      config.defaultDelay = defaultDelay
    }
  }

  if (raw.delayMultiplier != null) {
    const delayMultiplier = Number(raw.delayMultiplier)
    if (!Number.isNaN(delayMultiplier) && delayMultiplier >= 0) {
      config.delayMultiplier = delayMultiplier
    }
  }

  if (raw.model != null) {
    config.model = String(raw.model)
  }

  if (raw.endpointPaths != null && Array.isArray(raw.endpointPaths)) {
    config.endpointPaths = raw.endpointPaths
      .map(/** @param {unknown} p */ (p) => normalizePath(String(p)))
      .filter(Boolean)
  }

  if (raw.scenariosDir != null) {
    config.scenariosDir = String(raw.scenariosDir)
  }

  return config
}

/**
 * 规范化路径：确保前导 /，去除尾部 /。
 *
 * @param {string} p
 * @returns {string}
 */
function normalizePath(p) {
  if (!p || typeof p !== "string") return ""
  let result = p.trim()
  if (!result.startsWith("/")) {
    result = "/" + result
  }
  while (result.endsWith("/") && result !== "/") {
    result = result.slice(0, -1)
  }
  return result
}
