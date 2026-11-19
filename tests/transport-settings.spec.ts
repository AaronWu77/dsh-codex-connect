import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model, SimpleStreamOptions } from '@earendil-works/pi-ai'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import type { OpenAICodexModelTransport } from '../src/settings-contract.ts'
import {
  decodeOpenAICodexSettings,
  DEFAULT_OPENAI_CODEX_SETTINGS,
  resolveOpenAICodexModelTransport,
  resolveOpenAICodexProxyUrl,
  resolveOpenAICodexSettings,
} from '../src/settings-contract.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
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
  it('derives continuation from the resident budget and decodes old settings without either field', () => {
    expect(Config({}).transport.get()).toBeUndefined()
    expect(Config({}).maxResidentWebSocketSessions.get()).toBe(2)
    expect(Config({ transport: 'auto' }).transport.get()).toBe('auto')
    expect(Config({ transport: 'websocket-cached' }).transport.get()).toBe('websocket-cached')
    expect(() => Reflect.apply(Config, undefined, [{ transport: 'websocket' }])).toThrow()
    expect(() => Reflect.apply(Config, undefined, [{ maxResidentWebSocketSessions: 9 }])).toThrow()

    expect(resolveOpenAICodexSettings({})).toMatchObject({ transport: undefined, maxResidentWebSocketSessions: 2 })
    expect(resolveOpenAICodexModelTransport(resolveOpenAICodexSettings({}))).toBe('websocket-cached')
    expect(resolveOpenAICodexModelTransport(resolveOpenAICodexSettings({ maxResidentWebSocketSessions: 0 }))).toBe('sse')
    expect(resolveOpenAICodexModelTransport({ transport: 'auto', maxResidentWebSocketSessions: 4 })).toBe('websocket-cached')
    expect(resolveOpenAICodexModelTransport(resolveOpenAICodexSettings({ transport: 'sse', maxResidentWebSocketSessions: 4 }))).toBe('sse')
    expect(() => resolveOpenAICodexSettings({ maxResidentWebSocketSessions: 1.5 })).toThrow()

    const { transport: _transport, maxResidentWebSocketSessions: _budget, ...old } = DEFAULT_OPENAI_CODEX_SETTINGS
    expect(decodeOpenAICodexSettings(old)).toMatchObject({ transport: undefined, maxResidentWebSocketSessions: 2 })
    expect(decodeOpenAICodexSettings({ ...old, transport: 'auto', maxResidentWebSocketSessions: 0 }))
      .toMatchObject({ transport: 'auto', maxResidentWebSocketSessions: 0 })
    expect(decodeOpenAICodexSettings({ ...old, transport: 'websocket-cached' })?.transport).toBe('websocket-cached')
    expect(decodeOpenAICodexSettings({ ...old, transport: 'websocket' })).toBeUndefined()
    expect(decodeOpenAICodexSettings({ ...old, maxResidentWebSocketSessions: 9 })).toBeUndefined()
  })

  it('rejects auto transport with a positive resident budget', () => {
    const resolve = () => resolveOpenAICodexSettings({ transport: 'auto', maxResidentWebSocketSessions: 3 })
    expect(resolve).toThrow(TypeError)
    expect(resolve).toThrow('OpenAI Codex transport "auto" is ignored while maxResidentWebSocketSessions is greater than 0; set maxResidentWebSocketSessions to 0 to keep request-owned WebSocket connections, or remove transport "auto" to keep resident continuation connections')
  })

  it('keeps auto transport with a zero resident budget', () => {
    const settings = resolveOpenAICodexSettings({ transport: 'auto', maxResidentWebSocketSessions: 0 })
    expect(settings).toMatchObject({ transport: 'auto', maxResidentWebSocketSessions: 0 })
    expect(resolveOpenAICodexModelTransport(settings)).toBe('auto')
  })

  it('resolves proxy settings twice for legal auto and cached transports', () => {
    expect(() => resolveOpenAICodexProxyUrl(resolveOpenAICodexSettings({ transport: 'auto', maxResidentWebSocketSessions: 0 })))
      .not.toThrow()
    expect(resolveOpenAICodexProxyUrl(resolveOpenAICodexSettings({ transport: 'auto', maxResidentWebSocketSessions: 0 })))
      .toBeUndefined()
    expect(() => resolveOpenAICodexProxyUrl(resolveOpenAICodexSettings({ maxResidentWebSocketSessions: 3 })))
      .not.toThrow()
    expect(resolveOpenAICodexProxyUrl(resolveOpenAICodexSettings({ maxResidentWebSocketSessions: 3 })))
      .toBeUndefined()
  })

  it('rejects auto transport with the default resident budget', () => {
    expect(() => resolveOpenAICodexSettings({ transport: 'auto' })).toThrow(TypeError)
  })

  it('derives cached WebSocket transport from a positive budget when transport is omitted', () => {
    const settings = resolveOpenAICodexSettings({ maxResidentWebSocketSessions: 3 })
    expect(settings).toMatchObject({ transport: undefined, maxResidentWebSocketSessions: 3 })
    expect(resolveOpenAICodexModelTransport(settings)).toBe('websocket-cached')
  })

  it('keeps prepared calls on their captured transport and removes only auto socket-cache identity', async () => {
    class FixtureCredentials extends OpenAICodexCredentialStore {
      override async read() {
        return { type: 'oauth' as const, accountId: 'offline-account', access: 'offline-access', refresh: 'offline-refresh', expires: Date.now() + 3_600_000 }
      }
      override async captureActiveAccount() { return this }
    }
    const credentials = new FixtureCredentials()
    let transport: OpenAICodexModelTransport = 'sse'
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
