/**
 * Bounded residency for the Codex continuation WebSocket.
 *
 * PI keeps the connection cache inside its own module state, keyed by the
 * session id handed to a request. This class owns the plugin-side decisions
 * around that cache: which requests may use a resident connection, how many
 * may exist, when one is closed, and when a session that fell back to SSE may
 * try WebSocket again.
 */

import type { AssistantMessage } from '@earendil-works/pi-ai'
import {
  closeOpenAICodexWebSocketSessions,
  getOpenAICodexWebSocketDebugStats,
  resetOpenAICodexWebSocketDebugStats,
} from '@earendil-works/pi-ai/api/openai-codex-responses'

/** Largest resident-connection budget the settings contract accepts. */
export const MAX_OPENAI_CODEX_RESIDENT_SESSIONS = 8

/** Why one session stopped using its resident connection. */
export type OpenAICodexResidencyDegradeReason = 'connection-limit' | 'handshake' | 'mid-stream'

/** Transport failure facts PI reports for one completed request. */
export interface OpenAICodexTransportFailure {
  /** Stable provider error code, when PI exposed one. */
  readonly code?: string
  /** Whether any response event reached the caller before the failure. */
  readonly eventsEmitted: boolean
}

/** Opaque ownership of one request admitted into the residency budget. */
export interface OpenAICodexResidencyLease {
  /** Session whose residency slot this request owns. */
  readonly sessionId: string
  /** Counter snapshot for attributing this request's delta/full classification. */
  readonly before: { delta: number; full: number }
}

/** Per-request admission result; only an admitted request owns a lease. */
export type OpenAICodexResidencyDecision =
  | { readonly continuation: false }
  | { readonly continuation: true; readonly lease: OpenAICodexResidencyLease }

/** Transport actually used by one settled request. */
export type OpenAICodexSettledTransport = 'ws' | 'sse'

/** Facts observed for one settled request, scoped to that request rather than to its session. */
export interface OpenAICodexSettlement {
  /** Transport that carried the request, including a handshake fallback to SSE. */
  readonly transport: OpenAICodexSettledTransport
  /** How the request carried its conversation; present only when this request was the session's only live lease. */
  readonly continuation?: OpenAICodexContinuationKind
  /** Trailing input items a delta request sent; present only with `continuation: 'delta'`. */
  readonly deltaItems?: number
}

interface ResidencyEntry {
  readonly sessionId: string
  inFlight: number
  lastUsed: number
  reason?: OpenAICodexResidencyDegradeReason | undefined
  attempts: number
  cooldownMs: number
  retryAt: number
  retryArmed: boolean
  closeWhenIdle?: boolean | undefined
}

/** How one WebSocket request carried the conversation. */
export type OpenAICodexContinuationKind = 'delta' | 'full'

/** @param sessionId - session whose counters to read. @returns the current delta/full counters. */
function readCounters(sessionId: string): { delta: number; full: number } {
  const stats = getOpenAICodexWebSocketDebugStats(sessionId)
  return { delta: stats?.deltaRequests ?? 0, full: stats?.fullContextRequests ?? 0 }
}

/** First retry delay for one degradation reason. */
function baseCooldownMs(reason: OpenAICodexResidencyDegradeReason): number {
  if (reason === 'connection-limit') return 15_000
  if (reason === 'mid-stream') return 30_000
  return 60_000
}

/** Cap for the retry delay of a session that keeps degrading. */
const MAX_COOLDOWN_MS = 300_000

/** Only a real conversation turn spends a resident connection. */
function eligibleKind(kind: string | undefined): boolean {
  return kind === 'conversation'
}

/**
 * Read PI's transport-failure diagnostic from one completed message.
 * @param message - final assistant message of the request.
 * @returns the failure facts, or undefined when the request reported none.
 */
export function readOpenAICodexTransportFailure(
  message: AssistantMessage,
): OpenAICodexTransportFailure | undefined {
  const diagnostic = message.diagnostics?.find(entry => entry.type === 'provider_transport_failure')
  if (diagnostic === undefined) return undefined
  const code = diagnostic.error?.code
  return {
    ...typeof code === 'string' ? { code } : {},
    eventsEmitted: diagnostic.details?.['eventsEmitted'] === true,
  }
}

/** @param failure - reported transport failure. @returns the residency reason it represents. */
function classifyFailure(failure: OpenAICodexTransportFailure): OpenAICodexResidencyDegradeReason {
  if (failure.code === 'websocket_connection_limit_reached') return 'connection-limit'
  return failure.eventsEmitted ? 'mid-stream' : 'handshake'
}

