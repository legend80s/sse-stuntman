- [x] 写用户手册 readme
- [x] add test
- [x] 使用：npx sse-stuntman 或 CLI sse-stuntman
- [ ] 结合 faker 库，增加种子
- [ ] 支持外部 .aisemockrc.yaml / aisemock.config.ts
- [ ] 录播模式：--record 转发真实 API 并保存响应，后续离线回放
- [ ] --list 用 console.table 更美观
- [x] parseCliArgs 改成 Node.js builtin `import { parseArgs } from 'node:util';`
- [x] 新建 commands 目录，`create-scenario.mjs` 放入其内
- [ ] UI 界面测试
- [x] 给”自定义场景功能”增加测试
- [x] replace all the `ai-sse-mock` to `sse-stuntman`
- [ ] 如果本库要能在自动化测试中使用，应该如何修改？
- [ ] Add English README
- [x] fix all the `pnpm typecheck` errors if `// @ts-ignore` or `// @ts-expect-error` are used your should pointed out and comment why.
- [ ] 测试 word by word SSE mock
- [ ] 当 server 已启动，用户新增的场景，如何让 server 知道？增加 `sse-stuntman --watch` 命令？
- [ ] 每次执行新增场景的自动化测试，都会自动打开 explorer 体验不好，增加参数不打开。
- [ ] `--help` 是否展示默认值
- [ ] reuse and simplify `normalizePath` function
- [ ] src/server.test.mjs:519 Anthropic 独立测试文件
- [ ] message_start input_tokens: inputTokens should be always ZERO.
- [ ] can we refactor use the "Open for extension and close for modification" Principle in S.O.L.I.D. so when new provider added the core never touched and only new files or little changes will be made to existing code. Thus separate the invariants from the variants.
- [ ] Add a scenario that echo the input so the the user can customize the SSE markdown as what he want.
- [ ] 切分策略用场景 md 里面的指令而非用 cli option 有什么好处吗？
- [ ] 通过 cli 参数指定输出的语言，默认用系统语言
- [ ] cli 参数 scenario 可以支持文件路径，自动读取指定文件当做 scenario
- [ ] add test for new directive `@input`: the `@input` can be added in any place and any times in builtin or user created scenario markdown, when the parser see this directive it will insert and replace the user promt. Thus the static scenario seems more real.

```bash
curl -X POST http://localhost:11434/v1/chat/completions?scenario=echo \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"# Hello\n\nYour **markdown** here"}]}'
```