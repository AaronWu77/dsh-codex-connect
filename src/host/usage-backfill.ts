/** Owner-scoped warm-up that gives every stored Session its `codexConnectUsage` projection row.
 *
 * The Session list serves durable cache rows only, so a Session folded before this
 * unit existed — or whose row went version-stale — carries no `codexConnectUsage`
 * value until it next goes live. This pass closes that gap the way a projection
 * warm-up must: read each stored log once through the projection cache's cold-read
 * ladder, seed the unit from its cached row, fold the remainder, and write the
 * refreshed checkpoint back. No aggregate is computed here — the client rebuilds
 * the daily ledger from the per-Session projection values the Session list already
 * carries, exactly like the Context plugin's own usage panel.
 *
 * The pass is on-demand: the client POSTs the trigger route, so a boot never
 * cold-reads the whole corpus for a panel that may never open. It runs once per
 * process, and live Sessions are skipped because they fold for themselves.
 * OPTIONAL BY CONTRACT: every face is re-proved before use, so a deployment
 * without the connection route or the cold-path services simply never arms it.
 */

import { interruptedTurnClosers } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import type { Context } from '@deepseek-ai/cordis'

/** The plugin's warm-up trigger route, under the authenticated `/api` fence. */
export const USAGE_BACKFILL_PATH = '/api/dsh-codex-connect/local-usage/backfill'

/** Data-only pass status; a POST never starts a pass. */
export const USAGE_BACKFILL_STATUS_PATH = USAGE_BACKFILL_PATH + '/status'

/** The projection key this pass materializes. */
const USAGE_KEY = 'codexConnectUsage'

/** A settled pass never restarts from an ordinary trigger. */
export type UsageBackfillState = 'idle' | 'running' | 'done' | 'partial' | 'failed'

/** Deployment settings for the warm-up: pacing and the client polling cadence. */
export interface UsageBackfillOptions {
  pollMs: number
  /** Pause between two stored-log reads, in milliseconds. */
  restMs?: number
}

/** The corpus listing face, as consumed. */
interface SessionQueryLike {
  listSessions(signal?: AbortSignal): Promise<unknown>
}

/** One `sessions.get` face, as consumed. */
interface SessionStoreLike {
  get(id: string): unknown
}

/** The cache's cold-path verbs, as consumed and re-proved at runtime. */
interface ProjectionCacheLike {
  cachedSnapshot(meta: SessionHeader, keys?: readonly string[]): unknown
  coldSnapshot(header: SessionHeader, inheritedEventCount: unknown, events: readonly SessionEvent[]): unknown
}

/** One stored-log read handle, as consumed. */
interface ReadHandleLike {
  header: SessionHeader
  inheritedEventCount: unknown
  read(offset: number, limit?: undefined, options?: { signal?: AbortSignal }): Promise<{ events: readonly SessionEvent[] }>
  close(): Promise<void>
}

/** The persistence face, as consumed. */
interface PersistenceLike {
  open(id: string, access: 'read', options?: { signal?: AbortSignal }): Promise<ReadHandleLike>
}

/** One exact Fetch-route registrar, as consumed. */
interface FetchRegistrarLike {
  register(route: {
    path: string
    methods: readonly string[]
    requestBody: 'buffered'
    fetch: (request: Request) => Response | Promise<Response>
  }): () => void | Promise<void>
}

/** Default pause between two stored-log reads. */
const DEFAULT_REST_MS = 25

/**
 * Unwrap one untrusted record.
 * @param value - Unknown input.
 * @returns Its fields, or null for non-records.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/**
 * Read one stored header off a listing row.
 * @param record - One `listSessions` row.
 * @returns The header, or null when the row is malformed.
 */
function headerOf(record: unknown): SessionHeader | null {
  const header = asRecord(asRecord(record)?.header)
  if (header === null || typeof header.id !== 'string' || header.id === '') return null
  return header as unknown as SessionHeader
}

/**
 * Whether the cached rows already carry this unit.
 * @param cache - The projection cache face.
 * @param header - The listed Session header.
 * @returns True when a usable `codexConnectUsage` row exists.
 */
function servesRow(cache: ProjectionCacheLike, header: SessionHeader): boolean {
  try {
    const block = asRecord(cache.cachedSnapshot(header, [USAGE_KEY]))
    return asRecord(block?.values)?.[USAGE_KEY] !== undefined
  } catch (_error) {
    // A rejecting cache face is a cache miss; the fold below is still safe.
    return false
  }
}

/**
 * Whether one Session is live and therefore folds for itself.
 * @param sessions - The live Session store, or undefined when absent.
 * @param id - Session id.
 * @returns True when the Session is currently attached.
 */
function isLive(sessions: SessionStoreLike | undefined, id: string): boolean {
  if (sessions === undefined) return false
  try {
    return sessions.get(id) !== undefined
  } catch (_error) {
    // A throwing store read is treated as live: never write over a live Session.
    return true
  }
}

