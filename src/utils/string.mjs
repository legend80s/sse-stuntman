/**
 * @returns {string}
 */
export function generateId() {
  return crypto.randomUUID()
}

/**
 * 判断场景名是否为文件路径（而非场景目录内的名称）。
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isFilePath(name) {
  return name.endsWith(".md") || name.includes("/") || name.includes("\\")
}
