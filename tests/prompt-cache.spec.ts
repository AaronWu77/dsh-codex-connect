import { describe, expect, it, vi } from 'vitest'
import { normalizeContext } from '@earendil-works/pi-ai'
import type { AssistantMessageEventStream, Context as PiContext, Model, Provider, SimpleStreamOptions } from '@earendil-works/pi-ai'
import {
  deriveOpenAICodexPromptCacheKey,
  withOpenAICodexFastMode,
  withOpenAICodexPayloadPolicy,
  OPENAI_CODEX_PROMPT_CACHE_KEY_MAX_LENGTH,
} from '../src/adapter.ts'
import { FastModeRegistry } from '../src/fast-mode.ts'
import type { OpenAICodexPayloadMetadata } from '../src/request-lifecycle.ts'

function providerFixture(id = 'openai-codex'): {
  provider: Provider
  streamSimple: ReturnType<typeof vi.fn>
} {
  const streamSimple = vi.fn((_model: Model<'openai-codex-responses'>, _context: PiContext, _options?: SimpleStreamOptions) => ({} as AssistantMessageEventStream))
  return {
    streamSimple,
    provider: {
      id,
      name: id,
      auth: { apiKey: { name: 'test', resolve: async () => undefined } },
      getModels: () => [],
      stream: streamSimple,
      streamSimple,
    } as unknown as Provider,
  }
}

function model(provider: string): Model<'openai-codex-responses'> {
  return { provider, id: 'gpt-5', name: 'GPT-5', api: 'openai-codex-responses', contextWindow: 1, input: ['text'] } as unknown as Model<'openai-codex-responses'>
}

const context = normalizeContext({
  systemPrompt: 'you are a careful assistant',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hello there' }], timestamp: 0 }],
})

describe('OpenAI Codex prompt cache key', () => {
  it('uses the Harness session id as the stable per-session key', () => {
    expect(deriveOpenAICodexPromptCacheKey(context, 'session-a')).toBe('session-a')
    expect(deriveOpenAICodexPromptCacheKey(context, 'session-a')).toBe('session-a')
    expect(deriveOpenAICodexPromptCacheKey(context, 'session-b')).toBe('session-b')
  })

  it('bounds an overlong session id to the API limit', () => {
    const long = 'x'.repeat(OPENAI_CODEX_PROMPT_CACHE_KEY_MAX_LENGTH + 20)
    const key = deriveOpenAICodexPromptCacheKey(context, long)
    expect(key).toHaveLength(OPENAI_CODEX_PROMPT_CACHE_KEY_MAX_LENGTH)
  })

  it('falls back to a stable hash of the system prompt and first user message', () => {
    const key = deriveOpenAICodexPromptCacheKey(context, undefined)
    expect(key).toMatch(/^codex-[0-9a-f]{40}$/)
    expect(deriveOpenAICodexPromptCacheKey(context, undefined)).toBe(key)
    const changedSystem = normalizeContext({
      systemPrompt: 'different',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello there' }], timestamp: 0 }],
    })
    const changedUser = normalizeContext({
      systemPrompt: 'you are a careful assistant',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'other' }], timestamp: 0 }],
    })
    expect(deriveOpenAICodexPromptCacheKey(changedSystem, undefined)).not.toBe(key)
    expect(deriveOpenAICodexPromptCacheKey(changedUser, undefined)).not.toBe(key)
    expect(deriveOpenAICodexPromptCacheKey(normalizeContext({ messages: [] }), undefined)).toBeUndefined()
    expect(deriveOpenAICodexPromptCacheKey(normalizeContext({ messages: [], systemPrompt: '' }), undefined)).toBeUndefined()
  })
})

