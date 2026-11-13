import { afterEach, describe, expect, it } from 'vitest'
import { defaultProviderAuthContext, InMemoryCredentialStore } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { createOpenAICodexProfile } from '../src/adapter.ts'
import { OpenAICodexRequestLifecycle } from '../src/request-lifecycle.ts'
import { Config } from '../src/index.ts'
import { parseOpenAICodexModelTransport, resolveOpenAICodexSettings } from '../src/settings-contract.ts'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { OpenAICodexProxyManager } from '../src/provider-proxy.ts'
import { createCodexWsFixture } from './support/codex-ws-fixture.ts'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })

function fixtureAdapter(url: string, proxy?: OpenAICodexProxyManager, proxyUrl?: () => string | undefined) {
  const original = openaiCodexProvider()
  const model = { ...original.getModels()[0]!, baseUrl: url }
  const provider = { ...original, getModels: () => [model] }
  const requests = new OpenAICodexRequestLifecycle(proxyUrl)
  const profile = createOpenAICodexProfile(provider, undefined, proxy, proxyUrl, undefined, undefined, undefined, undefined, undefined,
    { transport: 'auto', requests })
  const token = `offline.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'offline-account' } })).toString('base64url')}.signature`
  const profiles = new Map([['openai-codex', profile]])
  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: async () => token,
    auth: { credentials: new InMemoryCredentialStore(), authContext: defaultProviderAuthContext() },
  })
  const options: GenerateOptions = {
    provider: 'openai-codex', model: model.id, messages: [], sessionId: SessionId('ws-fixture-business'),
  }
  return {
    requests,
    options,
    stream(request: GenerateOptions = options) { return requests.stream(input => adapter.stream(input), request) },
  }
}

async function proxyFor(target: string) {
  const server = createServer()
  const sockets = new Set<Duplex>()
  const tunnels: string[] = []
  server.on('connect', (request, client, head) => {
    tunnels.push(request.url ?? '')
    const upstream = connect(Number(new URL(target).port), '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) upstream.write(head)
      client.pipe(upstream)
      upstream.pipe(client)
    })
    for (const socket of [client, upstream]) {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
      socket.on('error', () => { client.destroy(); upstream.destroy() })
    }
  })
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  cleanup.push(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>(resolve => { server.close(() => resolve()) })
  })
  return { url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, tunnels }
}

async function chunksOf(stream: AsyncIterable<StreamChunk>) {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('Codex request-owned native auto transport', () => {
  it('keeps SSE as the omitted setting and rejects unsupported cached transports', () => {
    expect(resolveOpenAICodexSettings({}).transport).toBe('sse')
    expect(Config({}).transport.get()).toBe('sse')
    expect(Config({ transport: 'auto' }).transport.get()).toBe('auto')
    expect(() => Reflect.apply(Config, undefined, [{ transport: 'websocket-cached' }])).toThrow()
    expect(() => parseOpenAICodexModelTransport('websocket-cached')).toThrow()
  })

  it('uses WebSocket for each request, closes it, and preserves the business prompt-cache key', async () => {
    const server = await createCodexWsFixture()
    cleanup.push(() => server.dispose())
    const adapter = fixtureAdapter(server.url)
    cleanup.push(() => adapter.requests.dispose())
    for (let request = 0; request < 2; request++) {
      expect((await chunksOf(adapter.stream())).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
      await server.waitClosed()
    }
    expect(server.upgrades).toBe(2)
    expect(server.httpRequests).toBe(0)
    expect(server.payloads.map(payload => payload['prompt_cache_key'])).toEqual(['ws-fixture-business', 'ws-fixture-business'])
    expect(server.payloads.every(payload => payload['previous_response_id'] === undefined)).toBe(true)
  })

  it('falls back to SSE after a rejected handshake without disabling WS for the next business request', async () => {
    const server = await createCodexWsFixture('reject')
    cleanup.push(() => server.dispose())
    const adapter = fixtureAdapter(server.url)
    cleanup.push(() => adapter.requests.dispose())
    for (let request = 0; request < 2; request++) {
      expect((await chunksOf(adapter.stream())).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    }
    expect(server.upgrades).toBe(2)
    expect(server.httpRequests).toBe(2)
    expect(server.payloads.every(payload => payload['prompt_cache_key'] === 'ws-fixture-business')).toBe(true)
  })

  it('does not start SSE when a WS API error rejects the request', async () => {
    const server = await createCodexWsFixture('api-error')
    cleanup.push(() => server.dispose())
    const adapter = fixtureAdapter(server.url)
    cleanup.push(() => adapter.requests.dispose())
    expect((await chunksOf(adapter.stream())).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
    await server.waitClosed()
    expect(server.httpRequests).toBe(0)
  })

  it('does not concatenate a new SSE response after a partial WS response', async () => {
    const server = await createCodexWsFixture('partial')
    cleanup.push(() => server.dispose())
    const adapter = fixtureAdapter(server.url)
    cleanup.push(() => adapter.requests.dispose())
    const chunks: StreamChunk[] = []
    for await (const chunk of adapter.stream()) {
      chunks.push(chunk)
      if (chunk.type === 'text-delta') server.drop()
    }
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'text-delta', text: 'offline answer' }))
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
    expect(server.httpRequests).toBe(0)
  })

  it.each(['success', 'reject'] as const)('routes native WS and %s outcome through the same explicit proxy', async mode => {
    const server = await createCodexWsFixture(mode)
    cleanup.push(() => server.dispose())
    const proxy = await proxyFor(server.url)
    const manager = new OpenAICodexProxyManager()
    cleanup.push(() => manager.dispose())
    // This hostname cannot reach the fixture directly; only the CONNECT proxy maps it to loopback.
    const endpoint = server.url.replace('127.0.0.1', 'codex-fixture.invalid')
    const adapter = fixtureAdapter(endpoint, manager, () => proxy.url)
    cleanup.push(() => adapter.requests.dispose())
    expect((await chunksOf(adapter.stream())).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    await server.waitClosed()
    expect(server.upgrades).toBe(1)
    expect(server.httpRequests).toBe(mode === 'success' ? 0 : 1)
    expect(proxy.tunnels.length).toBeGreaterThanOrEqual(mode === 'success' ? 1 : 2)
    expect(proxy.tunnels.every(target => target.startsWith('codex-fixture.invalid:'))).toBe(true)
  })

  it('cancels an admitted WS request and rejects new admission after adapter disposal', async () => {
    const server = await createCodexWsFixture('stall')
    cleanup.push(() => server.dispose())
    const adapter = fixtureAdapter(server.url)
    const chunks = chunksOf(adapter.stream())
    await server.requested
    await adapter.requests.dispose()
    await chunks
    await server.waitClosed()
    expect(server.httpRequests).toBe(0)
    await expect(chunksOf(adapter.stream())).rejects.toMatchObject({ code: 'ABORTED' })
  })
})
