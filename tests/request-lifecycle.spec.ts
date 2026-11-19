import { describe, expect, it } from 'vitest'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { OpenAICodexRequestLifecycle } from '../src/request-lifecycle.ts'

const options: GenerateOptions = { provider: 'openai-codex', model: 'offline', messages: [] }
function gate() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

describe('Codex model request ownership', () => {
  it('drains a producer even when the consumer is paused after a yielded chunk', async () => {
    const lifecycle = new OpenAICodexRequestLifecycle()
    const producer = gate()
    const iteratorClosed = gate()
    const stream = lifecycle.stream(() => {
      lifecycle.trackProducer(producer.promise)
      return {
        async *[Symbol.asyncIterator]() {
          try { yield { type: 'text-delta', index: 0, text: 'partial' } as const }
          finally { iteratorClosed.resolve() }
        },
      }
    }, options)
    const iterator = stream[Symbol.asyncIterator]()
    expect((await iterator.next()).done).toBe(false)
    let disposed = false
    const disposal = lifecycle.dispose().then(() => { disposed = true })
    await iteratorClosed.promise
    expect(disposed).toBe(false)
    producer.resolve()
    await disposal
    expect(disposed).toBe(true)
    expect(await iterator.next()).toMatchObject({ done: false, value: { type: 'finish', reason: { kind: 'aborted' } } })
    expect(await iterator.next()).toMatchObject({ done: true })
  })

  it('cancels pending work, keeps its captured proxy, and leaves caller options unchanged', async () => {
    let proxyUrl: string | undefined
    const lifecycle = new OpenAICodexRequestLifecycle(() => proxyUrl)
    const admitted = gate()
    const caller = new AbortController()
    const original = { ...options, signal: caller.signal }
    let state: ReturnType<typeof lifecycle.current>
    const stream = lifecycle.stream(request => ({
      async *[Symbol.asyncIterator](): AsyncGenerator<StreamChunk> {
        state = lifecycle.current()
        expect(request.signal).not.toBe(caller.signal)
        admitted.resolve()
        await new Promise<void>(resolve => { request.signal!.addEventListener('abort', () => resolve(), { once: true }) })
        expect(lifecycle.current()?.proxyUrl).toBeUndefined()
      },
    }), original)
    const iterator = stream[Symbol.asyncIterator]()
    const pending = iterator.next()
    await admitted.promise
    proxyUrl = 'http://127.0.0.1:7890'
    caller.abort('offline cancellation')
    expect(await pending).toMatchObject({ done: true })
    expect(state?.signal.aborted).toBe(true)
    expect(original.signal).toBe(caller.signal)
    await lifecycle.dispose()
  })

  it('keeps an explicit consumer return silent instead of adding an aborted terminal later', async () => {
    const lifecycle = new OpenAICodexRequestLifecycle()
    const stream = lifecycle.stream(() => ({
      async *[Symbol.asyncIterator](): AsyncGenerator<StreamChunk> {
        yield { type: 'text-delta', index: 0, text: 'partial' }
      },
    }), options)
    const iterator = stream[Symbol.asyncIterator]()
    await iterator.next()
    await iterator.return?.()
    await lifecycle.dispose()
    expect(await iterator.next()).toMatchObject({ done: true })
  })

  it('does not replace an already delivered finish with an aborted finish on disposal', async () => {
    const lifecycle = new OpenAICodexRequestLifecycle()
    const stream = lifecycle.stream(() => ({
      async *[Symbol.asyncIterator](): AsyncGenerator<StreamChunk> {
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }), options)
    const iterator = stream[Symbol.asyncIterator]()
    expect(await iterator.next()).toMatchObject({ value: { type: 'finish', reason: { kind: 'stop' } } })
    await lifecycle.dispose()
    expect(await iterator.next()).toMatchObject({ done: true })
  })

  it('rejects a lazy request captured before disposal without calling its producer', async () => {
    const lifecycle = new OpenAICodexRequestLifecycle()
    let called = false
    const stream = lifecycle.stream(() => {
      called = true
      return { async *[Symbol.asyncIterator](): AsyncGenerator<StreamChunk> {} }
    }, options)
    await lifecycle.dispose()
    expect(() => stream[Symbol.asyncIterator]()).toThrow('disposed')
    expect(called).toBe(false)
  })
})