describe('normalized system prompt cache identity', () => {
  it('derives a key for system-only contexts and preserves legacy prompt identity', () => {
    const input = { systemPrompt: 'only instructions', messages: [] }
    const normalized = normalizeContext(input)
    expect(deriveOpenAICodexPromptCacheKey(normalized, undefined)).toMatch(/^codex-[0-9a-f]{40}$/)
    expect(deriveOpenAICodexPromptCacheKey(normalized, undefined))
      .toBe(deriveOpenAICodexPromptCacheKey(input, undefined))
  })

  it('includes effective system sections and their updates', () => {
    const a = normalizeContext({ messages: [{ role: 'system', content: '', sections: { policy: 'A' }, timestamp: 0 }] })
    const b = normalizeContext({ messages: [{ role: 'system', content: '', sections: { policy: 'B' }, timestamp: 0 }] })
    expect(deriveOpenAICodexPromptCacheKey(a, undefined)).toMatch(/^codex-[0-9a-f]{40}$/)
    expect(deriveOpenAICodexPromptCacheKey(a, undefined)).not.toBe(deriveOpenAICodexPromptCacheKey(b, undefined))
    const updated = normalizeContext({ messages: [...a.messages, { role: 'system', content: '', sections: { policy: 'B' }, timestamp: 1 }] })
    expect(deriveOpenAICodexPromptCacheKey(updated, undefined)).toBe(deriveOpenAICodexPromptCacheKey(b, undefined))
    const removed = normalizeContext({ messages: [...a.messages, { role: 'system', content: '', sections: { policy: null }, timestamp: 1 }] })
    expect(deriveOpenAICodexPromptCacheKey(removed, undefined)).toBeUndefined()
  })
})

