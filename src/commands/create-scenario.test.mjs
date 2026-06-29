/**
 * @file create-scenario 单元测试。
 *
 * 测试场景模板的创建、目录初始化和文件写操作。
 * 使用 node:test mock 拦截文件系统相关调用。
 * 注意：executeCreateScenario 会调用 spawn 打开文件管理器，在测试中会静默失败。
 */

import { describe, it, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// 待测试模块必须在 mock 之后动态导入
let executeCreateScenario
let getUserScenariosDir

describe('create-scenario', () => {
  /** @type {string} */
  let tmpDir

  before(async () => {
    // 创建临时目录并 mock os.homedir()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-scenario-test-'))
    mock.method(os, 'homedir', () => tmpDir)

    // 动态导入模块（此时 os.homedir 已被 mock）
    const mod = await import('./create-scenario.mjs')
    executeCreateScenario = mod.executeCreateScenario
    getUserScenariosDir = mod.getUserScenariosDir
  })

  after(() => {
    mock.restoreAll()
    // 清理 tmpDir
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('getUserScenariosDir()', () => {
    it('should return ~/.sse-stuntman/scenarios path', () => {
      const dir = getUserScenariosDir()
      assert.equal(dir, path.join(tmpDir, '.sse-stuntman', 'scenarios'))
    })
  })

  describe('executeCreateScenario()', () => {
    it('should create scenarios directory if not exists', () => {
      const scenariosDir = getUserScenariosDir()
      // 先确保目录不存在
      fs.rmSync(scenariosDir, { recursive: true, force: true })
      assert.equal(fs.existsSync(scenariosDir), false)

      executeCreateScenario('test-scenario', { openDir: false })

      assert.equal(fs.existsSync(scenariosDir), true)
    })

    it('should write a .md template file with correct name', () => {
      const scenariosDir = getUserScenariosDir()
      const filePath = path.join(scenariosDir, 'hello-world.md')

      assert.equal(fs.existsSync(filePath), false)

      executeCreateScenario('hello-world', { openDir: false })

      assert.equal(fs.existsSync(filePath), true)

      const content = fs.readFileSync(filePath, 'utf-8')
      assert.ok(content.includes('# hello-world'))
      assert.ok(content.includes('@desc'))
      assert.ok(content.includes('@delay'))
      assert.ok(content.includes('--chunk-strategy'))
      assert.ok(content.includes('@done'))
    })

    it('should not overwrite an existing scenario file', () => {
      const scenariosDir = getUserScenariosDir()
      const filePath = path.join(scenariosDir, 'no-overwrite.md')

      // 先写入一个已存在的场景
      fs.writeFileSync(filePath, 'EXISTING CONTENT', 'utf-8')

      executeCreateScenario('no-overwrite', { openDir: false })

      const content = fs.readFileSync(filePath, 'utf-8')
      assert.equal(content, 'EXISTING CONTENT')
    })

    it('should handle scenario name with special characters', () => {
      executeCreateScenario('my_custom-scenario.v2', { openDir: false })

      const scenariosDir = getUserScenariosDir()
      const filePath = path.join(scenariosDir, 'my_custom-scenario.v2.md')
      assert.equal(fs.existsSync(filePath), true)

      const content = fs.readFileSync(filePath, 'utf-8')
      assert.ok(content.includes('@desc'))
    })
  })
})
