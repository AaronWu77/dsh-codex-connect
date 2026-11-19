import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { afterEach, expect, it, vi } from 'vitest'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import { OpenAICodexAccountRouteRegistry } from '../src/account-routes.ts'
import { OpenAICodexCredentialStore, openAICodexAccountKey, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { ConversationSpeedRegistry } from '../src/speed-mode-registry.ts'
import type { OpenAICodexReasoningEffort } from '../src/reasoning-defaults.ts'
import type { OpenAICodexLiveModel } from '../src/model-catalog.ts'

let root: string | undefined
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); if (root !== undefined) await rm(root, { recursive: true, force: true }); root = undefined })
const live: OpenAICodexLiveModel[] = [{ slug: 'gpt-6.1-sol', contextWindow: 272000, maxContextWindow: 872000,
  reasoningLevels: [], serviceTiers: [], inputModalities: ['text', 'image'] }]
async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> { const chunks: StreamChunk[] = []; for await (const chunk of stream) chunks.push(chunk); return chunks }
async function fixture(count = 1, initial?: OpenAICodexReasoningEffort) {
  root = await mkdtemp(join(tmpdir(), 'codex-speed-adapter-'))
  const credentials = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  for (let index = 1; index <= count; index++) {
    const id = 'speed-fixture-' + index
    const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: id } })).toString('base64url')
    await credentials.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: id, access: 'e30.' + payload + '.fixture', refresh: 'synthetic', expires: Date.now() + 3600000 }))
  }
  const accounts = await credentials.accounts()
  const routes = new OpenAICodexAccountRouteRegistry().reconcile(accounts)
  const registry = new ConversationSpeedRegistry()
  let effort = initial
  let status = 200
  const wires: { payload: Record<string, unknown>; headers: Headers }[] = []
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const raw = headers.get('content-encoding') === 'zstd' ? zstdDecompressSync(init?.body as Uint8Array).toString('utf8') : String(init?.body)
    const payload = JSON.parse(raw) as Record<string, unknown>
    wires.push({ payload, headers })
    if (status !== 200) return Response.json({ error: { message: 'Ultrafast request is not included for this account' } }, { status })
    const item = { type: 'message', id: 'msg_speed', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }
    return new Response([
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'OK' },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'resp_speed', status: 'completed', model: payload.model, output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ].map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } })
  })
  vi.stubGlobal('fetch', fetch)
  const adapter = createOpenAICodexAdapter(credentials, () => undefined, registry, undefined, undefined, undefined, undefined, undefined, () => routes,
    { catalogLayer: () => ({ live, mode: 'default' }), resolveReasoningEffort: () => effort })
  const accountFor = (provider: string): string | undefined => routes.find(route => route.routeId === provider)?.accountKey ?? accounts.find(account => account.active)?.accountKey
  const choose = (provider: string, sessionId = 'session', mode: 'standard' | 'fast' | 'ultrafast' = 'ultrafast') => {
    const scope = { workspace: registry.workspaceFor(sessionId), provider, model: 'gpt-6.1-sol', accountKey: accountFor(provider) }
    const state = registry.readSpeed(sessionId, scope)
    return registry.selectSpeed(sessionId, scope, state.generation, state.revision, mode)
  }
  const request = (provider = 'openai-codex', sessionId = 'session'): GenerateOptions => ({ provider, sessionId: SessionId(sessionId), model: 'gpt-6.1-sol', messages: [], maxTokens: 1024 })
  return { adapter, credentials, registry, routes, wires, fetch, choose, request,
    setEffort: (value?: OpenAICodexReasoningEffort) => { effort = value }, reject: () => { status = 400 } }
}
it('uses real PI 1.4 SSE on all sixteen bound account routes without sending another account token', async () => {
  const f = await fixture(16)
  expect(f.routes).toHaveLength(16)
  for (const route of f.routes) {
    const session = 'route-' + route.routeId
    f.choose(route.routeId, session)
    const chunks = await collect(f.adapter.stream(f.request(route.routeId, session)))
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  }
  expect(f.wires).toHaveLength(16)
  for (const [index, route] of f.routes.entries()) {
    const wire = f.wires[index]!
    expect(wire.payload).toMatchObject({ model: 'gpt-6.1-sol', service_tier: 'ultrafast', stream: true })
    const actual = wire.headers.get('chatgpt-account-id')!
    expect(route.accountKey === undefined ? actual === 'speed-fixture-16' : openAICodexAccountKey(actual) === route.accountKey).toBe(true)
  }
})
it('isolates simultaneous authenticated requests on the primary and secondary account routes', async () => {
  const f = await fixture(2)
  const first = f.routes[0]!, second = f.routes[1]!
  f.choose(first.routeId, 'first'); f.choose(second.routeId, 'second')
  let captured = 0, release!: () => void
  const both = new Promise<void>(done => { release = done })
  const pause = async () => { if (++captured === 2) release(); await both }
  const active = f.credentials.captureActiveAccount.bind(f.credentials)
  const exact = f.credentials.captureAccount.bind(f.credentials)
  vi.spyOn(f.credentials, 'captureActiveAccount').mockImplementation(async () => { const snapshot = await active(); await pause(); return snapshot })
  vi.spyOn(f.credentials, 'captureAccount').mockImplementation(async key => { const snapshot = await exact(key); await pause(); return snapshot })
  await Promise.all([collect(f.adapter.stream(f.request(first.routeId, 'first'))), collect(f.adapter.stream(f.request(second.routeId, 'second')))])
  expect(f.wires).toHaveLength(2)
  expect(new Set(f.wires.map(wire => wire.headers.get('chatgpt-account-id')))).toEqual(new Set(['speed-fixture-1', 'speed-fixture-2']))
  expect(f.wires.every(wire => wire.payload.service_tier === 'ultrafast')).toBe(true)
})
it('keeps optional effort fallback under explicit requests and freezes prepared profile snapshots', async () => {
  const f = await fixture(1, 'max')
  const old = await f.adapter.prepareCall('openai-codex', 'gpt-6.1-sol')
  f.setEffort('high')
  const current = await f.adapter.prepareCall('openai-codex', 'gpt-6.1-sol')
  expect(f.fetch).not.toHaveBeenCalled()
  await collect(old.stream(f.request()))
  await collect(current.stream(f.request()))
  await collect(current.stream({ ...f.request(), reasoningEffort: ReasoningEffortId('low') }))
  f.setEffort(undefined); await collect(f.adapter.stream(f.request()))
  expect(f.wires.map(wire => wire.payload.reasoning)).toEqual([{ effort: 'max', summary: 'auto' }, { effort: 'high', summary: 'auto' }, { effort: 'low', summary: 'auto' }, undefined])
  expect(old.model.reasoning?.defaultEffort).toBe('max')
  expect(current.model.reasoning?.defaultEffort).toBe('high')
  expect(f.wires.every(wire => wire.payload.service_tier === undefined)).toBe(true)
})
it.each(['off', 'minimal'] as const)('keeps Sol %s unavailable and rejects an unsupported fallback before auth or transport', async effort => {
  const f = await fixture(1, effort)
  const auth = vi.spyOn(f.credentials, 'captureActiveAccount')
  const model = await f.adapter.resolveModel('openai-codex', 'gpt-6.1-sol')
  expect(model.reasoning?.efforts.map(choice => choice.id)).not.toContain(effort)
  expect(model.reasoning?.defaultEffort).toBeUndefined()
  await expect(collect(f.adapter.stream(f.request()))).rejects.toMatchObject({ code: 'UNSUPPORTED_REASONING_EFFORT' })
  expect(auth).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled()
  await collect(f.adapter.stream({ ...f.request(), reasoningEffort: ReasoningEffortId('high') }))
  expect(f.fetch).toHaveBeenCalledOnce()
})
it('sends one rejected Ultrafast request with no downgrade, transport fallback or provider replay', async () => {
  const f = await fixture(); f.choose('openai-codex'); f.reject()
  const chunks = await collect(f.adapter.stream(f.request()))
  expect(f.fetch).toHaveBeenCalledOnce()
  expect(f.wires[0]?.payload.service_tier).toBe('ultrafast')
  expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
  expect(f.registry.captureSpeed('session').mode).toBe('ultrafast')
})
it('refuses an expired request after auth account changes rather than sending Standard or replaying it', async () => {
  const f = await fixture(); f.choose('openai-codex')
  const capture = f.credentials.captureActiveAccount.bind(f.credentials)
  vi.spyOn(f.credentials, 'captureActiveAccount').mockImplementation(async () => {
    const account = await capture(); f.registry.invalidateAccountSelections(); return account
  })
  const chunks = await collect(f.adapter.stream(f.request()))
  expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'PI_AI_ERROR', message: expect.stringContaining('ULTRAFAST_SELECTION_EXPIRED') } } })
  expect(f.fetch).not.toHaveBeenCalled()
})
