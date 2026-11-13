import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model, SimpleStreamOptions } from '@earendil-works/pi-ai'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { decodeOpenAICodexSettings, DEFAULT_OPENAI_CODEX_SETTINGS } from '../src/settings-contract.ts'
import { Config } from '../src/index.ts'

const observed = vi.hoisted(() => [] as { options: SimpleStreamOptions | undefined; model: Model<'openai-codex-responses'> }[])
vi.mock('@earendil-works/pi-ai/providers/openai-codex', async original => {
  const actual = await original<typeof import('@earendil-works/pi-ai/providers/openai-codex')>()
  return {
    ...actual,
    openaiCodexProvider() {
      return { ...actual.openaiCodexProvider(), streamSimple(model: Model<'openai-codex-responses'>, _context: object, options?: SimpleStreamOptions) {
        observed.push({ options, model })
        throw new Error('offline transport capture')
      } }
    },
  }
})
afterEach(() => { observed.length = 0 })

describe('Codex transport configuration snapshots', () => {
  it('validates auto, retains omitted SSE, and decodes old settings without a transport field', () => {
    expect(Config({}).transport.get()).toBe('sse')
    expect(Config({ transport: 'auto' }).transport.get()).toBe('auto')
    expect(() => Reflect.apply(Config, undefined, [{ transport: 'websocket-cached' }])).toThrow()
    const { transport: _transport, ...old } = DEFAULT_OPENAI_CODEX_SETTINGS
    expect(decodeOpenAICodexSettings(old)?.transport).toBe('sse')
    expect(decodeOpenAICodexSettings({ ...old, transport: 'auto' })?.transport).toBe('auto')
    expect(decodeOpenAICodexSettings({ ...old, transport: 'websocket' })).toBeUndefined()
  })

  it('keeps prepared calls on their captured transport and removes only auto socket-cache identity', async () => {
    class FixtureCredentials extends OpenAICodexCredentialStore {
      override async read() {
        return { type: 'oauth' as const, accountId: 'offline-account', access: 'offline-access', refresh: 'offline-refresh', expires: Date.now() + 3_600_000 }
      }
      override async captureActiveAccount() { return this }
    }
    const credentials = new FixtureCredentials()
    let transport: 'sse' | 'auto' = 'sse'
    const adapter = createOpenAICodexAdapter(credentials, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { resolveTransport: () => transport })
    try {
      const model = (await adapter.listModels('openai-codex'))[0]!.id
      const sse = await adapter.prepareCall('openai-codex', model)
      transport = 'auto'
      const auto = await adapter.prepareCall('openai-codex', model)
      for (const prepared of [sse, auto]) {
        for await (const _chunk of prepared.stream({ provider: 'openai-codex', model, messages: [], sessionId: SessionId('business-session') })) {}
      }
      expect(observed.map(call => call.options?.transport)).toEqual(['sse', 'auto'])
      expect(observed.map(call => call.options?.sessionId)).toEqual(['business-session', undefined])
      for (const call of observed) {
        const payload: Record<string, unknown> = {}
        const updated = await call.options?.onPayload?.(payload, call.model)
        expect(updated).toMatchObject({ prompt_cache_key: 'business-session' })
      }
    } finally { await adapter.dispose() }
  })
})