describe('OpenAI Codex payload transform', () => {
  it('observes only payload metadata even when no additions or field logging are enabled', async () => {
    const fixture = providerFixture()
    const observed: OpenAICodexPayloadMetadata[] = []
    const wrapped = withOpenAICodexPayloadPolicy(fixture.provider, {
      onPayloadMetadata: metadata => { observed.push(metadata) },
    })
    wrapped.streamSimple(model('openai-codex'), normalizeContext({ messages: [] }), {})
    const options = fixture.streamSimple.mock.lastCall?.[2] as SimpleStreamOptions | undefined
    const body = Object.freeze({ model: 'gpt-5', input: [{ text: 'private prompt 正文' }], reasoning: { effort: 'low' } })
    expect(await options?.onPayload?.(body, model('openai-codex'))).toEqual(body)
    expect(observed).toEqual([{ bodyBytes: Buffer.byteLength(JSON.stringify(body), 'utf8'), reasoning: 'low' }])
    expect(JSON.stringify(observed)).not.toContain('private prompt')
    expect(JSON.stringify(observed)).not.toContain('input')
  })

  it('observes the preceding replacement after speed and cache additions without retaining its body', async () => {
    const fixture = providerFixture()
    const registry = new FastModeRegistry()
    registry.set('session-a', true)
    const observed: OpenAICodexPayloadMetadata[] = []
    const wrapped = withOpenAICodexPayloadPolicy(fixture.provider, {
      fastMode: registry,
      derivePromptCacheKey: deriveOpenAICodexPromptCacheKey,
      onPayloadMetadata: metadata => { observed.push(metadata) },
    })
    const replacement = Object.freeze({ model: 'gpt-5', input: [{ text: 'replacement private body' }], reasoning: { effort: 'high' } })
    const previous = vi.fn(() => Promise.resolve(replacement))
    wrapped.streamSimple(model('openai-codex'), context, { sessionId: 'session-a', onPayload: previous })
    const options = fixture.streamSimple.mock.lastCall?.[2] as SimpleStreamOptions | undefined
    const original = Object.freeze({ model: 'gpt-5', input: [], reasoning: { effort: 'low' } })
    const result = await options?.onPayload?.(original, model('openai-codex'))
    expect(previous).toHaveBeenCalledWith(original, model('openai-codex'))
    expect(result).toEqual({ ...replacement, service_tier: 'priority', prompt_cache_key: 'session-a' })
    expect(observed).toEqual([{ bodyBytes: Buffer.byteLength(JSON.stringify(result), 'utf8'), reasoning: 'high' }])
    expect(JSON.stringify(observed)).not.toContain('replacement private body')
    expect(original.reasoning.effort).toBe('low')
    expect(replacement).not.toHaveProperty('service_tier')
    expect(replacement).not.toHaveProperty('prompt_cache_key')
  })

  it.each([{}, { reasoning: {} }, { reasoning: null }])('observes an absent effort as null for %j', async body => {
    const fixture = providerFixture()
    const observed: OpenAICodexPayloadMetadata[] = []
    const wrapped = withOpenAICodexPayloadPolicy(fixture.provider, { onPayloadMetadata: metadata => { observed.push(metadata) } })
    wrapped.streamSimple(model('openai-codex'), context, {})
    const options = fixture.streamSimple.mock.lastCall?.[2] as SimpleStreamOptions | undefined
    expect(await options?.onPayload?.(body, model('openai-codex'))).toEqual(body)
    expect(observed).toEqual([{ bodyBytes: Buffer.byteLength(JSON.stringify(body), 'utf8'), reasoning: null }])
  })

  it('observes an effort removed by the preceding replacement as null', async () => {
    const fixture = providerFixture()
    const observed: OpenAICodexPayloadMetadata[] = []
    const wrapped = withOpenAICodexPayloadPolicy(fixture.provider, { onPayloadMetadata: metadata => { observed.push(metadata) } })
    const replacement = Object.freeze({ model: 'gpt-5', input: [] })
    wrapped.streamSimple(model('openai-codex'), context, { onPayload: () => replacement })
    const options = fixture.streamSimple.mock.lastCall?.[2] as SimpleStreamOptions | undefined
    const original = Object.freeze({ model: 'gpt-5', input: [], reasoning: { effort: 'high' } })
    expect(await options?.onPayload?.(original, model('openai-codex'))).toEqual(replacement)
    expect(observed).toEqual([{ bodyBytes: Buffer.byteLength(JSON.stringify(replacement), 'utf8'), reasoning: null }])
    expect(original.reasoning.effort).toBe('high')
  })

  it('keeps the prepared payload unchanged when its optional observer throws', async () => {
    const fixture = providerFixture()
    const observe = vi.fn((_metadata: OpenAICodexPayloadMetadata) => { throw new Error('optional observer failed') })
    const wrapped = withOpenAICodexPayloadPolicy(fixture.provider, { onPayloadMetadata: observe })
    wrapped.streamSimple(model('openai-codex'), context, {})
    const options = fixture.streamSimple.mock.lastCall?.[2] as SimpleStreamOptions | undefined
    const body = Object.freeze({ model: 'gpt-5', input: [], reasoning: { effort: 'low' } })
    await expect(options?.onPayload?.(body, model('openai-codex'))).resolves.toEqual(body)
    expect(observe).toHaveBeenCalledOnce()
  })

  it('adds the session key to the same payload that carries Fast Mode priority', async () => {
    const fixture = providerFixture()
    const registry = new FastModeRegistry()
    registry.set('session-a', true)
    const wrapped = withOpenAICodexPayloadPolicy(fixture.provider, {
      fastMode: registry,
      derivePromptCacheKey: deriveOpenAICodexPromptCacheKey,
    })

    wrapped.streamSimple(model('openai-codex'), context, { sessionId: 'session-a' })
    const options = fixture.streamSimple.mock.lastCall?.[2] as SimpleStreamOptions | undefined
    expect(await options?.onPayload?.({ model: 'gpt-5', input: [] }, model('openai-codex')))
      .toEqual({ model: 'gpt-5', input: [], service_tier: 'priority', prompt_cache_key: 'session-a' })
  })

  it('adds the derived key when no session id is available and a hash can be derived', async () => {
    const fixture = providerFixture()
    const wrapped = withOpenAICodexPayloadPolicy(fixture.provider, { derivePromptCacheKey: deriveOpenAICodexPromptCacheKey })

    wrapped.streamSimple(model('openai-codex'), context, {})
    const options = fixture.streamSimple.mock.lastCall?.[2] as SimpleStreamOptions | undefined
    const result = await options?.onPayload?.({ model: 'gpt-5', input: [] }, model('openai-codex')) as Record<string, unknown>
    expect(result['prompt_cache_key']).toMatch(/^codex-[0-9a-f]{40}$/)
  })

  it('sends nothing, not an empty string, when no key can be derived', () => {
    const fixture = providerFixture()
    const wrapped = withOpenAICodexPayloadPolicy(fixture.provider, { derivePromptCacheKey: deriveOpenAICodexPromptCacheKey })
    const options: SimpleStreamOptions = {}
    wrapped.streamSimple(model('openai-codex'), normalizeContext({ messages: [] }), options)
    expect(fixture.streamSimple).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), options)
  })

  it('respects an explicit no-cache request and leaves store and encrypted reasoning intact', async () => {
    const fixture = providerFixture()
    const wrapped = withOpenAICodexPayloadPolicy(fixture.provider, { derivePromptCacheKey: deriveOpenAICodexPromptCacheKey })
    const noCache: SimpleStreamOptions = { sessionId: 'session-a', cacheRetention: 'none' }
    wrapped.streamSimple(model('openai-codex'), context, noCache)
    expect(fixture.streamSimple).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), noCache)

    const withKey: SimpleStreamOptions = { sessionId: 'session-a' }
    wrapped.streamSimple(model('openai-codex'), context, withKey)
    const next = fixture.streamSimple.mock.lastCall?.[2] as SimpleStreamOptions | undefined
    const body = { model: 'gpt-5', input: [], store: false, include: ['reasoning.encrypted_content'] }
    expect(await next?.onPayload?.(body, model('openai-codex'))).toEqual({
      ...body,
      prompt_cache_key: 'session-a',
    })
  })

  it('logs only the payload field names when the debug resolver is enabled', async () => {
    const fixture = providerFixture()
    const logged: (readonly string[])[] = []
    const wrapped = withOpenAICodexPayloadPolicy(fixture.provider, {
      derivePromptCacheKey: deriveOpenAICodexPromptCacheKey,
      onPayloadFields: () => names => { logged.push(names) },
    })

    wrapped.streamSimple(model('openai-codex'), context, { sessionId: 'session-a' })
    const options = fixture.streamSimple.mock.lastCall?.[2] as SimpleStreamOptions | undefined
    await options?.onPayload?.({ model: 'gpt-5', input: [{ text: 'do-not-log' }], store: false }, model('openai-codex'))

    expect(logged).toEqual([['model', 'input', 'store', 'prompt_cache_key']])
    expect(JSON.stringify(logged)).not.toContain('do-not-log')
  })

  it('installs no transform when the debug resolver returns undefined', () => {
    const fixture = providerFixture()
    const wrapped = withOpenAICodexPayloadPolicy(fixture.provider, { onPayloadFields: () => undefined })
    const options: SimpleStreamOptions = {}
    wrapped.streamSimple(model('openai-codex'), context, options)
    expect(fixture.streamSimple).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), options)
  })

  it('keeps the Fast Mode-only wrapper free of prompt cache fields', async () => {
    const fixture = providerFixture()
    const registry = new FastModeRegistry()
    registry.set('session-a', true)
    const wrapped = withOpenAICodexFastMode(fixture.provider, registry)
    wrapped.streamSimple(model('openai-codex'), context, { sessionId: 'session-a' })
    const options = fixture.streamSimple.mock.lastCall?.[2] as SimpleStreamOptions | undefined
    expect(await options?.onPayload?.({ model: 'gpt-5', input: [] }, model('openai-codex')))
      .toEqual({ model: 'gpt-5', input: [], service_tier: 'priority' })
  })
})
