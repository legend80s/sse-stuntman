# Advanced Usage

## CLI Commands

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

## Custom Scenarios

### Method 1: `create-scenario` subcommand (recommended)

```bash
sse-stuntman create-scenario review
# ✅ Scenario created!
# Edit at: ~/.sse-stuntman/scenarios/review.md
# (directory opened automatically)
```

### Method 2: Create file manually

Place any `.md` file in `~/.sse-stuntman/scenarios/`:

```bash
echo '<!-- @desc: My scenario -->' > ~/.sse-stuntman/scenarios/my-scenario.md
```

### Scenario File Format

```markdown
<!-- @desc: Code Review scenario -->
# Code Review

I'll help review your code.

<!-- @delay: 200 -->

| File | Issue | Severity |
|------|------|--------|
| `src/auth.ts` | Missing validation | 🔴 High |

<!-- @delay: 150 -->

This content is output word by word (enabled via `--chunk-strategy word`).

<!-- @done -->
```

**Directives overview:**

| Directive | Example | Effect |
| ------ | ------ | ------ |
| `@delay:N` | `<!-- @delay: 200 -->` | Chunk interval (ms) |
| `@desc:TEXT` | `<!-- @desc: description -->` | Scenario description (shown in `--list`) |
| `@done` | `<!-- @done -->` | Terminate the stream here |
| `@error:TYPE` | `<!-- @error: rate-limit -->` | Mark the entire file as an error scenario |
| `@input` | `<!-- @input -->` | Placeholder, replaced with the last user message content |

### Scenario Loading Order

```bash
1. --scenarios-dir specified directory   (explicit, highest priority)
2. ~/.sse-stuntman/scenarios/           (user global scenarios)
3. Built-in scenarios                    (fallback)
```

Scenarios with the same name: higher priority overrides lower priority.

## Configuration File

Persist configuration via `~/.sse-stuntman/config.mjs` to avoid passing arguments on every startup.

```js
export default {
  port: 8080,
  scenario: 'my-scenario',
  delay: 0.5,
  model: 'deepseek-chat',
  endpointPaths: ['/api/my/chat', '/api/v2/chat'],
  scenariosDir: '/path/to/scenarios',
}
```

**Priority:** CLI arguments > Config file > Built-in defaults

## Automated Testing (Programmatic API)

Use `sse-stuntman` in your test suite without the CLI — `startServer` is exported directly.

```js
import { startServer } from 'sse-stuntman'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

describe('AI chat', () => {
  let server

  before(() => {
    server = startServer({
      port: 0,              // 0 = OS assigns a free port
      delayMultiplier: 0,   // instant (no real delay)
      defaultDelay: 5,
      scenario: 'echo',     // echoes back user message
      model: 'gpt-4o',
    })
  })

  after(() => { server.close() })

  it('should stream back the user message', async () => {
    const port = server.address().port
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: '# Hello\n\nWorld' }],
        stream: true,
      }),
    })

    const reader = res.body.getReader()
    let text = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      text += new TextDecoder().decode(value)
    }

    assert.ok(text.includes('Hello'))
    assert.ok(text.includes('World'))
  })
})
```

> **Note:** `port: 0` tells the OS to assign a random available port. Read the actual port via `server.address().port` after the server starts. For `port: 0`, the launch screen will show port `0` — use `server.address().port` to get the real value.

### Scenario switching per-request

Override scenario, provider, or chunk strategy per request via query parameters:

```js
const res = await fetch(
  `http://127.0.0.1:${port}/v1/chat/completions?scenario=markdown-demo&chunk-strategy=line`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
)
```

### Full test patterns

See [`src/server.test.mjs`](./src/server.test.mjs) for complete examples including SSE event parsing, error scenarios, and non-streaming responses.

## Frontend Integration

### curl Testing

```bash
# Streaming request
curl -N -X POST http://localhost:16828/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-4o", "stream": true, "messages": [] }'

# Switch scenario
curl -N -X POST "http://localhost:16828/v1/chat/completions?scenario=markdown-demo" \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-4o", "stream": true, "messages": [] }'

# Non-streaming
curl -s -X POST http://localhost:16828/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-4o", "stream": false, "messages": [] }' | jq .
```

### Fetch API (Browser)

```js
const res = await fetch('http://localhost:16828/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-4o', messages: [], stream: true }),
})
```

### Vercel AI SDK

```ts
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

const result = streamText({
  model: openai('gpt-4o'),
  messages: [{ role: 'user', content: 'Hello' }],
  baseURL: 'http://localhost:16828/v1',
})
```

### OpenAI SDK

```ts
import OpenAI from 'openai'
const client = new OpenAI({ baseURL: 'http://localhost:16828/v1', apiKey: 'sk-mock' })
const stream = await client.chat.completions.create({ model: 'gpt-4o', messages: [], stream: true })
```

## Built-in Scenarios

| Scenario | Description |
| ------ | ------ |
| `default` | Standard conversation, markdown lists/code blocks/tables |
| `markdown-demo` | Full GFM demo — diff/Mermaid/math formulas |
| `english-i-have-a-dream` | 👨🏿‍🦱🎤🗽 Martin Luther King, Jr. I Have a Dream |
| `echo` | Stream back the last user message content as SSE |
| `empty` | Return `[DONE]` immediately |
| `error-interrupted` | Interrupt mid-response |
| `error-malformed` | Output contains invalid JSON |
| `error-rate-limit` | HTTP 429 rate limited |
| `error-content-filter` | HTTP 400 content filter |
| `error-server-error` | HTTP 500 server error |
| `error-timeout` | Connection drops after some output |

## Special Directives

### `@input` Directive: Making Static Scenarios "Alive"

`@input` is a **positional placeholder directive** that can be inserted anywhere in any `.md` scenario file via `<!-- @input -->`. At request time, it is replaced with the content of the last `role: "user"` message in the request body.

#### Why `@input`?

Built-in scenarios have fixed output. When testing a frontend, you want to see **your own input** streamed back, not preset example text. `@input` solves two problems:

1. **Custom testing** — Send your own markdown content to the backend and see how it renders as a SSE stream
2. **Hybrid scenarios** — Insert user input in the middle of a preset scenario's context for more realistic conversations

#### Pure Echo: `echo` Scenario

The built-in `echo` scenario contains only the `@input` directive; delay is fully controlled by `--default-delay` / `-d`:

```markdown
<!-- @desc: Echo user messages as streaming markdown response -->
<!-- @input -->
```

At request time, the last user message is automatically streamed back word by word:

```bash
curl -N -X POST "http://localhost:16828/v1/chat/completions?scenario=echo" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "# Hello\n\nYour **markdown** here"}]
  }'
# → Streams "# Hello\n\nYour **markdown** here" word by word
```

#### Hybrid Example: Static + Dynamic

Custom scenario file `interview.md`:

```markdown
Welcome! I'll answer your question.

<!-- @delay: 200 -->

<!-- @input -->

<!-- @delay: 150 -->

That's my answer. Feel free to ask more.
```

At request time, `@input` expands to the user message content, producing a complete stream of `"Welcome!...<user message>...That's my answer."`.
