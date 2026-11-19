import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { expect, it, vi } from 'vitest'
import { OpenAICodexSearchProvider } from '../src/search.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'

it.each(['auth', 'headers', 'body', 'size'])('bounds search %s without a caller deadline', async phase => {
  const root = await mkdtemp(join(tmpdir(), 'codex-search-bounds-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const token = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64')}.fixture`
  let started!: () => void
  const dispatched = new Promise<void>(resolve => { started = resolve })
  let cancelled = false
  try {
    await store.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', access: token, refresh: 'fixture', accountId: 'fixture', expires: Date.now() + 3_600_000 }))
    vi.useFakeTimers()
    if (phase === 'auth') vi.spyOn(store, 'captureActiveAccount').mockImplementationOnce(async () => {
      started()
      return new Promise(() => {})
    })
    vi.stubGlobal('fetch', async () => {
      started()
      if (phase === 'headers') return new Promise<Response>(() => {})
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) { if (phase === 'size') controller.enqueue(new Uint8Array(1_048_577)) },
        cancel() { cancelled = true },
      }), { headers: { 'content-type': 'application/json' } })
    })
    const provider = new OpenAICodexSearchProvider({ credentials: store, model: 'gpt-5.6-sol', mode: 'cached', contextSize: 'medium', maxOutputTokens: 100, resolveRequestId: () => 'fixture' })
    let result = 'pending'
    const pending = provider.search({ query: 'fixture' }).then(() => { result = 'success' }, () => { result = 'rejected' })
    await dispatched
    await vi.advanceTimersByTimeAsync(phase === 'size' ? 0 : 30_001)
    expect(result).toBe('rejected')
    await pending
    if (phase === 'body' || phase === 'size') expect(cancelled).toBe(true)
  } finally {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await rm(root, { recursive: true, force: true })
  }
})

it('closes a real partial-response socket when the caller cancels', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-search-socket-'))
  const nativeFetch = globalThis.fetch
  let arrived!: () => void
  let closed!: () => void
  const requestArrived = new Promise<void>(resolve => { arrived = resolve })
  const socketClosed = new Promise<void>(resolve => { closed = resolve })
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.write('{"output":"')
    arrived()
  })
  server.once('connection', socket => { socket.once('close', closed) })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing test address')
    const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
    const token = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64')}.fixture`
    await store.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', access: token, refresh: 'fixture', accountId: 'fixture', expires: Date.now() + 3_600_000 }))
    vi.stubGlobal('fetch', (_url: unknown, init: RequestInit) => nativeFetch(`http://127.0.0.1:${address.port}`, init))
    const provider = new OpenAICodexSearchProvider({ credentials: store, model: 'gpt-5.6-sol', mode: 'cached', contextSize: 'medium', maxOutputTokens: 100, resolveRequestId: () => 'fixture' })
    const controller = new AbortController()
    const result = provider.search({ query: 'fixture' }, controller.signal).catch((error: unknown) => error)
    await requestArrived
    controller.abort()
    expect(await result).toMatchObject({ code: 'WEB_ABORTED' })
    await Promise.race([socketClosed, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { reject(new Error('response socket remained open')) }, 1_000)
    })])
  } finally {
    clearTimeout(timer)
    vi.unstubAllGlobals()
    server.closeAllConnections()
    await new Promise<void>(resolve => { server.close(() => { resolve() }) })
    await rm(root, { recursive: true, force: true })
  }
})
