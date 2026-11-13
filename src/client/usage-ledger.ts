/** Daily own-event usage from the `codexConnectUsage` projection the Session list carries. */

/** Daily own-usage counters for one calendar day, summed across Sessions. */
export interface DayTotals {
  tokens: number
  requests: number
  /** Sessions that recorded activity on this day. */
  sessions: number
}

/** The projection key this plugin registers; it never reads another plugin's values. */
const USAGE_KEY = 'codexConnectUsage'

/** A merged daily ledger and the calendar its days were bucketed in. */
export interface LocalUsageData {
  /** Calendar the Host bucketed the days in; absent until a row carries one. */
  timeZone?: string
  days: Record<string, DayTotals>
}

/** Display state of the local usage source. */
export interface LocalUsageSnapshot {
  state: 'loading' | 'ready' | 'unavailable' | 'failed'
  data: LocalUsageData | null
  /** A request failure that needs an explicit retry even when known figures remain. */
  failure?: 'request'
}

/** Shared observable used by the capsule, dialog, and management overview. */
export interface LocalUsageSource {
  subscribe(listener: () => void): () => void
  snapshot(): LocalUsageSnapshot
  retry(): void
}

/** The root renderer supplies this session-list selector hook. */
export interface UsageSessionProps {
  useSessions?: <T>(selector: (snapshot: unknown) => T) => T
}

/** Stable fallback for hosts that have not supplied the local usage capability. */
export const unavailableUsage: LocalUsageSnapshot = Object.freeze({ state: 'unavailable', data: null })
/** @returns A no-op disposer for an absent local usage capability. */
export const subscribeUnavailableUsage = (): (() => void) => () => {}
/** @returns The stable unavailable snapshot. */
export const unavailableUsageSnapshot = (): LocalUsageSnapshot => unavailableUsage

/** @param value - JSON-like input. @returns Its fields, or null for non-records. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** @param value - Counter from the projection. @returns Whether it is a nonnegative safe integer. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Merge the per-Session `codexConnectUsage` values without lifetime or inherited-prefix fallback.
 * A row this reader cannot represent is skipped; it never fails the remaining catalog.
 * @param snapshot - Root Session-list snapshot; duplicate ids and blank rows are excluded.
 * @returns Recorded daily totals and the producer calendar; unavailable data is never invented.
 */
export function usageLedgerOf(snapshot: unknown): LocalUsageData {
  const days: Record<string, DayTotals> = {}
  let timeZone: string | undefined
  const state = asRecord(snapshot)
  if (state === null || !Array.isArray(state.ids)) return { days }
  const byId = asRecord(state.byId)
  const seen = new Set<string>()
  for (const id of state.ids) {
    if (typeof id !== 'string' || seen.has(id)) continue
    seen.add(id)
    try {
      const row = asRecord(byId?.[id])
      if (row === null || row.blank === true) continue
      const usage = asRecord(asRecord(row.projectionValues)?.[USAGE_KEY])
      const entries = asRecord(usage?.days)
      if (entries === null || typeof usage?.timeZone !== 'string') continue
      new Intl.DateTimeFormat('en-CA', { timeZone: usage.timeZone }).format(0)
      timeZone ??= usage.timeZone
      for (const [key, value] of Object.entries(entries)) {
        if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(key)) continue
        const entry = asRecord(value)
        if (entry === null || !isCount(entry.tokens) || !isCount(entry.requests)) continue
        if (entry.tokens === 0 && entry.requests === 0) continue
        const before = days[key]
        days[key] = {
          tokens: (before?.tokens ?? 0) + entry.tokens,
          requests: (before?.requests ?? 0) + entry.requests,
          sessions: (before?.sessions ?? 0) + 1,
        }
      }
    } catch (_error) {
      // One malformed foreign row must not interrupt the remaining catalog.
      continue
    }
  }
  return { days, ...(timeZone === undefined ? {} : { timeZone }) }
}

/**
 * Read one recorded day from the merged ledger.
 * @param data - Merged ledger, or null while unavailable.
 * @param day - Calendar date key in the producer's time zone.
 * @returns The recorded totals, or undefined when the ledger carries no such day.
 */
export function usageDay(data: LocalUsageData | null, day: string): DayTotals | undefined {
  return data === null || !Object.hasOwn(data.days, day) ? undefined : data.days[day]
}

/** @param timeZone - Producer calendar. @param now - Epoch milliseconds. @returns Today's ledger key. */
export function usageToday(timeZone?: string, now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(now)
}
