/** Request-owned cancellation and producer settlement for the Codex model adapter. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

interface RequestState {
  signal: AbortSignal
  proxyUrl: string | undefined
  producers: Promise<void>[]
}

interface ActiveRequest {
  close(): Promise<IteratorResult<StreamChunk>>
}

/** Own model requests without retaining provider WebSocket sessions between requests. */
export class OpenAICodexRequestLifecycle {
  private readonly scope = new AsyncLocalStorage<RequestState>()
  private readonly lifetime = new AbortController()
  private readonly active = new Set<ActiveRequest>()
  private disposal: Promise<void> | undefined

  constructor(private readonly resolveProxyUrl?: () => string | undefined) {}

  /** The request's captured proxy and cancellation, including authentication. */
  current(): Readonly<RequestState> | undefined { return this.scope.getStore() }

  /**
   * Await producer termination even when the Host stops consuming its iterator early.
   * @param result - producer settlement; stream consumers retain responsibility for reporting its failure.
   */
  trackProducer(result: Promise<unknown>): void {
    const request = this.scope.getStore()
    if (request !== undefined) request.producers.push(result.then(() => undefined, () => undefined))
  }

  /**
   * Admit a lazy model request with immutable connection selection and fused cancellation.
   * @param stream - Host stream using the request-owned cancellation signal.
   * @param options - original business request, including its durable Session id.
   * @returns a stream rejected after disposal and drained on cancellation or consumer return.
   */
  stream(stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>, options: GenerateOptions): AsyncIterable<StreamChunk> {
    const owner = this
    return {
      [Symbol.asyncIterator]() {
        if (owner.lifetime.signal.aborted) throw new LlmError('OpenAI Codex adapter is disposed', 'ABORTED')
        const controller = new AbortController()
        const state: RequestState = {
          signal: AbortSignal.any([controller.signal, owner.lifetime.signal, ...options.signal === undefined ? [] : [options.signal]]),
          proxyUrl: owner.resolveProxyUrl?.(),
          producers: [],
        }
        const source = owner.scope.run(state, () => stream({ ...options, signal: state.signal })[Symbol.asyncIterator]())
        let finished = false
        let terminalDelivered = false
        let consumerReturned = false
        let closing: Promise<IteratorResult<StreamChunk>> | undefined
        let settlement: Promise<void> | undefined
        const settle = (): Promise<void> => {
          settlement ??= (async () => {
            finished = true
            await Promise.all(state.producers)
            owner.active.delete(request)
          })()
          return settlement
        }
        const request: ActiveRequest = {
          close() {
            closing ??= (async () => {
              controller.abort('OpenAI Codex request consumer stopped')
              try {
                return await owner.scope.run(state, () => source.return?.() ?? Promise.resolve({ done: true as const, value: undefined }))
              } finally {
                await settle()
              }
            })()
            return closing
          },
        }
        owner.active.add(request)
        return {
          async next() {
            if (closing !== undefined && owner.lifetime.signal.aborted && !consumerReturned && !terminalDelivered) {
              await closing
              if (!terminalDelivered) {
                terminalDelivered = true
                return {
                  done: false as const,
                  value: {
                    type: 'finish' as const,
                    reason: { kind: 'aborted' as const, failure: { code: 'ABORTED', message: 'OpenAI Codex adapter disposed' } },
                  },
                }
              }
            }
            if (finished || closing !== undefined) return { done: true as const, value: undefined }
            try {
              const result = await owner.scope.run(state, () => source.next())
              if (!result.done && result.value.type === 'finish') terminalDelivered = true
              if (result.done) await settle()
              return result
            } catch (error) {
              consumerReturned = true
              controller.abort('OpenAI Codex model request failed')
              await request.close()
              throw error
            }
          },
          return: () => { consumerReturned = true; return request.close() },
        }
      },
    }
  }

  /**
   * Stop admission, cancel requests, and await their iterators and provider producers.
   * PI 1.4 initiates socket close but exposes no awaitable socket-close acknowledgement.
   * @returns after admitted model work settles; rejects if iterator cleanup fails.
   */
  dispose(): Promise<void> {
    this.disposal ??= (async () => {
      this.lifetime.abort('OpenAI Codex adapter disposed')
      const results = await Promise.allSettled([...this.active].map(request => request.close()))
      const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
      if (errors.length > 0) throw new AggregateError(errors, 'OpenAI Codex request cleanup failed')
    })()
    return this.disposal
  }
}
