const GREEN = "\x1b[32m"
const CYAN = "\x1b[36m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"
const RESET = "\x1b[0m"

export const color = {
  /** @param {string} text */
  green(text) {
    return `${GREEN}${text}${RESET}`
  },
  /** @param {string} text */
  cyan(text) {
    return `${CYAN}${text}${RESET}`
  },
  /** @param {string} text */
  yellow(text) {
    return `${YELLOW}${text}${RESET}`
  },
  /** @param {string} text */
  red(text) {
    return `${RED}${text}${RESET}`
  },
}
