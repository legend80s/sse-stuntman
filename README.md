# SSE Stuntman 🏍️ An SSE Stream Mock Server

<p>
  <a href="https://www.npmjs.com/package/sse-stuntman" target="_blank">
    <img src="https://img.shields.io/npm/v/sse-stuntman.svg" alt="npm version" />
  </a>

  <a href="https://www.npmjs.com/package/sse-stuntman">
    <img src="https://img.shields.io/npm/dm/sse-stuntman.svg" alt="npm downloads" />
  </a>

  <a href="https://github.com/legend80s/sse-stuntman/blob/main/advance.md" target="_blank">
    <img alt="coverage" src="https://img.shields.io/badge/coverage%2095.8%25-green" />
  </a>
</p>

```md
╔═══════════════════════════════════════════════════╗
║   ███████╗████████╗██╗   ██╗███╗   ██╗████████╗   ║
║   ██╔════╝╚══██╔══╝██║   ██║████╗  ██║╚══██╔══╝   ║
║   ███████╗   ██║   ██║   ██║██╔██╗ ██║   ██║      ║
║   ╚════██║   ██║   ██║   ██║██║╚██╗██║   ██║      ║
║   ███████║   ██║   ╚██████╔╝██║ ╚████║   ██║      ║
║   ╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═══╝   ╚═╝      ║
║                                                   ║
║     SSE Stuntman  |  Your AI's Stunt Double       ║
╚═══════════════════════════════════════════════════╝

✓ OpenAI provider ready
✓ SSE endpoint: http://localhost:16828
```

> **Stuntman — takes on the "dangerous" testing tasks so your real AI API doesn't have to**
>
> As a frontend developer, how do you quickly test that typewriter-style AI streaming output?
>
> Start `sse-stuntman` with one command — no real API key needed — to simulate various scenarios:
>
> Normal markdown streaming output, tables/code blocks/Mermaid diagrams, HTTP errors, timeout disconnections…

## Features

- ✨ **Zero dependencies** — fully leverages Node.js built-in modules
- 🎯 **OpenAI and Anthropic compatible** — `POST /v1/chat/completions`, standard SSE format, works directly with mainstream frontend SDKs
- ⏱ **Precise timing control** — millisecond-level control per message interval to simulate real typewriter effects
- 💥 **Comprehensive error simulation** — `429` / `400` / `500` / timeout disconnection / empty response, covering real-world exceptions
- 🌐 **CORS fully open** — cross-origin calls directly from the browser
- 🖥 **Built-in Web UI** — open the homepage in a browser for a streaming output demo
- 📝 **Scenarios are Markdown** — 13 built-in scenarios. Use `.md` files to describe AI output content and pacing. Readable, version-controllable, scenario files can be checked into your codebase
- 📂 **Custom scenarios** — place `.md` files in `~/.sse-stuntman/scenarios/` to auto-register. Supports custom directories. Scenarios can be managed with git
- 🎤 **Custom input** — inject request message content into scenario streams with the `@input` directive to make static scenarios "alive"

## Quick Start

```bash
npx sse-stuntman --default-delay 100 --scenario echo
# 🏍️  SSE Stuntman — server ready at http://localhost:16828
```

```bash
curl -N -X POST http://localhost:16828/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"# Hello\n\nYour **markdown** here"}],"stream": true}'
```

### Usage

Suppose you have a `POST http://localhost:9095/api/my/chat` SSE request that should return OpenAI-standard markdown streaming output, and your frontend needs to test it:

```bash
npx sse-stuntman --port 9095 --endpoint-path 'api/my/chat'
```

This starts an SSE mock server. You can directly make requests from your code. Try curl to see response:

```bash
curl -N -X POST http://localhost:9095/api/my/chat \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-5.5", "stream": true, "messages": [] }'
```

## CLI Common Arguments

```bash
sse-stuntman -h
```

| Argument | Default | Description |
| ------ | -------- | ------ |
| `--port <number>` | `16828` | Server port |
| `--scenario <name>` | `default` | Scenario name or `.md` file path (absolute/relative) |
| `--delay-multiplier <number>` | `1` | Global delay multiplier (`0.5` half speed, `2` double speed) |
| `--default-delay <number>` / `-d` | `10` | Default chunk interval (ms) when no `@delay` in scenario |
| `--model <name>` | `gpt-4o` | Model name in SSE events |
| `--endpoint-path <path>` / `-e` | `/v1/chat/completions` | Custom POST endpoint path; can be specified multiple times for multiple paths (e.g. `-e /chat -e /api/chat`) |
| `--provider <name>` | `openai` | Output format: `openai` (Chat Completions SSE) or `anthropic` (Messages SSE) |
| `--chunk-strategy <name>` | `word` | Text chunking strategy: `word` / `sentence` / `char` / `line` / `paragraph` |
| `--scenarios-dir <path>` | — | Custom scenarios directory (overrides default path) |
| `--list` | — | List all built-in + custom scenarios |
| `create-scenario <name>` | — | Create a new scenario template |
| `--help` / `-h` | — | Show help |

### Examples

```bash
# Start server
sse-stuntman

# List all scenarios
sse-stuntman --list

# Create a custom scenario
sse-stuntman create-scenario my-code-review

# Use a custom scenario
sse-stuntman --scenario my-code-review

# Use a .md file directly as a scenario (no need to place in scenarios dir)
sse-stuntman --scenario ./relative/test.md

# Half speed output
sse-stuntman --delay-multiplier 0.5

# Custom endpoint path (for clients that can't modify code)
sse-stuntman --endpoint-path /api/my/chat

# Multiple endpoint paths (mock multiple URLs at once)
sse-stuntman -e /api/v1/chat -e /api/v2/chat -e /chat
```

---

## Development

```bash
# Start server
node --watch --watch-preserve-output src/bin/index.mjs -s english-i-have-a-dream.md -p 16828

# Run tests (74 test cases)
npm test

# List scenarios
node src/bin/index.mjs --list
```

## Advanced Usage

[advance.md](./advance.md) covers: CLI arguments, built-in scenarios, custom scenarios, configuration file, frontend integration, special directives

## License

MIT &copy; 2026 [legend80s](https://github.com/legend80s)
