/**
 * @file config-loader 单元测试
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getConfigFilePath, loadUserConfig } from './config-loader.mjs'

describe('config-loader', () => {
  describe('getConfigFilePath()', () => {
    it('should return ~/.sse-stuntman/config.mjs', () => {
      const result = getConfigFilePath()
      assert.ok(result.endsWith(path.join('.sse-stuntman', 'config.mjs')))
      assert.ok(result.startsWith(os.homedir()))
    })
  })

  describe('loadUserConfig()', () => {
    /** @type {string} */
    let tempHome

    before(() => {
      // 创建临时 home 目录，避免影响真实配置
      tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sse-config-test-'))
      const dotDir = path.join(tempHome, '.sse-stuntman')
      fs.mkdirSync(dotDir, { recursive: true })

      // 模拟配置文件
      fs.writeFileSync(path.join(dotDir, 'config.mjs'), `
export default {
  port: 8080,
  scenario: 'test-scenario',
  delay: 0.5,
  model: 'test-model',
  endpointPaths: ['/api/test/chat', '/api/test/stream'],
  scenariosDir: '/custom/scenarios',
}
`, 'utf-8')
    })

    after(() => {
      fs.rmSync(tempHome, { recursive: true, force: true })
    })

    it('should load config file when exists', async () => {
      // 临时 override homedir
      const origHomedir = os.homedir
      os.homedir = () => tempHome

      try {
        const config = await loadUserConfig()

        assert.ok(config, 'Should return config object')
        assert.equal(config.port, 8080)
        assert.equal(config.scenario, 'test-scenario')
        assert.equal(config.delay, 0.5)
        assert.equal(config.model, 'test-model')
        assert.deepEqual(config.endpointPaths, ['/api/test/chat', '/api/test/stream'])
        assert.equal(config.scenariosDir, '/custom/scenarios')
      } finally {
        os.homedir = origHomedir
      }
    })

    it('should return null when config file does not exist', async () => {
      const origHomedir = os.homedir
      const noConfigHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sse-no-config-'))
      os.homedir = () => noConfigHome

      try {
        const config = await loadUserConfig()
        assert.equal(config, null)
      } finally {
        os.homedir = origHomedir
        fs.rmSync(noConfigHome, { recursive: true, force: true })
      }
    })

    it('should return null when config file has syntax error', async () => {
      const origHomedir = os.homedir
      const badConfigHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sse-bad-config-'))
      const dotDir = path.join(badConfigHome, '.sse-stuntman')
      fs.mkdirSync(dotDir, { recursive: true })
      fs.writeFileSync(path.join(dotDir, 'config.mjs'), 'this is not valid javascript {', 'utf-8')
      os.homedir = () => badConfigHome

      try {
        const config = await loadUserConfig()
        assert.equal(config, null)
      } finally {
        os.homedir = origHomedir
        fs.rmSync(badConfigHome, { recursive: true, force: true })
      }
    })
  })
})