/**
 * Read one stored log through a read handle.
 * @param persistence - The persistence face.
 * @param id - Session id.
 * @param signal - Cancellation.
 * @returns The authoritative header, the exact inherited cut, and the balanced log.
 */
async function readColdLog(
  persistence: PersistenceLike,
  id: string,
  signal: AbortSignal,
): Promise<{ header: SessionHeader; inheritedEventCount: unknown; events: SessionEvent[] }> {
  const handle = await persistence.open(id, 'read', { signal })
  let events: readonly SessionEvent[]
  try {
    const raw: unknown = await handle.read(0, undefined, { signal })
    const result = asRecord(raw)?.events
    events = Array.isArray(result) ? result as SessionEvent[] : []
  } catch (error: unknown) {
    try {
      await handle.close()
    } catch (_closeError) {
      // The read failure is the actionable cause; a close failure adds nothing.
    }
    throw error
  }
  await handle.close()
  return {
    header: handle.header,
    inheritedEventCount: handle.inheritedEventCount,
    events: [...events, ...interruptedTurnClosers(events)],
  }
}

/** @param error - a possibly hostile thrown value. @returns a printable form. */
function messageOf(error: unknown): string {
  try {
    return String(error)
  } catch (_error) {
    return 'unprintable error'
  }
}

/**
 * Wake a pacing sleep early when the owner aborts, so disposal never waits it out.
 * @param ms - Delay in milliseconds.
 * @param signal - Owner cancellation.
 * @returns Resolution on the delay or the abort.
 */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const finish = (): void => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

/**
 * Run the one-pass warm-up on demand. The owner routes call the returned
 * trigger; the pass reports every lifecycle change through `report`.
 * @param ctx - Plugin context whose fiber owns the pass.
 * @param options - Client polling cadence and the per-Session pause.
 * @param report - Called with each lifecycle state the pass enters.
 * @returns The pass trigger and an awaitable disposer.
 */
export function watchUsageBackfill(
  ctx: Context,
  options: UsageBackfillOptions,
  report: (state: UsageBackfillState) => void = () => {},
): { trigger: () => void; stop: () => Promise<void> } {
  const restMs = options.restMs ?? DEFAULT_REST_MS
  let incomplete = false
  let started = false
  let work: Promise<void> | undefined
  const abort = new AbortController()
  const settle = (state: UsageBackfillState): void => { report(state) }

  const run = async (): Promise<void> => {
    const query = ctx.get('sessionQuery') as unknown as SessionQueryLike | undefined
    const cache = ctx.get('sessionProjectionCache') as unknown as ProjectionCacheLike | undefined
    const persistence = ctx.get('sessionPersistence') as unknown as PersistenceLike | undefined
    const sessions = ctx.get('sessions') as unknown as SessionStoreLike | undefined
    if (query === undefined || typeof query.listSessions !== 'function') return
    if (cache === undefined || typeof cache.cachedSnapshot !== 'function' || typeof cache.coldSnapshot !== 'function') return
    if (persistence === undefined || typeof persistence.open !== 'function') return
    const listed = await query.listSessions(abort.signal)
    if (!Array.isArray(listed)) throw new Error('dsh-codex-connect: session listing is not an array')
    let folded = 0
    for (const record of listed) {
      if (abort.signal.aborted) return
      const header = headerOf(record)
      // Only project-visible Sessions are inside the list's own scope.
      if (header === null || typeof header.cwd !== 'string') continue
      if (isLive(sessions, header.id)) continue
      if (servesRow(cache, header)) continue
      try {
        const log = await readColdLog(persistence, header.id, abort.signal)
        // The handle's header is authoritative; the listed one was only a probe.
        cache.coldSnapshot(log.header, log.inheritedEventCount, log.events)
        folded++
      } catch (error: unknown) {
        incomplete = true
        ctx.logger.warn(`dsh-codex-connect: local usage warm-up skipped "${header.id}" (${messageOf(error)})`)
      }
      await pause(restMs, abort.signal)
    }
    if (folded > 0) ctx.logger.info(`dsh-codex-connect: local usage rows backfilled for ${folded} session(s)`)
  }

  const trigger = (): void => {
    if (started || abort.signal.aborted) return
    started = true
    settle('running')
    work = run().then(() => {
      settle(incomplete || abort.signal.aborted ? 'partial' : 'done')
    }).catch((error: unknown) => {
      settle(abort.signal.aborted ? 'partial' : 'failed')
      if (!abort.signal.aborted) ctx.logger.warn(`dsh-codex-connect: local usage warm-up stopped early (${messageOf(error)})`)
    })
  }

  return {
    trigger,
    stop: async () => {
      abort.abort()
      await work
      settle('partial')
    },
  }
}
