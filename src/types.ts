export type int = number

/**
 * 单个输出片段。
 *
 * 由 scenario-parser 将 .md 解析后的最小数据单元。
 * 每个 Chunk 对应 SSE 流中的一条 `data: {...}` 事件
 * （角色声明 chunk 除外，它是自动插入的）。
 */
export interface Chunk {
  /** 输出的文本内容 */
  content: string
  /** 输出后等待的毫秒数，默认由场景片段间的 delay 指令决定 */
  delay?: number
  /** 切分策略，默认为 "word"，仅在需要覆盖时设置 */
  strategy?: ChunkStrategy
  /**
   * 内部标志：若为 true，表示该 chunk 是流终止标记
   * （对应 `@done` 指令），SSE 将在此后发送 `[DONE]`
   */
  done?: boolean
  /**
   * 内部标志：若设置，表示触发错误场景。
   * 该 chunk 前面的内容会被丢弃，服务器直接返回错误
   */
  error?: ErrorTrigger
  /**
   * 若为 true，该 chunk 是 @input 占位符。
   * 在请求处理时会被替换为用户最后一条消息的内容。
   */
  input?: boolean
}

/** 文本切分策略 */
export type ChunkStrategy =
  | "word" // 按单词切分，打字机效果更明显
  | "sentence" // 按句子切分
  | "char" // 按字符切分，最细腻的逐字效果
  | "line" // 按行切分，每行一个 chunk
  | "paragraph" // 整个段落一个 chunk

/** 错误触发配置 */
export interface ErrorTrigger {
  /** 错误类型，决定 HTTP status code 和响应体 */
  type: ErrorType
}

/** AI Provider */
export type Provider = "openai" | "anthropic"

/** 支持的错误类型 */
export type ErrorType =
  | "rate-limit" // 429 Too Many Requests
  | "content-filter" // 400 + content_filter finish_reason
  | "server-error" // 500 Internal Server Error
  | "timeout" // 模拟连接超时/中断
  | "empty" // 空响应，仅 [DONE]
  | "malformed" // 输出非法 JSON

/** 场景定义 */
export interface Scenario {
  name: string
  description?: string
  /** 默认模型名，用于 SSE 事件的 model 字段 */
  model?: string
  /** 场景的 chunk 列表 */
  chunks: Chunk[]
  /** 若为错误场景，此处存放错误信息 */
  error?: ErrorTrigger

  isBuiltin: boolean
}

/** CLI 选项 */
export interface CliOptions {
  port: number
  scenario: string
  /** 全局延迟倍率，1 = 正常速度 */
  delayMultiplier: number
  /** 场景内未显式指定 @delay 时的默认延迟（ms），默认 5 */
  defaultDelay: number
  model: string
  /** AI Provider：openai 或 anthropic（默认 "openai"） */
  provider: Provider
  /** 文本切分策略，默认 "word" */
  chunkStrategy: ChunkStrategy
  /** 自定义 POST 端点路径列表（默认 ['/v1/chat/completions']） */
  endpointPaths?: string[]
  list: boolean
  help: boolean
  /** 自定义场景目录 */
  scenariosDir?: string | undefined
  /** create-scenario 子命令的场景名 */
  createScenario?: string
  /** 创建场景后是否打开文件管理器（默认 true） */
  openScenariosDir?: boolean
}

/**
 * OpenAI Chat Completions SSE 事件的 choices 条目。
 * 严格遵循 OpenAI API 格式。
 */
export interface SSEChoice {
  index: number
  delta: {
    role?: "assistant" | "user" | "system"
    content?: string
  }
  finish_reason?: "stop" | "length" | "content_filter" | null
}

/**
 * OpenAI Chat Completions SSE 事件完整结构。
 */
export interface SSEEvent {
  id: string
  object: "chat.completion.chunk"
  created: number
  model: string
  choices: SSEChoice[]
}

export type UserMessage = {
  role: string
  content: string | { type: string; text: string }[]
}

export type LogStartParams = {
  method: string
  pathname: string
  scenario: string
  parsedMessages: UserMessage[]
  requestModel: string
}

export type LogEndParams = {
  statusCode: number
  traceId: string
  startTime: number
}
