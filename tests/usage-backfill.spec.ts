import { describe, expect, it } from 'vitest'
import { SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { watchUsageBackfill } from '../src/host/usage-backfill.ts'
import type { UsageBackfillState } from '../src/host/usage-backfill.ts'

function header(id: string, cwd: string | undefined): SessionHeader {
  return {
    version: 4 as SessionHeader['version'],
    id: SessionId(id),
    createdAt: 1,
    isSeeded: false,
    ...(cwd === undefined ? {} : { cwd }),
  } as SessionHeader
}

/** A minimal host face: only the members the pass reads. */
function host(options: {
  listed?: readonly { header: SessionHeader }[]
  live?: readonly string[]
  cached?: readonly string[]
  events?: readonly SessionEvent[]
  openError?: string
}) {
  const coldSnapshots: string[] = []
  const warnings: string[] = []
  const ctx = {
    get(name: string): unknown {
      switch (name) {
        case 'sessionQuery':
          return { listSessions: async () => options.listed ?? [] }
        case 'sessionProjectionCache':
          return {
            cachedSnapshot: (meta: SessionHeader) =>
              (options.cached ?? []).includes(meta.id) ? { asOfSeq: 0, values: { codexConnectUsage: { timeZone: 'UTC', days: {} } } } : undefined,
            coldSnapshot: (meta: SessionHeader) => {
              coldSnapshots.push(meta.id)
              return { asOfSeq: 0, values: {} }
            },
          }
        case 'sessionPersistence':
          return {
            open: async (id: string) => {
              if (options.openError !== undefined) throw new Error(options.openError)
              return {
                header: header(id, '/work'),
                inheritedEventCount: SessionLogOffset(0),
                read: async () => ({ events: options.events ?? [] }),
                close: async () => {},
              }
            },
          }
        case 'sessions':
          return { get: (id: string) => (options.live ?? []).includes(id) ? {} : undefined }
        default:
          return undefined
      }
    },
    logger: { warn: (message: string) => { warnings.push(message) }, info: () => {} },
  }
  return { ctx, coldSnapshots, warnings }
}

/** Wait for the pass's timer-paced reads to drain. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index++) await new Promise(resolve => setTimeout(resolve, 5))
}

/** Collect every state the pass reports. */
function recorder() {
  const states: UsageBackfillState[] = []
  return { states, report: (state: UsageBackfillState) => { states.push(state) } }
}

describe('local usage warm-up pass', () => {
  it('does no work until it is triggered', async () => {
    const { ctx, coldSnapshots } = host({ listed: [{ header: header('session-a', '/work') }] })
    const { report } = recorder()
    watchUsageBackfill(ctx as never, { pollMs: 2000 }, report)
    await settle()
    expect(coldSnapshots).toEqual([])
  })

  it('backfills a cold stored Session and reports done', async () => {
    const { ctx, coldSnapshots } = host({ listed: [{ header: header('session-a', '/work') }], events: [] })
    const { states, report } = recorder()
    const pass = watchUsageBackfill(ctx as never, { pollMs: 2000, restMs: 0 }, report)
    pass.trigger()
    await settle()
    expect(coldSnapshots).toEqual(['session-a'])
    expect(states).toEqual(['running', 'done'])
  })

  it('skips live Sessions, Sessions without a cwd, and Sessions whose row is cached', async () => {
    const { ctx, coldSnapshots } = host({
      listed: [
        { header: header('session-live', '/work') },
        { header: header('session-nocwd', undefined) },
        { header: header('session-cached', '/work') },
        { header: header('session-cold', '/work') },
      ],
      live: ['session-live'],
      cached: ['session-cached'],
      events: [],
    })
    const pass = watchUsageBackfill(ctx as never, { pollMs: 2000, restMs: 0 })
    pass.trigger()
    await settle()
    expect(coldSnapshots).toEqual(['session-cold'])
  })

  it('reports partial and keeps going when one stored read fails', async () => {
    const { ctx, warnings } = host({ listed: [{ header: header('session-a', '/work') }], openError: 'boom' })
    const { states, report } = recorder()
    const pass = watchUsageBackfill(ctx as never, { pollMs: 2000, restMs: 0 }, report)
    pass.trigger()
    await settle()
    expect(states).toEqual(['running', 'partial'])
    expect(warnings.some(line => line.includes('session-a'))).toBe(true)
  })

  it('runs once per process', async () => {
    const { ctx, coldSnapshots } = host({ listed: [{ header: header('session-a', '/work') }], events: [] })
    const pass = watchUsageBackfill(ctx as never, { pollMs: 2000, restMs: 0 })
    pass.trigger()
    await settle()
    pass.trigger()
    await settle()
    expect(coldSnapshots).toEqual(['session-a'])
  })

  it('does nothing when the cold-path services are absent', async () => {
    const ctx = { get: () => undefined, logger: { warn: () => {}, info: () => {} } }
    const { states, report } = recorder()
    const pass = watchUsageBackfill(ctx as never, { pollMs: 2000 }, report)
    pass.trigger()
    await settle()
    expect(states).toEqual(['running', 'done'])
  })

  it('stops a running pass and reports partial', async () => {
    const { ctx } = host({ listed: [{ header: header('session-a', '/work') }], events: [] })
    const { states, report } = recorder()
    const pass = watchUsageBackfill(ctx as never, { pollMs: 2000, restMs: 50 }, report)
    pass.trigger()
    await pass.stop()
    expect(states.at(-1)).toBe('partial')
  })
})
