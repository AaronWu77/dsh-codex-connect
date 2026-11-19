import { afterEach, describe, expect, it } from 'vitest'
import { defaultProviderAuthContext, InMemoryCredentialStore } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session-title-llm'
import type {} from '@deepseek-ai/dsh-experimental-auto-review'
import { RecentRequestLog } from '../src/recent-requests.ts'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { createOpenAICodexProfile } from '../src/adapter.ts'
import { OpenAICodexRequestLifecycle } from '../src/request-lifecycle.ts'
import { Config } from '../src/index.ts'
import { parseOpenAICodexModelTransport, resolveOpenAICodexModelTransport, resolveOpenAICodexSettings } from '../src/settings-contract.ts'
import { OpenAICodexWebSocketResidency } from '../src/ws-residency.ts'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { OpenAICodexProxyManager } from '../src/provider-proxy.ts'
import { createCodexWsFixture } from './support/codex-ws-fixture.ts'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })

function fixtureAdapter(url: string, proxy?: OpenAICodexProxyManager, proxyUrl?: () => string | undefined, observed?: {
  model: string; transport: 'auto' | 'sse'; log: RecentRequestLog; provider?: 'openai-codex' | 'openai-codex-2'
}) {
  const original = openaiCodexProvider()
  const selected = observed === undefined ? original.getModels()[0] : original.getModels().find(model => model.id === observed.model)
  if (selected === undefined) throw new Error('The offline model must exist in the pinned Codex catalog')
  const model = { ...selected, baseUrl: url }
  const provider = { ...original, getModels: () => [model] }
  const requests = new OpenAICodexRequestLifecycle(proxyUrl, observed?.log)
  const routeId = observed?.provider ?? 'openai-codex'
  const profile = createOpenAICodexProfile(provider, undefined, proxy, proxyUrl, undefined, undefined, { routeId, displayName: 'Offline Codex' }, undefined, undefined,
    { transport: observed?.transport ?? 'auto', requests })
  const token = `offline.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'offline-account' } })).toString('base64url')}.signature`
  const profiles = new Map([[routeId, profile]])
  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: async () => token,
    auth: { credentials: new InMemoryCredentialStore(), authContext: defaultProviderAuthContext() },
  })
  const options: GenerateOptions = {
    provider: routeId, model: model.id, messages: [], sessionId: SessionId('ws-fixture-business'),
  }
  return {
    requests,
    options,
    stream(request: GenerateOptions = options) { return requests.stream(input => adapter.stream(input), request) },
    async *preparedStream(request: GenerateOptions = options) {
      const prepared = await adapter.prepareCall(request.provider, request.model)
      yield* requests.stream(input => prepared.stream(input), request)
    },
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
  it('derives continuation from the resident budget and keeps explicit transports', () => {
    expect(resolveOpenAICodexSettings({}).transport).toBeUndefined()
    expect(resolveOpenAICodexModelTransport(resolveOpenAICodexSettings({}))).toBe('websocket-cached')
    expect(resolveOpenAICodexModelTransport(resolveOpenAICodexSettings({ maxResidentWebSocketSessions: 0 }))).toBe('sse')
    expect(Config({ transport: 'auto' }).transport.get()).toBe('auto')
    expect(Config({ transport: 'websocket-cached' }).transport.get()).toBe('websocket-cached')
    expect(() => Reflect.apply(Config, undefined, [{ transport: 'websocket' }])).toThrow()
    expect(parseOpenAICodexModelTransport('websocket-cached')).toBe('websocket-cached')
    expect(() => parseOpenAICodexModelTransport('websocket')).toThrow()
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

describe.each(['websocket', 'sse', 'fallback'] as const)('Codex serialized reasoning through %s', mode => {
  async function observedFixture(model = 'gpt-6.1-sol', provider: 'openai-codex' | 'openai-codex-2' = 'openai-codex') {
    const server = await createCodexWsFixture(mode === 'fallback' ? 'reject' : 'success')
    cleanup.push(() => server.dispose())
    const log = new RecentRequestLog()
    const adapter = fixtureAdapter(server.url, undefined, undefined, {
      model, transport: mode === 'sse' ? 'sse' : 'auto', log, provider,
    })
    cleanup.push(() => adapter.requests.dispose())
    return { server, log, adapter }
  }

  it.each(['openai-codex', 'openai-codex-2'] as const)('sends explicit xhigh on %s from direct and prepared calls without configuring a fallback', async provider => {
    const { server, log, adapter } = await observedFixture('gpt-6.1-sol', provider)
    const request = { ...adapter.options, reasoningEffort: ReasoningEffortId('xhigh') }
    for (const stream of [adapter.stream(request), adapter.preparedStream(request)]) {
      expect((await chunksOf(stream)).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
      await server.waitClosed()
    }
    expect(server.payloads).toHaveLength(2)
    for (const payload of server.payloads) {
      expect(payload['model']).toBe('gpt-6.1-sol')
      expect(payload['reasoning']).toMatchObject({ effort: 'xhigh' })
      expect(payload['reasoning_effort']).toBeUndefined()
      expect(payload['type']).toBe(mode === 'websocket' ? 'response.create' : undefined)
    }
    expect(log.snapshot().map(entry => entry.reasoning)).toEqual(['xhigh', 'xhigh'])
    expect(log.snapshot().map(entry => entry.payloadReasoning)).toEqual(['xhigh', 'xhigh'])
    expect(server.httpRequests).toBe(mode === 'websocket' ? 0 : 2)
    expect(server.upgrades).toBe(mode === 'sse' ? 0 : 2)
  })

  it('leaves effort absent when neither the caller nor this model chooses one', async () => {
    const { server, log, adapter } = await observedFixture()
    expect((await chunksOf(adapter.stream())).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    await server.waitClosed()
    expect(server.payloads).toHaveLength(1)
    expect(server.payloads[0]?.['reasoning']).toBeUndefined()
    expect(log.snapshot()[0]?.reasoning).toBeUndefined()
    expect(log.snapshot()[0]?.payloadReasoning).toBeNull()
  })

  it('records the mapped wire effort rather than an untransmitted selection', async () => {
    const { server, log, adapter } = await observedFixture('gpt-5.6-sol')
    expect((await chunksOf(adapter.stream({ ...adapter.options, reasoningEffort: ReasoningEffortId('minimal') }))).at(-1))
      .toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    await server.waitClosed()
    expect(server.payloads[0]?.['reasoning']).toMatchObject({ effort: 'low' })
    expect(log.snapshot()[0]?.reasoning).toBe('minimal')
    expect(log.snapshot()[0]?.payloadReasoning).toBe('low')
  })
  it('rejects an unsupported selection before either transport sends a request', async () => {
    const { server, adapter } = await observedFixture()
    await expect(chunksOf(adapter.stream({ ...adapter.options, reasoningEffort: ReasoningEffortId('minimal') })))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_REASONING_EFFORT' })
    expect(server.upgrades).toBe(0)
    expect(server.httpRequests).toBe(0)
    expect(server.payloads).toEqual([])
  })
})

/** One adapter whose provider profile runs the resident continuation transport. */
function residencyAdapter(url: string, options: { limit?: number; now?: () => number; log?: RecentRequestLog } = {}) {
  const original = openaiCodexProvider()
  const selected = original.getModels()[0]
  if (selected === undefined) throw new Error('The offline model must exist in the pinned Codex catalog')
  const model = { ...selected, baseUrl: url }
  const provider = { ...original, getModels: () => [model] }
  const requests = new OpenAICodexRequestLifecycle(undefined, options.log)
  const residency = new OpenAICodexWebSocketResidency({ resolveLimit: () => options.limit ?? 2, now: options.now })
  const routeId = 'openai-codex'
  const profile = createOpenAICodexProfile(provider, undefined, undefined, undefined, undefined, undefined,
    { routeId, displayName: 'Offline Codex' }, undefined, undefined, { transport: 'websocket-cached', requests, residency })
  const token = `offline.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'offline-account' } })).toString('base64url')}.signature`
  const profiles = new Map([[routeId, profile]])
  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: async () => token,
    auth: { credentials: new InMemoryCredentialStore(), authContext: defaultProviderAuthContext() },
  })
  const request: GenerateOptions = { provider: routeId, model: model.id, messages: [], sessionId: SessionId('ws-fixture-business') }
  return {
    residency,
    request,
    requests,
    stream(input: GenerateOptions = request) { return requests.stream(next => adapter.stream(next), input) },
  }
}

// The fixture supplies purpose identifiers normally contributed by optional producer plugins.
function withAuxiliaryPurpose(request: GenerateOptions, purpose: 'session-title' | 'compaction' | 'auto-review'): GenerateOptions {
  return { ...request, purpose } as GenerateOptions
}

describe('Codex resident continuation transport', () => {
  it('keeps one resident connection across conversation turns and closes it on shutdown', async () => {
    const server = await createCodexWsFixture()
    cleanup.push(() => server.dispose())
    const fixture = residencyAdapter(server.url)
    cleanup.push(() => fixture.requests.dispose())
    for (let turn = 0; turn < 2; turn++) {
      expect((await chunksOf(fixture.stream())).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    }
    expect(server.upgrades).toBe(1)
    expect(server.httpRequests).toBe(0)
    expect(server.payloads.map(payload => payload['prompt_cache_key'])).toEqual(['ws-fixture-business', 'ws-fixture-business'])
    fixture.residency.closeAll()
    await server.waitClosed()
  })

  it('keeps title, compaction, and auto-review requests on SSE and records their transport', async () => {
    const server = await createCodexWsFixture()
    cleanup.push(() => server.dispose())
    const log = new RecentRequestLog()
    const fixture = residencyAdapter(server.url, { log })
    cleanup.push(() => fixture.requests.dispose())
    for (const purpose of ['session-title', 'compaction', 'auto-review'] as const) {
      expect((await chunksOf(fixture.stream(withAuxiliaryPurpose(fixture.request, purpose)))).at(-1))
        .toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
      expect(log.snapshot()[0]).toMatchObject({ transport: 'sse' })
      expect(log.snapshot()[0]?.continuation).toBeUndefined()
    }
    expect(log.snapshot().map(entry => ({ kind: entry.kind, transport: entry.transport, continuation: entry.continuation })))
      .toEqual([
        { kind: 'auto-review', transport: 'sse', continuation: undefined },
        { kind: 'compaction', transport: 'sse', continuation: undefined },
        { kind: 'title', transport: 'sse', continuation: undefined },
      ])
    expect(server.upgrades).toBe(0)
    expect(server.httpRequests).toBe(3)
    await server.waitClosed()
  })

  it('a completed non-conversation request must not free the busy conversation slot', async () => {
    const server = await createCodexWsFixture('stall')
    cleanup.push(() => server.dispose())
    const log = new RecentRequestLog()
    const fixture = residencyAdapter(server.url, { limit: 1, log })
    const controller = new AbortController()
    const running = chunksOf(fixture.stream({ ...fixture.request, signal: controller.signal }))
    // Attach a rejection handler immediately, including when an assertion fails before cleanup.
    const drained = running.then(() => undefined, () => undefined)
    cleanup.push(async () => {
      controller.abort()
      // A stalled cached WS may await input even after cancellation: force the peer closed
      // before awaiting either consumer settlement or lifecycle disposal.
      server.drop()
      await drained
      await fixture.requests.dispose()
      fixture.residency.closeAll()
    })
    try {
      await Promise.race([
        server.requested,
        running.then(() => { throw new Error('Conversation ended before the stalled WebSocket request was admitted') }),
      ])
      expect(fixture.residency.sessions()).toEqual(['ws-fixture-business'])
      expect((await chunksOf(fixture.stream(withAuxiliaryPurpose(fixture.request, 'session-title')))).at(-1))
        .toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
      expect(log.snapshot().find(entry => entry.kind === 'title')).toMatchObject({ transport: 'sse' })

      expect((await chunksOf(fixture.stream({ ...fixture.request, sessionId: SessionId('ws-fixture-other') }))).at(-1))
        .toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
      expect(server.upgrades).toBe(1)
      expect(server.httpRequests).toBe(2)
      expect(fixture.residency.sessions()).toEqual(['ws-fixture-business'])
    } finally {
      controller.abort()
      server.drop()
      await drained
    }
  })

  it('evicts the resident connection of another session when the budget is full', async () => {
    const server = await createCodexWsFixture()
    cleanup.push(() => server.dispose())
    const fixture = residencyAdapter(server.url, { limit: 1 })
    cleanup.push(() => fixture.requests.dispose())
    await chunksOf(fixture.stream({ ...fixture.request, sessionId: SessionId('session-a') }))
    expect(server.upgrades).toBe(1)
    await chunksOf(fixture.stream({ ...fixture.request, sessionId: SessionId('session-b') }))
    expect(server.upgrades).toBe(2)
    expect(fixture.residency.sessions()).toEqual(['session-b'])
    expect(server.payloads.map(payload => payload['prompt_cache_key'])).toEqual(['session-a', 'session-b'])
    fixture.residency.closeAll()
    await server.waitClosed()
  })
})
