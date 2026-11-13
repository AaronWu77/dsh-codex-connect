/** Request-owned cancellation and producer settlement for the Codex model adapter. */
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { RecentRequestKind, RecentRequestLog, RecentRequestOutcome, RecentRequestTransport } from './recent-requests.ts'

type ConfigTransport = 'auto' | 'sse'

interface UsageTotals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

interface RequestState {
  signal: AbortSignal
  proxyUrl: string | undefined
  producers: Promise<void>[]
  startedAt: number
  provider: string
  model: string
  kind: RecentRequestKind
  entryId: string
  recorded: boolean
  routeLabel?: string | undefined
  configuredTransport?: ConfigTransport | undefined
  reasoning?: string | undefined
  bodyBytes?: number | undefined
  usage?: UsageTotals | undefined
  transport?: RecentRequestTransport | undefined
}

interface ActiveRequest {
  close(): Promise<IteratorResult<StreamChunk>>
}

/** @param reason - terminal finish reason. @returns the recent-request outcome it represents. */
function outcomeOf(reason: Extract<StreamChunk, { type: 'finish' }>['reason']): RecentRequestOutcome {
  if (reason.kind === 'error') return 'error'
  if (reason.kind === 'aborted') return 'aborted'
  return 'ok'
}

/** @param options - the business request. @param resolveSessionKind - subagent lookup. @returns the request purpose shown by the panel. */
function requestKindOf(
  options: GenerateOptions,
  resolveSessionKind: ((sessionId: GenerateOptions['sessionId']) => 'conversation' | 'subagent') | undefined,
): RecentRequestKind {
  const purpose: string | undefined = options.purpose
  if (purpose === 'session-title') return 'title'
  if (purpose === 'compaction') return 'compaction'
  if (purpose === 'auto-review') return 'auto-review'
  return resolveSessionKind?.(options.sessionId) === 'subagent' ? 'subagent' : 'conversation'
}

/** Own model requests without retaining provider WebSocket sessions between requests. */
export class OpenAICodexRequestLifecycle {
  private readonly scope = new AsyncLocalStorage<RequestState>()
  private readonly lifetime = new AbortController()
  private readonly active = new Set<ActiveRequest>()
  private disposal: Promise<void> | undefined

  constructor(
    private readonly resolveProxyUrl?: () => string | undefined,
    private readonly recentRequests?: RecentRequestLog,
    private readonly resolveSessionKind?: (sessionId: GenerateOptions['sessionId']) => 'conversation' | 'subagent',
  ) {}

  /** The request's captured proxy and cancellation, including authentication. */
  current(): Readonly<RequestState> | undefined { return this.scope.getStore() }

  /** Record the route label and configured transport for the active request. */
  noteRoute(routeLabel: string | undefined, transport: ConfigTransport): void {
    const request = this.scope.getStore()
    if (request === undefined) return
    request.routeLabel = routeLabel
    request.configuredTransport = transport
  }

  /** Record the serialized payload bytes for the active request. */
  noteBodyBytes(bytes: number): void {
    const request = this.scope.getStore()
    if (request === undefined) return
    request.bodyBytes = bytes
    if (request.recorded) this.recentRequests?.update(request.entryId, { bodyBytes: bytes })
  }

  /** Merge the provider's final usage and transport diagnostics into the active request. */
  noteResult(message: AssistantMessage): void {
    const request = this.scope.getStore()
    if (request === undefined) return
    const failure = message.diagnostics?.find(diagnostic => diagnostic.type === 'provider_transport_failure')
    const fallback = failure?.details?.['fallbackTransport'] === 'sse' && failure.details?.['eventsEmitted'] === false
    const transport: RecentRequestTransport = request.configuredTransport === 'sse' || fallback ? 'sse' : 'ws'
    request.transport = transport
    if (message.usage !== undefined) {
      request.usage = {
        input: message.usage.input,
        output: message.usage.output,
        cacheRead: message.usage.cacheRead,
        cacheWrite: message.usage.cacheWrite,
      }
    }
    if (request.recorded) {
      this.recentRequests?.update(request.entryId, {
        transport,
        ...request.usage === undefined ? {} : {
          inputTokens: request.usage.input,
          outputTokens: request.usage.output,
          cacheReadTokens: request.usage.cacheRead,
          cacheWriteTokens: request.usage.cacheWrite,
        },
      })
    }
  }

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
          startedAt: Date.now(),
          provider: options.provider,
          model: options.model,
          kind: requestKindOf(options, owner.resolveSessionKind),
          entryId: randomUUID(),
          recorded: false,
          reasoning: options.reasoningEffort === undefined ? undefined : String(options.reasoningEffort),
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
              owner.record(state, 'aborted')
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
              if (!result.done && result.value.type === 'usage') {
                state.usage = {
                  input: result.value.usage.inputTokens,
                  output: result.value.usage.outputTokens,
                  cacheRead: result.value.usage.cacheReadTokens ?? 0,
                  cacheWrite: result.value.usage.cacheWriteTokens ?? 0,
                }
              }
              if (!result.done && result.value.type === 'finish') owner.record(state, outcomeOf(result.value.reason))
              if (result.done) await settle()
              return result
            } catch (error) {
              consumerReturned = true
              owner.record(state, 'error')
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

  /** Publish one completed request once, including late facts already captured. */
  private record(state: RequestState, outcome: RecentRequestOutcome): void {
    if (state.recorded) return
    state.recorded = true
    if (this.recentRequests === undefined) return
    const usage = state.usage
    this.recentRequests.record({
      id: state.entryId,
      startedAt: state.startedAt,
      provider: state.provider,
      model: state.model,
      kind: state.kind,
      routeLabel: state.routeLabel ?? state.provider,
      ...state.reasoning === undefined ? {} : { reasoning: state.reasoning },
      transport: state.transport ?? (state.configuredTransport === 'sse' ? 'sse' : 'ws'),
      inputTokens: usage?.input ?? 0,
      outputTokens: usage?.output ?? 0,
      cacheReadTokens: usage?.cacheRead ?? 0,
      cacheWriteTokens: usage?.cacheWrite ?? 0,
      ...state.bodyBytes === undefined ? {} : { bodyBytes: state.bodyBytes },
      outcome,
    })
  }
}
