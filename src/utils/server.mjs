import { color } from "./color.mjs"
import { isFilePath } from "./string.mjs"

/**
 * @import { Scenario, CliOptions } from "../types.ts"
 */

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

  const title = "🏍️  SSE Stuntman — server ready"
  const scenario = options.scenario
  const cached = scenarioCache.get(scenario)

  const info = {
    Server: [`http://localhost:${port}`, "SSE Live Demo. Click to try"],
    Provider: [options.provider],
    "Endpoint(s)": [`POST ${endpointPaths.join(", POST ")}`],

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

  console.log(`\n  ${title}\n`)
  for (const [key, meta] of Object.entries(info)) {
    const [value, descRaw] = meta
    const desc = descRaw ? `  (${descRaw})` : ""
    const key1 = key ? `${key}:` : ""
    value &&
      console.log(
        `${indent}${(`${key1}`).padEnd(maxKeyLength)} ${colorize(value)}${desc}`,
      )
  }
  console.log(`\n${indent}Press Ctrl+C to stop.\n`)
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
