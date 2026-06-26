export const anthropicMsger = {
  /**
   *
   * @param {{ model: string; messageId: string }} param0
   * @returns
   */
  message_start({ model, messageId }) {
    return this.genMsg("message_start", {
      message: {
        id: messageId,
        type: "message",
        role: "assistant",
        model: model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
      },
    })
  },

  content_block_start() {
    return this.genMsg("content_block_start", {
      index: 0,
      content_block: { type: "text", text: "" },
    })
  },

  /**
   *
   * @param {string} content
   * @returns
   */
  content_block_delta(content) {
    return this.genMsg("content_block_delta", {
      index: 0,
      delta: { type: "text_delta", text: content },
    })
  },

  content_block_stop() {
    return this.genMsg("content_block_stop", {
      index: 0,
    })
  },

  /**
   * 
   * @param {{
      done_reason?: string
      prompt_eval_count: number
      eval_count: number
    }} data 
   * @returns 
   */
  message_delta(data) {
    return this.genMsg("message_delta", {
      delta: {
        stop_reason: data.done_reason || "end_turn",
        stop_sequence: null,
      },
      usage: {
        input_tokens: data.prompt_eval_count || 0,
        output_tokens: data.eval_count || 0,
      },
    })
  },

  message_stop() {
    return this.genMsg("message_stop")
  },

  /**
   *
   * @param {import('./provider-anthropic.type.ts').IPayload} payload
   * @returns
   */
  error(payload) {
    return this.genMsg("error", payload)
  },

  ping() {
    return this.genMsg("ping")
  },

  /**
   * @template {string} E
   * @param {E} event
   * @param {import('./provider-anthropic.type.ts').IPayload} [payload]
   * @returns {`event: ${E}\ndata: ${string}`}
   */
  genMsg(event, payload = {}) {
    const msg = `event: ${event}\ndata: ${JSON.stringify({
      type: event,

      ...payload,
    })}\n\n`

    // console.log("[genMsg] msg:", msg)

    // @ts-expect-error
    return msg
  },
}
