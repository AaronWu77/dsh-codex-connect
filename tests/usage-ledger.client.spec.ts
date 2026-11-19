import { describe, expect, it } from 'vitest'
import { asRecord, usageDay, usageLedgerOf, usageToday } from '../src/client/usage-ledger.ts'

const today = '2026-10-16'
const yesterday = '2026-10-15'

/** One Session-list row carrying the plugin's own usage projection value. */
function row(usage: unknown, options: { blank?: boolean; id?: string } = {}): Record<string, unknown> {
  return {
    id: options.id ?? 'row',
    ...(options.blank === true ? { blank: true } : {}),
    projectionValues: { codexConnectUsage: usage },
  }
}

/** The Host's `codexConnectUsage` projection value. */
function value(days: Record<string, { tokens: number; requests: number }>, timeZone = 'Asia/Shanghai'): unknown {
  return { timeZone, days }
}

/** One root Session-list snapshot around the given rows, keyed by id. */
function snapshot(rows: Record<string, Record<string, unknown>>, ids = Object.keys(rows)): unknown {
  return { ids, byId: rows }
}

describe('codexConnectUsage ledger', () => {
  it('merges every Session row into one daily ledger', () => {
    const ledger = usageLedgerOf(snapshot({
      a: row(value({ [today]: { tokens: 100, requests: 2 } })),
      b: row(value({ [today]: { tokens: 50, requests: 1 }, [yesterday]: { tokens: 7, requests: 1 } })),
    }))
    expect(ledger).toEqual({
      timeZone: 'Asia/Shanghai',
      days: {
        [today]: { tokens: 150, requests: 3, sessions: 2 },
        [yesterday]: { tokens: 7, requests: 1, sessions: 1 },
      },
    })
  })

  it('counts each contributing Session once per day', () => {
    const ledger = usageLedgerOf(snapshot({
      a: row(value({ [today]: { tokens: 0, requests: 4 } })),
      b: row(value({ [today]: { tokens: 10, requests: 0 } })),
    }))
    expect(ledger.days[today]).toEqual({ tokens: 10, requests: 4, sessions: 2 })
  })

  it('skips duplicate ids and blank rows', () => {
    const ledger = usageLedgerOf({
      ids: ['a', 'a', 'blank'],
      byId: {
        a: row(value({ [today]: { tokens: 100, requests: 1 } })),
        blank: row(value({ [today]: { tokens: 999, requests: 9 } }), { blank: true }),
      },
    })
    expect(ledger.days).toEqual({ [today]: { tokens: 100, requests: 1, sessions: 1 } })
  })

  it('drops days with neither tokens nor requests', () => {
    const ledger = usageLedgerOf(snapshot({
      a: row(value({ [today]: { tokens: 0, requests: 0 }, [yesterday]: { tokens: 0, requests: 3 } })),
    }))
    expect(ledger.days).toEqual({ [yesterday]: { tokens: 0, requests: 3, sessions: 1 } })
  })

  it('skips one malformed row without losing the remaining catalog', () => {
    const throwing = { get projectionValues(): never { throw new Error('hostile row') } }
    const ledger = usageLedgerOf({
      ids: ['throwing', 'noUsage', 'noDays', 'badTimeZone', 'badKey', 'badCount', 'good'],
      byId: {
        throwing,
        noUsage: { projectionValues: {} },
        noDays: { projectionValues: { codexConnectUsage: { timeZone: 'UTC' } } },
        badTimeZone: row(value({ [today]: { tokens: 5, requests: 1 } }, 'no/such-zone')),
        badKey: row(value({ '16-10-2026': { tokens: 5, requests: 1 } })),
        badCount: row(value({ [today]: { tokens: -1, requests: 1 } })),
        good: row(value({ [today]: { tokens: 9, requests: 2 } })),
      },
    })
    expect(ledger).toEqual({ timeZone: 'Asia/Shanghai', days: { [today]: { tokens: 9, requests: 2, sessions: 1 } } })
  })

  it('rejects fractional and non-numeric counters per entry', () => {
    // Deliberately malformed projection entries: only the last one is a usable count pair.
    const days: Record<string, unknown> = {
      [today]: { tokens: 1.5, requests: 1 },
      [yesterday]: { tokens: '3', requests: 1 },
      '2026-10-14': { tokens: 3, requests: 1 },
      '2026-10-13': null,
    }
    const ledger = usageLedgerOf(snapshot({ a: row({ timeZone: 'Asia/Shanghai', days }) }))
    expect(ledger.days).toEqual({ '2026-10-14': { tokens: 3, requests: 1, sessions: 1 } })
    expect(ledger.timeZone).toBe('Asia/Shanghai')
  })

  it('keeps the first reported calendar and skips rows without one', () => {
    const ledger = usageLedgerOf(snapshot({
      a: { projectionValues: { codexConnectUsage: { days: { [today]: { tokens: 1, requests: 1 } } } } },
      b: row(value({ [today]: { tokens: 2, requests: 1 } }, 'America/Los_Angeles')),
      c: row(value({ [today]: { tokens: 4, requests: 1 } }, 'UTC')),
    }))
    expect(ledger.timeZone).toBe('America/Los_Angeles')
    expect(ledger.days[today]).toEqual({ tokens: 6, requests: 2, sessions: 2 })
  })

  it('returns an empty ledger for unavailable or foreign snapshots', () => {
    expect(usageLedgerOf(undefined)).toEqual({ days: {} })
    expect(usageLedgerOf(null)).toEqual({ days: {} })
    expect(usageLedgerOf({})).toEqual({ days: {} })
    expect(usageLedgerOf({ ids: 'nope', byId: {} })).toEqual({ days: {} })
    expect(usageLedgerOf({ ids: ['a'] })).toEqual({ days: {} })
    expect(usageLedgerOf({ ids: [1, null], byId: {} })).toEqual({ days: {} })
  })

  it('never reads another plugin projection key', () => {
    const ledger = usageLedgerOf(snapshot({
      a: { projectionValues: { contextUsage: value({ [today]: { tokens: 99, requests: 9 } }) } },
    }))
    expect(ledger.days).toEqual({})
  })

  it('reads fields off records only', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 })
    expect(asRecord(null)).toBeNull()
    expect(asRecord([])).toBeNull()
    expect(asRecord('x')).toBeNull()
  })

  it('reads one recorded day without inventing one', () => {
    const ledger = usageLedgerOf(snapshot({ a: row(value({ [today]: { tokens: 4, requests: 1 } })) }))
    expect(usageDay(ledger, today)).toEqual({ tokens: 4, requests: 1, sessions: 1 })
    expect(usageDay(ledger, yesterday)).toBeUndefined()
    expect(usageDay(null, today)).toBeUndefined()
    expect(usageDay({ days: {} }, today)).toBeUndefined()
  })

  it('uses the producer calendar on opposite sides of midnight', () => {
    const instant = Date.parse('2026-10-15T16:00:00Z')
    expect(usageToday('Asia/Shanghai', instant)).toBe(today)
    expect(usageToday('America/Los_Angeles', instant)).toBe(yesterday)
    expect(usageToday(undefined, instant)).toBe(new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(instant))
  })
})
