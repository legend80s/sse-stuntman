export type IEvent =
  | "message_start"
  | "content_block_start"
  | "content_block_delta"
  | "content_block_stop"
  | "message_delta"
  | "message_stop"
  | "error"
  | "ping"

export type IPayload = {
  [key: string]: unknown
} & {
  type?: never // 可选，但类型为 never，实际无法赋值
}
