# 贡献指南 / Contributing Guide

> 欢迎参与 sse-stuntman 的开发！本文档说明本地开发流程、代码规范和 PR 要求。
> Thank you for contributing! This guide covers local development, code conventions, and the PR workflow.

---

## 环境要求 / Prerequisites

- **Node.js** >= 18（内置 `node:test` 模块要求）
- **npm** 或 **pnpm**
- **git**

---

## 本地开发 / Local Development

### 1. 克隆项目

```bash
git clone https://github.com/legend80s/ai-chat-sse-mock.git
cd ai-chat-sse-mock
```

### 2. 安装依赖

```bash
npm install
```

> 当前项目零运行时依赖。`devDependencies` 仅用于代码检查。

### 3. 启动开发服务器

```bash
npm start
# 等效于: node bin/index.mjs

# 也可以带参数
node bin/index.mjs --port 8080 --scenario markdown-demo --delay 0.5
```

### 4. 运行测试

```bash
npm test
```

测试框架：[Node.js Test Runner](https://nodejs.org/api/test.html)
- 单元测试：`src/*.test.mjs`
- 集成测试：`src/server.test.mjs`（每个用例启动独立服务器）

---

## 项目结构 / Project Structure

```
├── bin/index.mjs              # CLI 入口 (bin)
├── src/
│   ├── cli.mjs                # 参数解析
│   ├── server.mjs             # HTTP 服务器
│   ├── scenario-parser.mjs    # .md → Chunk[]
│   ├── openai-stream.mjs      # SSE 输出器
│   ├── types.ts               # JSDoc 类型定义（仅类型检查）
│   ├── *.test.mjs             # 对应模块的测试
│   └── scenarios/             # 内置场景文件 (.md)
├── docs/                      # 文档体系
└── package.json
```

---

## 代码规范 / Code Conventions

### 风格

- `package.json` 中 `"type": "module"`，使用 ESM `import/export`
- 遵循 [biome.json](../biome.json) 配置（`indentStyle: tab`, `quoteStyle: double`）
- 使用 Biome 做格式化（如果已安装）：`npx @biomejs/biome check --write .`

### 命名

| 类型 | 约定 | 示例 |
|------|------|------|
| 文件 | kebab-case | `scenario-parser.mjs` |
| 导出函数 | camelCase | `parseScenarioFile()` |
| 常量 | UPPER_SNAKE | `SCENARIOS_DIR` |
| .md 场景文件 | kebab-case | `markdown-demo.md` |

### JSDoc

所有导出函数需要 JSDoc 注释：

```js
/**
 * 将 .md 场景文件解析为 Scenario 对象。
 *
 * @param {string} filePath - .md 文件的绝对路径
 * @returns {Scenario}
 */
export function parseScenarioFile(filePath) { ... }
```

类型引用使用 `@import` 语法：

```js
/**
 * @import { Scenario, Chunk } from './types.ts'
 */
```

### 测试

- 每个模块对应一个 `.test.mjs` 文件
- 使用 Node.js `node:test` 和 `node:assert/strict`
- 测试命名：`should do something when condition`
- 集成测试每个用例使用独立端口（`server.listen(0)` 自动分配）

---

## 添加新场景 / Adding a Scenario

1. 在 `src/scenarios/` 下创建 `.md` 文件
2. 文件名为场景名（如 `code-review.md`）
3. 使用 `@delay`、`@done` 指令和 `--chunk-strategy` 参数控制流式行为（见[场景编写指南](scenario-guide.md)）
4. 如果是错误场景，文件仅包含 `<!-- @error: TYPE -->`
5. 重启服务器自动发现新场景（`--list` 验证）

---

## 添加新 Provider / Adding a Provider

1. 在 `src/providers/` 下创建适配器（如 `anthropic.mjs`）
2. 实现 `ProviderAdapter` 接口（writeStream / writeError / parseRequest）
3. 在 `server.mjs` 中添加新端点的路由
4. 添加对应的 `.test.mjs`
5. 在 `roadmap.md` 中更新进度

> Provider 适配器接口说明（Phase 1 暂未实现抽象层，目前 `openai-stream.mjs` 是直接调用）：
> - `writeStream(chunks, res, options)` — 输出 SSE 流
> - `writeError(error, res)` — 输出错误响应
> - `parseRequest(body)` — 解析请求体

---

## 提交 PR / Pull Request

1. **确保测试通过**：`npm test` 全绿
2. **提交前检查**：确保没有 `console.log` 调试代码、没有死代码注释
3. **PR 标题**：语义化，如 `feat: support anthropic messages api`、`fix: handle BOM in scenario files`
4. **PR 描述**：说明变更内容、动机、测试方式

---

## 发布流程 / Release Process

```bash
# 1. 更新版本号
npm version patch  # 或 minor / major

# 2. 检查 package.json 中 files 字段包含所有发布文件
# 当前：bin/, src/, README.md

# 3. 发布
npm publish

# 4. 打 git tag
git push --tags
```
