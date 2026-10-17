import { describe, expect, it } from 'vitest'
import { defaultProviderAuthContext, InMemoryCredentialStore, normalizeContext } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { createAssistantMessageEventStream, AssistantMessageEventStream as LocalStream } from '@earendil-works/pi-ai/utils/event-stream'
import { normalizeContext as hostNormalizeContext } from '@earendil-works/pi-ai-host'
import { AssistantMessageEventStream as HostStream } from '@earendil-works/pi-ai-host/utils/event-stream'
import type { AssistantMessage, AssistantMessageEvent, Provider, StreamOptions, TranscriptContext } from '@earendil-works/pi-ai'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { createOpenAICodexProfile } from '../src/adapter.ts'
import { FastModeRegistry } from '../src/fast-mode.ts'
import { bridgePiProvider } from '../src/pi-host-bridge.ts'

const model = openaiCodexProvider().getModels()[0]!
function fixture(outcome: 'stop' | 'error' | 'aborted') {
  const events: AssistantMessageEvent[] = []
  const calls: { context: TranscriptContext; options: StreamOptions | undefined }[] = []
  const terminal: AssistantMessage = {
    role: 'assistant', content: [{ type: 'text', text: 'unchanged local output' }], api: model.api,
    provider: model.provider, model: model.id, responseId: 'local-response',
    usage: { input: 3, output: 2, cacheRead: 1, cacheWrite: 0, totalTokens: 6,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: outcome, timestamp: 1,
  }
  function produce(context: TranscriptContext, options?: StreamOptions) {
    calls.push({ context, options })
    const source = createAssistantMessageEventStream()
    const publish = (event: AssistantMessageEvent) => { events.push(event); source.push(event) }
    publish({ type: 'start', partial: terminal })
    publish({ type: 'text_start', contentIndex: 0, partial: terminal })
    publish({ type: 'text_delta', contentIndex: 0, delta: 'unchanged local output', partial: terminal })
    publish({ type: 'text_end', contentIndex: 0, content: 'unchanged local output', partial: terminal })
    const finish = () => publish(outcome === 'stop'
      ? { type: 'done', reason: 'stop', message: terminal }
      : { type: 'error', reason: outcome, error: terminal })
    if (outcome === 'aborted' && options?.signal !== undefined && !options.signal.aborted) {
      options.signal.addEventListener('abort', finish, { once: true })
    } else finish()
    return source
  }
  const local: Provider = { ...openaiCodexProvider(), stream: (_model, context, options) => produce(context, options),
    streamSimple: (_model, context, options) => produce(context, options) }
  return { local, terminal, calls, events }
}

describe('local PI to host stream bridge', () => {
  it.each(['stream', 'streamSimple'] as const)('preserves %s events, payload, options, and terminal identity', async method => {
    const f = fixture('stop')
    const host = bridgePiProvider(f.local)
    const messages = [{ role: 'user' as const, content: 'original prompt', timestamp: 1 }]
    const context = hostNormalizeContext({ systemPrompt: 'system prompt', messages })
    const samplingParams = { top_p: 0.75, custom_sampling: { keep: true } }
    const onPayload: NonNullable<StreamOptions['onPayload']> = payload => payload
    const onResponse = () => undefined
    const options = { apiKey: 'local-key', headers: { 'x-preserve': 'yes' }, samplingParams,
      cacheRetention: 'long' as const, maxRetries: 2, maxRetryDelayMs: 1234, onPayload, onResponse }
    const stream = host[method](model, context, options)
    expect(stream).toBeInstanceOf(HostStream)
    const observed = []
    for await (const event of stream) observed.push(event)
    expect(observed).toEqual(f.events)
    observed.forEach((event, index) => expect(event).toBe(f.events[index]))
    expect(await stream.result()).toBe(f.terminal)
    expect(f.calls[0]?.context).toEqual(normalizeContext(context))
    expect(f.calls[0]?.context.messages).toEqual(context.messages)
    expect(f.calls[0]?.options).toEqual(options)
    expect(f.calls[0]?.options?.onPayload).toBe(onPayload)
    expect(f.calls[0]?.options?.samplingParams).toBe(samplingParams)
    expect(host.auth).toBe(f.local.auth)
    expect(host.getModels()).toEqual(f.local.getModels())
  })

  it.each(['stream', 'streamSimple'] as const)('forwards %s error and cancellation terminal messages', async method => {
    for (const outcome of ['error', 'aborted'] as const) {
      const f = fixture(outcome)
      const abort = new AbortController()
      const stream = bridgePiProvider(f.local)[method](model, hostNormalizeContext({ messages: [] }), { signal: abort.signal })
      abort.abort('requested cancellation')
      const observed = []
      for await (const event of stream) observed.push(event)
      expect(observed).toEqual(f.events)
      expect(observed.at(-1)).toMatchObject({ type: 'error', reason: outcome })
      expect(await stream.result()).toBe(f.terminal)
      expect(f.calls[0]?.options?.signal).toBe(abort.signal)
    }
  })

  it('rejects both consumers when an asynchronous provider iterator fails', async () => {
    const failure = new Error('broken iterator')
    const local: Provider = { ...fixture('stop').local, streamSimple() {
      return new class extends LocalStream {
        override async *[Symbol.asyncIterator]() { throw failure }
        override async result(): Promise<AssistantMessage> { throw new Error('result must not be consulted') }
      }()
    } }
    const stream = bridgePiProvider(local).streamSimple(model, hostNormalizeContext({ messages: [] }))
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBe(failure)
    await expect(stream.result()).rejects.toBe(failure)
  })

  it('settles consumers when the producer final-result read rejects', async () => {
    const failure = new Error('broken result')
    const local: Provider = { ...fixture('stop').local, streamSimple() {
      return new class extends LocalStream {
        override async *[Symbol.asyncIterator]() {}
        override async result(): Promise<AssistantMessage> { throw failure }
      }()
    } }
    const stream = bridgePiProvider(local).streamSimple(model, hostNormalizeContext({ messages: [] }))
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBe(failure)
    await expect(stream.result()).rejects.toBe(failure)
  })

  it('preserves synchronous provider errors instead of hiding them in a stream', () => {
    const error = new Error('auth missing')
    const f = fixture('stop')
    const local: Provider = { ...f.local, streamSimple() { throw error } }
    expect(() => bridgePiProvider(local).streamSimple(model, hostNormalizeContext({ messages: [] }))).toThrow(error)
  })

  it('preserves request-scoped FastMode payload callbacks after host normalization', async () => {
    const f = fixture('stop')
    const fastMode = new FastModeRegistry()
    fastMode.set('session-local', true)
    const profile = createOpenAICodexProfile(f.local, fastMode)
    const payload = { model: model.id, input: [{ role: 'user', content: 'prompt' }], opaque: 'keep' }
    profile.piProvider.streamSimple(model, hostNormalizeContext({ messages: [] }), {
      sessionId: 'session-local', onPayload: value => value,
    })
    expect(await f.calls[0]?.options?.onPayload?.(payload, model)).toEqual({ ...payload, service_tier: 'priority', prompt_cache_key: 'session-local' })
    expect(payload).not.toHaveProperty('service_tier')
  })

  it('wraps optional deferred streams while retaining their receiver and cancellation', async () => {
    const f = fixture('stop')
    let receiver: Provider | undefined
    const cancelDeferred: NonNullable<Provider['cancelDeferred']> = async () => undefined
    const local: Provider = { ...f.local, cancelDeferred,
      fetchDeferred(_model, _handle, options) {
        receiver = this
        return f.local.streamSimple(model, normalizeContext({ messages: [] }), options)
      } }
    const host = bridgePiProvider(local)
    const stream = host.fetchDeferred?.(model, { api: model.api, provider: model.provider, modelId: model.id, id: 'deferred-local' })
    expect(stream).toBeInstanceOf(HostStream)
    expect(await stream?.result()).toBe(f.terminal)
    expect(receiver).toBe(local)
    expect(host.cancelDeferred).toBe(cancelDeferred)
    expect(bridgePiProvider(f.local).fetchDeferred).toBeUndefined()
  })

  it('delivers local output through the real alpha.2 PiAiAdapter', async () => {
    const f = fixture('stop')
    const profile = createOpenAICodexProfile(f.local)
    const adapter = new PiAiAdapter({ profiles: () => new Map([[profile.provider, profile]]),
      resolveApiKey: async () => 'local-key',
      auth: { credentials: new InMemoryCredentialStore(), authContext: defaultProviderAuthContext() } })
    const chunks = []
    for await (const chunk of adapter.stream({ provider: profile.provider, model: model.id, messages: [] })) chunks.push(chunk)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'text-delta', text: 'unchanged local output' }))
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]?.options?.apiKey).toBe('local-key')
  })
})
