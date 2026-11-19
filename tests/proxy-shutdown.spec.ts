import { createServer } from 'node:http'
import { type AddressInfo, type Socket } from 'node:net'
import { expect, it, vi } from 'vitest'
import { Dispatcher, getGlobalDispatcher, setGlobalDispatcher } from 'undici'
import { OpenAICodexProxyManager } from '../src/provider-proxy.ts'

it('bounds disposal even if a scoped operation never settles', async () => {
  vi.useFakeTimers()
  const manager = new OpenAICodexProxyManager()
  let release!: () => void
  const operation = manager.run('http://127.0.0.1:9', () => new Promise<void>(resolve => { release = resolve }))
  let disposed = false
  const disposal = manager.dispose().then(() => { disposed = true })
  try {
    await vi.advanceTimersByTimeAsync(3_000)
    expect(disposed).toBe(true)
  } finally {
    release()
    await operation
    await disposal
    vi.useRealTimers()
  }
})

it.each(['connect', 'tls', 'headers', 'body'] as const)('destroys its stalled %s socket during disposal without a caller timeout', async phase => {
  const proxy = createServer()
  const sockets = new Set<Socket>()
  let connected!: () => void
  const connection = new Promise<void>(resolve => { connected = resolve })
  proxy.on('connection', socket => {
    sockets.add(socket)
    socket.on('error', () => { /* The client destroys this fixture connection on disposal. */ })
    socket.once('close', () => sockets.delete(socket))
  })
  proxy.on('connect', (_request, socket) => {
    socket.on('end', () => { socket.end() })
    socket.resume()
    if (phase === 'connect') { connected(); return }
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    socket.once('data', () => {
      if (phase === 'body') socket.write('HTTP/1.1 200 OK\r\nContent-Length: 1000\r\n\r\npartial')
      connected()
    })
  })
  await new Promise<void>(resolve => { proxy.listen(0, '127.0.0.1', resolve) })
  const manager = new OpenAICodexProxyManager()
  const operation = manager.run(`http://127.0.0.1:${String((proxy.address() as AddressInfo).port)}`,
    async () => {
      const response = await fetch(`${phase === 'headers' || phase === 'body' ? 'http' : 'https'}://example.invalid/`)
      return response.text()
    }).then(() => 'resolved', () => 'rejected')
  let disposal: Promise<void> | undefined
  try {
    await connection
    let disposed = false
    disposal = manager.dispose().then(() => { disposed = true })
    await vi.waitFor(() => expect(disposed).toBe(true), { timeout: 3_000 })
    expect(await operation).toBe('rejected')
    await vi.waitFor(() => expect(sockets.size).toBe(0))
  } finally {
    for (const socket of sockets) socket.destroy()
    await operation
    await (disposal ?? manager.dispose())
    await new Promise<void>(resolve => { proxy.close(() => resolve()) })
  }
}, 6_000)

it('rejects new leases while deactivating and permits a fresh pool afterwards', async () => {
  const manager = new OpenAICodexProxyManager()
  let release!: () => void
  const operation = manager.run('http://127.0.0.1:9', () => new Promise<void>(resolve => { release = resolve }))
  const closing = manager.deactivate()
  expect(() => manager.run('http://127.0.0.1:9', () => undefined)).toThrow('shutting down')
  release()
  await operation
  await closing
  expect(manager.run('http://127.0.0.1:9', () => 'new lease')).toBe('new lease')
  await manager.dispose()
})

it('does not let a late callback bypass its destroyed proxy through the host dispatcher', async () => {
  vi.useFakeTimers()
  const previous = getGlobalDispatcher()
  let directCalls = 0
  class HostDispatcher extends Dispatcher {
    dispatch(): boolean { directCalls++; throw new Error('Unexpected direct request') }
  }
  const host = new HostDispatcher()
  setGlobalDispatcher(host)
  const manager = new OpenAICodexProxyManager()
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  const operation = manager.run('http://127.0.0.1:9', async () => {
    await waiting
    return fetch('http://example.invalid/')
  }).then(() => 'resolved', () => 'rejected')
  try {
    const disposal = manager.dispose()
    await vi.advanceTimersByTimeAsync(3_000)
    await disposal
    release()
    expect(await operation).toBe('rejected')
    expect(directCalls).toBe(0)
    expect(getGlobalDispatcher()).toBe(host)
  } finally {
    release()
    await operation
    await manager.dispose()
    setGlobalDispatcher(previous)
    vi.useRealTimers()
  }
})
