/** In-memory recent Codex request summaries for the sidebar panel. */

/** Which transport served one request, when known. */
export type RecentRequestTransport = 'ws' | 'sse'

/** Terminal result of one request. */
export type RecentRequestOutcome = 'ok' | 'error' | 'aborted'

/** Why the Harness issued one Codex model request. */
export type RecentRequestKind = 'conversation' | 'title' | 'compaction' | 'subagent' | 'auto-review'

/** One bounded, secret-free request summary. */
export interface RecentRequestEntry {
  id: string
  startedAt: number
  provider: string
  model: string
  routeLabel: string
  kind: RecentRequestKind
  /** Original Host request selection, before provider payload mapping. */
  reasoning?: string
  /** Prepared payload effort; null means observed without an effort, absent means not observed or an older Host. */
  payloadReasoning?: string | null
  transport: RecentRequestTransport
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /** Serialized request-body bytes; absent when no payload was observed. */
  bodyBytes?: number
  outcome: RecentRequestOutcome
}

/** Keep only the five newest requests, matching the panel's fixed scope. */
export const RECENT_REQUEST_LIMIT = 5

/**
 * FIFO of recent requests owned by one plugin instance.
 * Entries are process-local and never persisted or exposed across restarts.
 */
export class RecentRequestLog {
  private readonly entries: RecentRequestEntry[] = []

  /** Add one completed request, evicting the oldest beyond the limit. */
  record(entry: RecentRequestEntry): void {
    this.entries.unshift({ ...entry })
    if (this.entries.length > RECENT_REQUEST_LIMIT) this.entries.length = RECENT_REQUEST_LIMIT
  }

  /** Merge late payload, transport or usage facts into an already recorded request. */
  update(id: string, patch: Partial<Omit<RecentRequestEntry, 'id'>>): void {
    const index = this.entries.findIndex(entry => entry.id === id)
    const entry = this.entries[index]
    if (entry === undefined) return
    this.entries[index] = { ...entry, ...patch, id: entry.id }
  }

  /** @returns a detached copy, newest first. */
  snapshot(): readonly RecentRequestEntry[] {
    return this.entries.map(entry => ({ ...entry }))
  }
}
