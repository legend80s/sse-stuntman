/**
 * @file create-scenario 子命令。
 *
 * 创建新的场景文件到 ~/.sse-stuntman/scenarios/ 目录。
 * 生成模板 .md，自动打开目录，彩色输出。
 */

import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { color } from "../utils/color.mjs"

/**
 * 获取用户场景目录（~/.sse-stuntman/scenarios/）。
 *
 * @returns {string}
 */
export function getUserScenariosDir() {
  const home = os.homedir()
  return path.join(home, ".sse-stuntman", "scenarios")
}

/**
 * 生成场景模板内容。
 *
 * @param {string} name - 场景名
 * @returns {string}
 */
function generateTemplate(name) {
  return `<!-- @desc: 这是一个自定义场景 "${name}" -->
# ${name}

在这里编写你的场景内容。

<!-- @delay: 100 -->

支持 **markdown** 语法、代码块、表格等。

<!-- @delay: 150 -->

\`\`\`javascript
console.log("Hello from ${name}");
\`\`\`

<!-- @delay: 120 -->

> 提示：使用 --chunk-strategy word 切换为逐词输出。

这是逐词输出的效果。

<!-- @done -->
`
}

/**
 * 执行 create-scenario 子命令。
 *
 * @param {string} name - 场景名
 * @param {{ openDir?: boolean }} [options] - 选项
 */

export function executeCreateScenario(name, options = {}) {
  const openDir = options.openDir !== false
  const scenariosDir = getUserScenariosDir()

  // 创建目录（如不存在）
  fs.mkdirSync(scenariosDir, { recursive: true })

  const filePath = path.join(scenariosDir, `${name}.md`)

  // 检查文件是否已存在
  if (fs.existsSync(filePath)) {
    console.log(`\n  ${color.yellow("⚠ 场景已存在")}: ${filePath}\n`)
  } else {
    // 写入模板
    const content = generateTemplate(name)
    fs.writeFileSync(filePath, content, "utf-8")
    console.log(`\n  ${color.green("✅  场景已创建！")}\n`)
  }

  console.log(`  ${color.cyan("继续编辑:")} ${color.yellow(filePath)}\n`)

  // 打开文件管理器
  if (openDir) {
    openFolder(scenariosDir)
  }
}

/**
 * 在文件管理器中打开目录（跨平台）。
 *
 * @param {string} dir
 */
function openFolder(dir) {
  /** @type {string} */
  let cmd
  /** @type {string[]} */
  let args

  switch (process.platform) {
    case "darwin": {
      cmd = "open"
      args = [dir]
      break
    }
    case "win32": {
      cmd = "explorer"
      args = [dir.replace(/\//g, "\\")]
      break
    }
    default: {
      // Linux
      cmd = "xdg-open"
      args = [dir]
      break
    }
  }

  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref()
  } catch {
    // 忽略打开失败
  }
}
