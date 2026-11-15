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

/** Per-request admission result. */
export interface OpenAICodexResidencyDecision {
  /** Whether this request may reuse the session's resident connection. */
  readonly continuation: boolean
  /** Session id to hand to pi-ai; present only for an admitted request. */
  readonly sessionId?: string
}

/** Transport actually used by one settled request. */
export type OpenAICodexSettledTransport = 'ws' | 'sse'

interface ResidencyEntry {
  readonly sessionId: string
  inFlight: number
  lastUsed: number
  reason?: OpenAICodexResidencyDegradeReason | undefined
  attempts: number
  cooldownMs: number
  retryAt: number
  retryArmed: boolean
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
    const limit = this.limit()
    if (sessionId === undefined || sessionId.length === 0 || !eligibleKind(kind) || limit === 0) {
      return { continuation: false }
    }
    let entry = this.entries.get(sessionId)
    if (entry === undefined) {
      // A new resident connection needs a free slot; evict the least recently used idle one.
      if (this.entries.size >= limit && !this.evictIdle(sessionId)) return { continuation: false }
      entry = { sessionId, inFlight: 0, lastUsed: this.now(), attempts: 0, cooldownMs: 0, retryAt: 0, retryArmed: false }
      this.entries.set(sessionId, entry)
    }
    this.rearmRetry(entry)
    entry.inFlight += 1
    entry.lastUsed = this.now()
    return { continuation: true, sessionId }
  }

  /**
   * Release a request that never produced a stream, so the slot does not leak.
   * @param sessionId - session admitted for that request.
   */
  abort(sessionId: string | undefined): void {
    if (sessionId === undefined) return
    const entry = this.entries.get(sessionId)
    if (entry === undefined) return
    entry.inFlight = Math.max(0, entry.inFlight - 1)
    entry.lastUsed = this.now()
    if (this.closeAllPending && this.inFlight() === 0) this.closeAllNow()
  }

  /**
   * Apply one request's outcome and release its slot.
   * @param sessionId - session admitted for that request.
   * @param failure - transport failure PI reported for it, when any.
   * @returns the transport the request actually used.
   */
  settle(
    sessionId: string | undefined,
    failure: OpenAICodexTransportFailure | undefined,
  ): OpenAICodexSettledTransport {
    if (sessionId === undefined) return 'sse'
    const stats = getOpenAICodexWebSocketDebugStats(sessionId)
    const transport: OpenAICodexSettledTransport = failure === undefined
      && stats?.websocketFallbackActive !== true ? 'ws' : 'sse'
    const entry = this.entries.get(sessionId)
    if (entry !== undefined) {
      if (failure !== undefined) {
        const reason = classifyFailure(failure)
        entry.reason = reason
        entry.attempts += 1
        entry.cooldownMs = Math.min(baseCooldownMs(reason) * 2 ** (entry.attempts - 1), MAX_COOLDOWN_MS)
        entry.retryAt = this.now() + entry.cooldownMs
        entry.retryArmed = false
        // The limit is account-wide, so free every idle slot before the next attempt.
        if (reason === 'connection-limit') this.evictIdle(sessionId)
      } else if (transport === 'ws') {
        entry.reason = undefined
        entry.attempts = 0
        entry.cooldownMs = 0
        entry.retryAt = 0
        entry.retryArmed = false
      }
      entry.inFlight = Math.max(0, entry.inFlight - 1)
      entry.lastUsed = this.now()
    }
    if (this.closeAllPending && this.inFlight() === 0) this.closeAllNow()
    return transport
  }

  /**
   * Close one session's resident connection and forget its retry state.
   * @param sessionId - business session that ended.
   */
  closeSession(sessionId: string | undefined): void {
    if (sessionId === undefined) return
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