/** Options owned by the plugin instance that creates one residency registry. */
export interface OpenAICodexResidencyOptions {
  /** Current resident-connection budget; 0 keeps every request on SSE. */
  resolveLimit: () => number
  /** Clock injection for deterministic retry tests. */
  now?: (() => number) | undefined
}

/**
 * Own the plugin-side residency budget and retry policy for one plugin instance.
 *
 * A request is admitted only when it is a conversation turn, it carries a
 * session id, and a slot is free. Eviction and explicit closes go through
 * PI's public cache controls, so no socket outlives this object.
 */
export class OpenAICodexWebSocketResidency {
  private readonly entries = new Map<string, ResidencyEntry>()
  private readonly now: () => number
  private closeAllPending = false
  private readonly leases = new WeakMap<OpenAICodexResidencyLease, ResidencyEntry>()

  constructor(private readonly options: OpenAICodexResidencyOptions) {
    this.now = options.now ?? Date.now
  }

  /** @returns the budget after clamping a resolved setting to the supported range. */
  private limit(): number {
    const value = Math.trunc(this.options.resolveLimit())
    if (!Number.isFinite(value) || value < 0) return 0
    return Math.min(value, MAX_OPENAI_CODEX_RESIDENT_SESSIONS)
  }

  /** @returns the number of requests currently owning a residency slot. */
  private inFlight(): number {
    let total = 0
    for (const entry of this.entries.values()) total += entry.inFlight
    return total
  }

  /**
   * Admit one request into the residency budget.
   * @param sessionId - business session id, absent for requests without one.
   * @param kind - request purpose resolved by the request lifecycle.
   * @returns the admission decision; `continuation: false` means SSE.
   */
  admit(sessionId: string | undefined, kind: string | undefined): OpenAICodexResidencyDecision {
    if (this.closeAllPending) return { continuation: false }
    const limit = this.limit()
    if (sessionId === undefined || sessionId.length === 0 || !eligibleKind(kind) || limit === 0) {
      return { continuation: false }
    }
    let entry = this.entries.get(sessionId)
    // A deferred close must not be postponed by new work on the same session.
    if (entry?.closeWhenIdle === true) return { continuation: false }
    if (entry === undefined) {
      // A new resident connection needs a free slot; evict the least recently used idle one.
      if (this.entries.size >= limit && !this.evictIdle(sessionId)) return { continuation: false }
      entry = { sessionId, inFlight: 0, lastUsed: this.now(), attempts: 0, cooldownMs: 0, retryAt: 0, retryArmed: false }
      this.entries.set(sessionId, entry)
    }
    this.rearmRetry(entry)
    entry.inFlight += 1
    entry.lastUsed = this.now()
    // Attribute this request's delta against the counters it starts from. The snapshot
    // travels with the lease, so a concurrent request never borrows it.
    const lease: OpenAICodexResidencyLease = Object.freeze({ sessionId, before: Object.freeze(readCounters(sessionId)) })
    this.leases.set(lease, entry)
    return { continuation: true, lease }
  }

  /**
   * Consume an admission lease without releasing a different or replacement entry.
   * @param lease - opaque ownership returned by admit.
   * @returns the original entry, or undefined when the lease is no longer active.
   */
  private takeLease(lease: OpenAICodexResidencyLease): ResidencyEntry | undefined {
    const entry = this.leases.get(lease)
    this.leases.delete(lease)
    return entry !== undefined && this.entries.get(lease.sessionId) === entry ? entry : undefined
  }

  /**
   * Release a request that never produced a stream, so the slot does not leak.
   * @param lease - opaque ownership returned by admit for that request.
   */
  abort(lease: OpenAICodexResidencyLease): void {
    const entry = this.takeLease(lease)
    if (entry === undefined) return
    entry.inFlight -= 1
    entry.lastUsed = this.now()
    if (entry.closeWhenIdle && entry.inFlight === 0) this.closeEntry(entry.sessionId)
    if (this.closeAllPending && this.inFlight() === 0) this.closeAllNow()
  }

