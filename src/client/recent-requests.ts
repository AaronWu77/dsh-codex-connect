/** Browser reader for the Host's process-local recent Codex requests. */
import { requestJson } from './request-json.ts'

/** Same-origin route served by the plugin's Host half. */
const RECENT_REQUESTS_ROUTE = '/api/dsh-codex-connect/recent-requests'

/** Which transport served one request. */
export type RecentRequestTransport = 'ws' | 'sse'

/** Terminal result of one request. */
export type RecentRequestOutcome = 'ok' | 'error' | 'aborted'

/** One display-safe recent request. */
export interface RecentRequestView {
  id: string
  startedAt: number
  provider: string
  model: string
  routeLabel: string
  reasoning?: string
  transport: RecentRequestTransport
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  bodyBytes?: number
  outcome: RecentRequestOutcome
}

/** Display state of the recent-request reader. */
export interface RecentRequestsSnapshot {
  state: 'idle' | 'loading' | 'ready' | 'failed'
  requests: readonly RecentRequestView[]
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function requestOf(value: unknown): RecentRequestView | undefined {
  const entry = record(value)
  if (entry === undefined) return undefined
  const id = text(entry['id'])
  const provider = text(entry['provider'])
  const model = text(entry['model'])
  const routeLabel = text(entry['routeLabel'])
  const startedAt = count(entry['startedAt'])
  const transport = entry['transport']
  const outcome = entry['outcome']
  const inputTokens = count(entry['inputTokens'])
  const outputTokens = count(entry['outputTokens'])
  const cacheReadTokens = count(entry['cacheReadTokens'])
  const cacheWriteTokens = count(entry['cacheWriteTokens'])
  const reasoning = entry['reasoning']
  const bodyBytes = entry['bodyBytes']
  if (id === undefined || provider === undefined || model === undefined || routeLabel === undefined
    || startedAt === undefined || (transport !== 'ws' && transport !== 'sse')
    || (outcome !== 'ok' && outcome !== 'error' && outcome !== 'aborted')
    || inputTokens === undefined || outputTokens === undefined
    || cacheReadTokens === undefined || cacheWriteTokens === undefined) return undefined
  return {
    id,
    startedAt,
    provider,
    model,
    routeLabel,
    ...typeof reasoning === 'string' && reasoning.length > 0 ? { reasoning } : {},
    transport,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    ...count(bodyBytes) === undefined ? {} : { bodyBytes: bodyBytes as number },
    outcome,
  }
}

/** @param value - route JSON. @returns validated newest-first requests, capped at five. */
export function recentRequestsOf(value: unknown): RecentRequestView[] {
  const body = record(value)
  if (body === undefined || !Array.isArray(body['requests'])) return []
  return body['requests'].slice(0, 5).flatMap(entry => {
    const request = requestOf(entry)
    return request === undefined ? [] : [request]
  })
}

/**
 * Observable recent-request source. Refreshes on demand while the panel is visible;
 * failed refreshes retain the last good rows.
 */
export class RecentRequestsStore {
  private current: RecentRequestsSnapshot = Object.freeze({ state: 'ready', requests: [] })
  private readonly listeners = new Set<() => void>()
  private pending: Promise<void> | undefined

  /** @param listener - notified after each published snapshot. @returns its disposer. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @returns the same snapshot until a refresh publishes another. */
  readonly snapshot = (): RecentRequestsSnapshot => this.current

  /** Read the Host's current list; concurrent callers share one request. */
  refresh(): Promise<void> {
    if (this.pending !== undefined) return this.pending
    if (this.current.requests.length === 0) this.publish({ state: 'loading', requests: [] })
    this.pending = (async () => {
      try {
        const { response, value } = await requestJson(RECENT_REQUESTS_ROUTE, { method: 'GET' })
        if (!response.ok) throw new Error(`recent requests returned HTTP ${response.status}`)
        this.publish({ state: 'ready', requests: recentRequestsOf(value) })
      } catch (_error) {
        this.publish({ state: 'failed', requests: this.current.requests })
      } finally {
        this.pending = undefined
      }
    })()
    return this.pending
  }

  private publish(next: RecentRequestsSnapshot): void {
    this.current = Object.freeze({ state: next.state, requests: Object.freeze([...next.requests]) })
    for (const listener of this.listeners) listener()
  }
}
