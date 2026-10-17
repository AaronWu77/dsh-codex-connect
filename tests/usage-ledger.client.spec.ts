import { describe, expect, it } from 'vitest'
import { usageLedgerOf, usageToday } from '../src/client/usage-ledger.ts'

const day = '2026-10-16'
function row(tokens: number, requests = 1) {
  return { projectionValues: { contextUsage: { timeZone: 'Asia/Shanghai', days: { [day]: { tokens, requests, humanInputs: 0 } } } } }
}

describe('usage widget daily accounting', () => {
  it('preserves own-event totals including child and archived rows without duplicate catalog ids', () => {
    const snapshot = { ids: ['main', 'child', 'archive', 'fork', 'blank', 'main'], byId: {
      main: row(1200), child: { ...row(300), origin: 'subagent' }, archive: { ...row(400), archived: true },
      fork: row(100), blank: { ...row(9999), blank: true },
    } }
    expect(usageLedgerOf(snapshot)).toEqual({ timeZone: 'Asia/Shanghai', days: { [day]: { tokens: 2000, requests: 4, sessions: 4 } } })
  })
  it('never substitutes lifetime, activity or quota counters when own usage is absent', () => {
    expect(usageLedgerOf({ ids: ['missing'], byId: { missing: { projectionValues: { contextActivity: { days: { [day]: { tokens: 9000 } } }, tokenUsage: { total: 9000 } } } } })).toEqual({ days: {} })
  })
  it('skips malformed rows, zero days and invalid counters without losing valid entries', () => {
    const broken = Object.defineProperty({}, 'projectionValues', { get() { throw new Error('broken row') } })
    expect(usageLedgerOf({ ids: [null, 'broken', 'good', 'zero', 'bad'], byId: {
      broken, good: row(20), zero: row(0, 0), bad: row(-1),
    } }).days).toEqual({ [day]: { tokens: 20, requests: 1, sessions: 1 } })
    expect(usageLedgerOf(null)).toEqual({ days: {} })
    expect(usageLedgerOf({ ids: ['bad'], byId: { bad: { projectionValues: { contextUsage: { timeZone: 'not/a-zone', days: {} } } } } })).toEqual({ days: {} })
  })
  it('uses the producer calendar on opposite sides of midnight', () => {
    const instant = Date.parse('2026-10-15T16:00:00Z')
    expect(usageToday('Asia/Shanghai', instant)).toBe(day)
    expect(usageToday('America/Los_Angeles', instant)).toBe('2026-10-15')
  })
})