  /**
   * Apply one request's outcome and release its slot.
   * @param lease - opaque ownership returned by admit for that request.
   * @param failure - transport failure PI reported for it, when any.
   * @returns the facts observed for this request; a consumed or stale lease reports SSE with no continuation.
   */
  settle(
    lease: OpenAICodexResidencyLease,
    failure: OpenAICodexTransportFailure | undefined,
  ): OpenAICodexSettlement {
    const entry = this.takeLease(lease)
    if (entry === undefined) return { transport: 'sse' }
    const { sessionId, before } = lease
    try {
      const stats = getOpenAICodexWebSocketDebugStats(sessionId)
      // A failure after the stream started was carried by WebSocket; only a failure before
      // the first event means PI answered this request over SSE instead.
      const transport: OpenAICodexSettledTransport = failure === undefined
        ? (stats?.websocketFallbackActive === true ? 'sse' : 'ws')
        : (failure.eventsEmitted ? 'ws' : 'sse')
      // Counter windows are session-wide and advance on dispatch, so they only attribute
      // one request while that request is the session's only live lease.
      const isolated = entry.inFlight === 1
      let settlement: OpenAICodexSettlement = { transport }
      if (failure === undefined && transport === 'ws' && isolated) {
        const after = readCounters(sessionId)
        if (after.delta > before.delta) {
          settlement = { transport, continuation: 'delta', deltaItems: stats?.lastDeltaInputItems ?? 0 }
        } else if (after.full > before.full) {
          settlement = { transport, continuation: 'full' }
        }
      }
      if (failure !== undefined) {
        const reason = classifyFailure(failure)
        entry.reason = reason
        entry.attempts += 1
        entry.cooldownMs = Math.min(baseCooldownMs(reason) * 2 ** (entry.attempts - 1), MAX_COOLDOWN_MS)
        entry.retryAt = this.now() + entry.cooldownMs
        entry.retryArmed = false
        // The limit is account-wide, so free an idle slot before the next attempt.
        if (reason === 'connection-limit') this.evictIdle(sessionId)
      } else if (transport === 'ws') {
        entry.reason = undefined
        entry.attempts = 0
        entry.cooldownMs = 0
        entry.retryAt = 0
        entry.retryArmed = false
      }
      return settlement
    } finally {
      entry.inFlight -= 1
      entry.lastUsed = this.now()
      if (entry.closeWhenIdle && entry.inFlight === 0) this.closeEntry(sessionId)
      if (this.closeAllPending && this.inFlight() === 0) this.closeAllNow()
    }
  }

  /**
   * Close one session's resident connection and forget its retry state, deferring the close
   * while a request on that session is still in flight.
   * @param sessionId - business session that ended.
   */
  closeSession(sessionId: string | undefined): void {
    if (sessionId === undefined) return
    const entry = this.entries.get(sessionId)
    if (entry !== undefined && entry.inFlight > 0) {
      entry.closeWhenIdle = true
      return
    }
    this.closeEntry(sessionId)
  }

  /** Close every resident connection, deferring while a request still uses one. */
  requestCloseAll(): void {
    if (this.inFlight() === 0) {
      this.closeAllNow()
      return
    }
    this.closeAllPending = true
  }

  /** Close every resident connection and clear PI's per-session fallback flags. */
  closeAll(): void {
    this.closeAllNow()
  }

  /** @returns the sessions that currently hold a resident connection. */
  sessions(): readonly string[] {
    return [...this.entries.keys()]
  }

  /** Arm one WebSocket retry once the cooldown of a degraded session expires. */
  private rearmRetry(entry: ResidencyEntry): void {
    if (entry.reason === undefined || entry.retryArmed) return
    if (this.now() < entry.retryAt) return
    resetOpenAICodexWebSocketDebugStats(entry.sessionId)
    entry.retryArmed = true
    entry.retryAt = this.now() + entry.cooldownMs
  }

  /**
   * Close the least recently used idle session other than the one requesting a slot.
   * @param keep - session that must not be evicted.
   * @returns whether an idle session was closed.
   */
  private evictIdle(keep: string): boolean {
    let victim: ResidencyEntry | undefined
    for (const entry of this.entries.values()) {
      if (entry.sessionId === keep || entry.inFlight > 0) continue
      if (victim === undefined || entry.lastUsed < victim.lastUsed) victim = entry
    }
    if (victim === undefined) return false
    this.closeEntry(victim.sessionId)
    return true
  }

  /** Close one keyed connection and drop its bookkeeping. */
  private closeEntry(sessionId: string): void {
    if (!this.entries.delete(sessionId)) return
    closeOpenAICodexWebSocketSessions(sessionId)
    resetOpenAICodexWebSocketDebugStats(sessionId)
  }

  /** Close every keyed connection and drop all bookkeeping. */
  private closeAllNow(): void {
    this.closeAllPending = false
    this.entries.clear()
    closeOpenAICodexWebSocketSessions()
    resetOpenAICodexWebSocketDebugStats()
  }
}


