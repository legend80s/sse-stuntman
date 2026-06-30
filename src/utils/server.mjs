import { color } from "./color.mjs"
import { isFilePath } from "./string.mjs"

/**
 * @import { Scenario, CliOptions } from "../types.ts"
 */

const green = color.green
const yellow = color.yellow

/**
 *
 * @param {CliOptions} options
 * @param {Map<string, Scenario>} scenarioCache
 * @param {string[]} endpointPaths
 */
export function showLaunchScreen(options, scenarioCache, endpointPaths) {
  const port = options.port
  const baseDelay = options.defaultDelay ?? 5
  let effectiveDelay = ""
  if (options.delayMultiplier !== 1) {
    effectiveDelay = `Effective: ${options.delayMultiplier * baseDelay}ms`
  }

  const provider = options.provider
  const endpoint = `http://localhost:${port}`

  const title = `
  ╔════════════════════════════════════════════════════════════════════════════════╗
  ║   ███████╗████████╗██╗   ██╗███╗   ██╗████████╗███╗   ███╗ █████╗ ███╗   ██╗   ║
  ║   ██╔════╝╚══██╔══╝██║   ██║████╗  ██║╚══██╔══╝████╗ ████║██╔══██╗████╗  ██║   ║
  ║   ███████╗   ██║   ██║   ██║██╔██╗ ██║   ██║   ██╔████╔██║███████║██╔██╗ ██║   ║
  ║   ╚════██║   ██║   ██║   ██║██║╚██╗██║   ██║   ██║╚██╔╝██║██╔══██║██║╚██╗██║   ║
  ║   ███████║   ██║   ╚██████╔╝██║ ╚████║   ██║   ██║ ╚═╝ ██║██║  ██║██║ ╚████║   ║
  ║   ╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝   ║
  ║                                                                                ║
  ║                   🏍️  SSE Stuntman  |  Your AI's Stunt Double                   ║
  ╚════════════════════════════════════════════════════════════════════════════════╝

  ${green("✓")} ${provider} provider ready
  ${green("✓")} SSE endpoint: ${colorize(endpoint)} (SSE Live Demo. Click to try)}
  ${green("✓")} Mock scenarios: ${green(scenarioCache.size)} loaded`

  const scenario = options.scenario
  const cached = scenarioCache.get(scenario)

  const info = {
    // Server: [endpoint, "SSE Live Demo. Click to try"],
    // Provider: [provider],
    "API(s)": [`POST ${endpointPaths.join(", POST ")}`],

    Scenario: isFilePath(scenario)
      ? [scenario]
      : [scenario, cached?.description],

    Chunk: [options.chunkStrategy],

    Delay: [`${baseDelay}ms`, `used when scenario has no @delay`],
    "Delay Multiplier": [
      `${options.delayMultiplier}x`,
      `each @delay in scenario is multiplied by this`,
    ],
    "": [effectiveDelay],
  }

  const maxKeyLength =
    Math.max(...Object.keys(info).map((key) => key.length)) + 2

  const indent = " ".repeat(2)

  console.log(`${title}\n`)
  for (const [key, meta] of Object.entries(info)) {
    const [value, descRaw] = meta
    const desc = descRaw ? `  (${descRaw})` : ""
    const key1 = key ? `${key}:` : ""
    value &&
      console.log(
        `${indent}${(`${key1}`).padEnd(maxKeyLength)} ${colorize(value)}${desc}`,
      )
  }

  console.log(green(`\n  ═══>  Waiting for requests...  ═══>`))

  console.log(`\n${indent}Press ${green("Ctrl+C")} to stop.\n`)
}

/**
 * @param {string} text
 * @param {Partial<{defaultColor: keyof typeof color; linkColor: keyof typeof color}>} colorType
 * @return {string}
 */
function colorize(text, { defaultColor = "yellow", linkColor = "green" } = {}) {
  if (text.startsWith("http://") || text.startsWith("https://")) {
    return color.underline(color[linkColor](text))
  }

  return color[defaultColor](text)
}
