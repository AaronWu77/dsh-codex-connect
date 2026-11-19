import http, { type Server } from 'node:http'
import { connect, type Socket, type AddressInfo } from 'node:net'
import { once } from 'node:events'
import { syncBuiltinESMExports } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { OpenAICodexWebAuth } from '../src/auth-routes.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'

it.each(['cancel', 'dispose', 'timeout'] as const)('%s closes an accepted incomplete OAuth request', async action => {
  const root = await mkdtemp(join(tmpdir(), 'codex-oauth-socket-'))
  const createServer = http.createServer.bind(http)
  let callback: Server | undefined
  const sockets = new Set<Socket>()
  const spy = vi.spyOn(http, 'createServer').mockImplementation((...args: Parameters<typeof http.createServer>) => {
    const server = createServer(...args)
    callback = server
    const listen = server.listen.bind(server)
    // Only the test remaps the provider's fixed callback port to an ephemeral loopback port.
    server.listen = ((_port: number, _host: string, ready: () => void) => listen(0, '127.0.0.1', ready)) as typeof server.listen
    server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
    return server
  })
  syncBuiltinESMExports()
  const auth = new OpenAICodexWebAuth(new OpenAICodexCredentialStore(join(root, 'credentials.json')), { authorizationTimeoutMs: 500 })
  let client: Socket | undefined
  vi.stubGlobal('fetch', () => { throw new Error('External network forbidden in OAuth socket regression') })
  try {
    await auth.signIn()
    const address = callback?.address() as AddressInfo
    client = connect(address.port, '127.0.0.1')
    client.on('error', () => { /* Closing the test-owned server can reset its client. */ })
    await once(client, 'connect')
    await vi.waitFor(() => expect(sockets.size).toBe(1))
    const accepted = [...sockets][0]!
    const received = once(accepted, 'data')
    client.write('GET /auth/callback HTTP/1.1\r\nHost: localhost\r\n')
    await received
    if (action === 'timeout') {
      await vi.waitFor(async () => expect(await auth.status()).toMatchObject({ status: 'error' }), { timeout: 1_000 })
    } else await auth[action]()
    await vi.waitFor(() => expect(client?.destroyed).toBe(true), { timeout: 500, interval: 10 })
  } finally {
    client?.destroy()
    for (const socket of sockets) socket.destroy()
    await auth.dispose()
    callback?.close()
    spy.mockRestore()
    syncBuiltinESMExports()
    vi.unstubAllGlobals()
    await rm(root, { recursive: true, force: true })
  }
})
