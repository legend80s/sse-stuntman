// @ts-expect-error
export default async function* customReporter(source) {
  for await (const event of source) {
    // console.log("event.type:", event.type)
    switch (event.type) {
      case "test:watch:drained":
        yield "test watch queue drained\n"
        break
      case "test:watch:restarted":
        yield "test watch restarted due to file change\n"
        break

      case "test:fail":
        yield `"${event.data.name}" 🔴\n`
        break

      case "test:diagnostic":
      case "test:stderr":
      case "test:stdout":
        // console.log("event.data:", event)
        yield `${event.data.message}\n`
        // yield `${JSON.stringify(event.data)}\n`
        break
      case "test:coverage": {
        // console.log("event.data.summary.totals:", event.data.summary.totals)
        // const { totalLineCount } = event.data.summary.totals
        yield `\n${JSON.stringify(event.data.summary.totals, null, 2)}\n`
        break
      }
    }
  }
}
