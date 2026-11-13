/** Offline WS fixture using this package's declared ws development dependency. */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import { EventEmitter } from 'node:events'
import { zstdDecompressSync } from 'node:zlib'

interface Peer extends EventEmitter {
  send(data: string): void
  close(): void
  terminate(): void
}
interface WsServer extends EventEmitter {
  clients: Set<Peer>
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, accept: (peer: Peer) => void): void
  close(callback: () => void): void
}
export function codexResponseEvents(text = 'offline answer') {
  const item = { id: 'msg_offline', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }
  return [
    { type: 'response.created', response: { id: 'resp_offline', status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: text },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_offline', status: 'completed', output: [item], usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } } },
  ]
}

/** Allocate an ephemeral Responses endpoint and observe real WebSocket close handshakes. */
export async function createCodexWsFixture(mode: 'success' | 'reject' | 'stall' | 'partial' | 'api-error' = 'success') {
  // An explicit package override is available for isolated fixture diagnostics.
  const require = createRequire(process.env['CODEX_WS_TEST_PACKAGE'] ?? new URL('../../package.json', import.meta.url))
  const { WebSocketServer } = require('ws') as { WebSocketServer: new (options: { noServer: true }) => WsServer }
  const websocket = new WebSocketServer({ noServer: true })
  const tcp = new Set<Socket>()
  const payloads: Record<string, unknown>[] = []
  let httpRequests = 0
  let upgrades = 0
  let resolveRequest!: () => void
  const requested = new Promise<void>(resolve => { resolveRequest = resolve })
  const closed: Promise<void>[] = []
  const server = createServer(async (request, response) => {
    httpRequests++
    const parts: Buffer[] = []
    for await (const part of request) parts.push(Buffer.from(part))
    const bytes = Buffer.concat(parts)
    const body = request.headers['content-encoding'] === 'zstd' ? zstdDecompressSync(bytes) : bytes
    payloads.push(JSON.parse(body.toString()) as Record<string, unknown>)
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(codexResponseEvents().map(event => `data: ${JSON.stringify(event)}\n\n`).join(''))
  })
  server.on('connection', socket => {
    tcp.add(socket)
    socket.on('error', () => { /* Fixture shutdown may interrupt an admitted client. */ })
    socket.once('close', () => tcp.delete(socket))
  })
  server.on('upgrade', (request, socket, head) => {
    upgrades++
    if (mode === 'reject') {
      socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
      return
    }
    websocket.handleUpgrade(request, socket, head, peer => {
      closed.push(new Promise<void>(resolve => { peer.once('close', resolve) }))
      peer.on('error', () => { /* Client cancellation is an observed fixture outcome. */ })
      peer.on('message', (bytes: Buffer) => {
        payloads.push(JSON.parse(bytes.toString()) as Record<string, unknown>)
        resolveRequest()
        if (mode === 'stall') return
        if (mode === 'api-error') {
          peer.send(JSON.stringify({ type: 'error', code: 'invalid_request_error', message: 'offline rejected request' }))
          return
        }
        const events = codexResponseEvents()
        for (const event of mode === 'partial' ? events.slice(0, 3) : events) peer.send(JSON.stringify(event))
      })
    })
  })
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  return {
    url, payloads, requested,
    get httpRequests() { return httpRequests },
    get upgrades() { return upgrades },
    drop() { for (const peer of websocket.clients) peer.terminate() },
    async waitClosed() { await Promise.all(closed) },
    async dispose() {
      for (const peer of websocket.clients) peer.terminate()
      for (const socket of tcp) socket.destroy()
      await new Promise<void>(resolve => { websocket.close(resolve) })
      await new Promise<void>(resolve => { server.close(() => resolve()) })
    },
  }
}
