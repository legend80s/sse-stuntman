const GREEN = "\x1b[32m"
const CYAN = "\x1b[36m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"
const DIM = "\x1b[2m"
const BLUE = "\x1b[34m"
const UNDERLINED = "\x1b[4m"
const RESET = "\x1b[0m"

export const color = {
  /** @param {string | number} text */
  green(text) {
    return `${GREEN}${text}${RESET}`
  },
  /** @param {string | number} text */
  cyan(text) {
    return `${CYAN}${text}${RESET}`
  },
  /** @param {string | number} text */
  yellow(text) {
    return `${YELLOW}${text}${RESET}`
  },
  /** @param {string | number} text */
  red(text) {
    return `${RED}${text}${RESET}`
  },
  /** @param {string | number} text */
  dim(text) {
    return `${DIM}${text}${RESET}`
  },
  /** @param {string | number} text */
  blue(text) {
    return `${BLUE}${text}${RESET}`
  },
  /** @param {string | number} text */
  underline(text) {
    return `${UNDERLINED}${text}${RESET}`
  },
}
