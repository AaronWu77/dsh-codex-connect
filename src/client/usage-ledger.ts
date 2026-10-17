/** Daily own-event usage from the host projection, including archived and child sessions. */
export interface DayTotals {
  tokens: number
  requests: number
  sessions: number
}

/** @param value - JSON-like input. @returns Its fields, or null for non-records. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** The root renderer supplies this session-list selector hook. */
export interface UsageSessionProps {
  useSessions?: <T>(selector: (snapshot: unknown) => T) => T
}

/** @param value - Counter from the wire. @returns Whether it is a nonnegative integer. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Merge the existing contextUsage daily counters without lifetime or inherited-prefix fallback.
 * @param snapshot - Root session catalog snapshot; duplicate ids and blank rows are excluded.
 * @returns Recorded daily totals and the producer calendar; unavailable data is never invented.
 */
export function usageLedgerOf(snapshot: unknown): { days: Record<string, DayTotals>; timeZone?: string } {
  const days: Record<string, DayTotals> = {}
  let timeZone: string | undefined
  const state = asRecord(snapshot)
  if (!state || !Array.isArray(state.ids)) return { days }
  const byId = asRecord(state.byId)
  const seen = new Set<string>()
  for (const id of state.ids) {
    if (typeof id !== 'string' || seen.has(id)) continue
    seen.add(id)
    try {
      const row = asRecord(byId?.[id])
      if (!row || row.blank === true) continue
      const usage = asRecord(asRecord(row.projectionValues)?.contextUsage)
      const entries = asRecord(usage?.days)
      if (!entries || typeof usage?.timeZone !== 'string') continue
      new Intl.DateTimeFormat('en-CA', { timeZone: usage.timeZone }).format(0)
      timeZone ??= usage.timeZone
      for (const [key, value] of Object.entries(entries)) {
        if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(key)) continue
        const entry = asRecord(value)
        if (!entry || !isCount(entry.tokens) || !isCount(entry.requests)) continue
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

/** @param timeZone - Producer calendar. @param now - Epoch milliseconds. @returns Today's ledger key. */
export function usageToday(timeZone?: string, now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(now)
}
