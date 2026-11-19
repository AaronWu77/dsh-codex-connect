import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const packageEntry = pathToFileURL(resolve('lib/index.js')).href
const child = spawnSync(process.execPath, [
  '--input-type=module',
  '--eval',
  `const symbol = Symbol.for('undici.globalDispatcher.1')
const before = globalThis[symbol]
if (before !== undefined && typeof before.dispatch !== 'function') {
  throw new Error('Node initialized an unusable global fetch dispatcher')
}
const beforeName = before?.constructor?.name
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)
await import(process.argv[1])
const after = globalThis[symbol]
if (nodeMajor >= 24 && before === undefined) {
  throw new Error('Node did not initialize an environment-proxy dispatcher')
}
if (nodeMajor >= 24 && after !== before) {
  throw new Error(\`package import replaced Node global dispatcher: \${beforeName} -> \${after?.constructor?.name ?? 'undefined'}\`)
}
const { fetch } = await import('undici')
try {
  await fetch('http://127.0.0.1:65534', { signal: AbortSignal.timeout(2_000) })
} catch (error) {
  let cause = error
  while (typeof cause === 'object' && cause !== null) {
    if (cause.code === 'UND_ERR_INVALID_ARG') throw cause
    cause = cause.cause
  }
}
process.stdout.write(JSON.stringify({
  node: process.version,
  dispatcher: beforeName ?? 'none',
  preserved: before === undefined ? undefined : after === before,
}))`,
  packageEntry,
], {
  encoding: 'utf8',
  env: {
    ...process.env,
    NODE_USE_ENV_PROXY: '1',
    HTTP_PROXY: 'http://127.0.0.1:9',
    HTTPS_PROXY: 'http://127.0.0.1:9',
    NO_PROXY: '',
  },
})

if (child.status !== 0) {
  process.stderr.write(child.stderr)
  process.exit(child.status ?? 1)
}

process.stdout.write(`environment proxy import: ${child.stdout}\n`)

const custom = spawnSync(process.execPath, ['--input-type=module', '--eval', `
const symbol = Symbol.for('undici.globalDispatcher.1')
const custom = {
  dispatch(options, handler) {
    handler.onConnect(() => {})
    handler.onHeaders(200, ['content-type', 'text/plain'], () => {}, 'OK')
    handler.onData(Buffer.from('host-policy'))
    handler.onComplete([])
    return true
  }
}
Object.defineProperty(globalThis, symbol, { value: custom, writable: true })
const plugin = await import(process.argv[1])
if (globalThis[symbol] !== custom) throw new Error('import replaced custom v1 dispatcher')
const manager = new plugin.OpenAICodexProxyManager()
manager.run('http://127.0.0.1:9', () => undefined)
const legacyBody = await new Promise((resolve, reject) => {
  let body = ''
  globalThis[symbol].dispatch({}, {
    onConnect() {}, onHeaders() {}, onData(chunk) { body += chunk },
    onComplete() { resolve(body) }, onError: reject,
  })
})
if (legacyBody !== 'host-policy') {
  throw new Error('unrelated fetch lost host policy')
}
// Node 26 native fetch uses v2; older supported Nodes consume the v1 slot.
if (Number(process.versions.node.split('.')[0]) < 26
  && await (await fetch('http://fixture.invalid')).text() !== 'host-policy') {
  throw new Error('native fetch lost host v1 policy')
}
const replacement = { ...custom }
globalThis[symbol] = replacement
manager.run('http://127.0.0.1:9', () => undefined)
await manager.dispose()
if (globalThis[symbol] !== replacement) throw new Error('dispose replaced third-party v1 dispatcher')
process.stdout.write('custom v1 import, unrelated fetch and ownership passed')
`, packageEntry], { encoding: 'utf8', timeout: 10_000 })
if (custom.status !== 0) {
  process.stderr.write(custom.stderr)
  process.exit(custom.status ?? 1)
}
process.stdout.write(`${custom.stdout}\n`)
