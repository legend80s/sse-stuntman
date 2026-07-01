/**
 * @import { Scenario, CliOptions, UserMessage, LogStartParams, LogEndParams } from '../types.ts'
 */

import { color } from "./color.mjs"

/**
 * 请求日志：trace ID + 基本信息
 * @param {LogStartParams} param0
 * @returns
 */
export const logStart = ({
  method,
  pathname,
  scenario,
  parsedMessages,
  requestModel,
}) => {
  const traceId = generateShortId()
  const startTime = Date.now()
  const lastUserMsg = [...parsedMessages]
    .reverse()
    .find((m) => m.role === "user")
  const userContent = extractUserPrompt(lastUserMsg)
  const userPreview = userContent
    ? userContent.slice(0, 40).replace(/\n/g, " ") +
      (userContent.length > 40 ? "…" : "")
    : ""
  console.log(
    `  ${color.cyan("→")} [${timeNow()}] ${traceId} ${method} ${pathname} scenario=${scenario} model=${requestModel}${userPreview ? ` "${userPreview}"` : ""}`,
  )

  return { traceId, startTime }
}

/**
 *
 * @param {LogEndParams} param0
 */
export const logEnd = ({ resDestroyed, statusCode, traceId, startTime }) => {
  const elapsed = Date.now() - startTime
  const statusColor = statusCode >= 400 ? color.red : color.green
  const resDestroyedTips = resDestroyed ? color.yellow(" DESTROYED") : ""
  console.log(
    `  ${statusColor("←")} [${timeNow()}] ${traceId} ${statusCode}${resDestroyedTips} ${elapsed}ms`,
  )
}

function timeNow() {
  return new Date().toLocaleString()
}

/**
 *
 * @param {UserMessage | undefined} userMessage
 * @returns {string | null}
 */
export function extractUserPrompt(userMessage) {
  if (!userMessage) {
    return null
  }

  if (typeof userMessage.content === "string") {
    return userMessage.content
  }

  /** @type {string[]} */
  const texts = userMessage.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)

  return texts.join("")
}

function generateShortId() {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 6)
  return `${timestamp}${random}`
}
