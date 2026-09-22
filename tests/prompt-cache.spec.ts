import { describe, expect, it, vi } from 'vitest'
import type { AssistantMessageEventStream, Context as PiContext, Model, Provider, SimpleStreamOptions } from '@earendil-works/pi-ai'
import {
  deriveOpenAICodexPromptCacheKey,
  withOpenAICodexFastMode,
  withOpenAICodexPayloadPolicy,
  OPENAI_CODEX_PROMPT_CACHE_KEY_MAX_LENGTH,
} from '../src/adapter.ts'
import { FastModeRegistry } from '../src/fast-mode.ts'

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

const context = {
  systemPrompt: 'you are a careful assistant',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hello there' }] }],
} as unknown as PiContext

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
    expect(deriveOpenAICodexPromptCacheKey({ ...context, systemPrompt: 'different' }, undefined)).not.toBe(key)
    expect(deriveOpenAICodexPromptCacheKey({ ...context, messages: [{ role: 'user', content: [{ type: 'text', text: 'other' }] }] } as unknown as PiContext, undefined)).not.toBe(key)
    // An empty context has no stable identity, so no key is sent.
    expect(deriveOpenAICodexPromptCacheKey({ messages: [] } as unknown as PiContext, undefined)).toBeUndefined()
    expect(deriveOpenAICodexPromptCacheKey({ messages: [], systemPrompt: '' } as unknown as PiContext, undefined)).toBeUndefined()
  })
})

describe('OpenAI Codex payload transform', () => {
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
    wrapped.streamSimple(model('openai-codex'), { messages: [] } as PiContext, options)
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
