import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { SessionId } from '@deepseek-ai/dsh-session'
import { watchLocalUsage } from '../src/host/usage-watch.ts'

/** Wait for one deferred fiber to settle. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index++) await new Promise(resolve => setTimeout(resolve, 5))
}

describe('local usage wiring', () => {
  it('registers the codexConnectUsage unit on the projection registry', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
    const stop = watchLocalUsage(ctx, { timeZone: 'UTC', retainedDays: 30, pollMs: 2000 })
    await settle()
    const keys = [...ctx.sessionProjections.summaryKeys()]
    // The unit must stay in the summary set: the Session list is the only usage source.
    expect(keys).toContain('codexConnectUsage')
    await stop()
    await ctx.fiber.dispose()
  })

  it('releases the registration with its owner', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
    const stop = watchLocalUsage(ctx, { timeZone: 'UTC', retainedDays: 30, pollMs: 2000 })
    await settle()
    expect([...ctx.sessionProjections.summaryKeys()]).toContain('codexConnectUsage')
    await stop()
    expect([...ctx.sessionProjections.summaryKeys()]).not.toContain('codexConnectUsage')
    await ctx.fiber.dispose()
  })

  it('releases a deferred warm-up fiber and its routes on owner disposal', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
    const routes = new Map<string, unknown>()
    ctx.provide('connection', {
      fetch: {
        register: (route: { path: string }) => { routes.set(route.path, route); return () => { routes.delete(route.path) } },
      },
    })
    ctx.provide('sessionQuery', { listSessions: async () => [] })
    ctx.provide('sessionProjectionCache', {
      cachedSnapshot: () => undefined,
      coldSnapshot: () => ({ asOfSeq: 0, values: {} }),
    })
    ctx.provide('sessionPersistence', { open: async () => { throw new Error('unused') } })
    ctx.provide('sessions', { get: () => undefined, list: () => [] })
    const stop = watchLocalUsage(ctx, { timeZone: 'UTC', retainedDays: 30, pollMs: 2000, restMs: 0 })
    await settle()
    // The deferred injection resolved and registered both routes.
    expect(routes.has('/api/dsh-codex-connect/local-usage/backfill')).toBe(true)
    expect(routes.has('/api/dsh-codex-connect/local-usage/backfill/status')).toBe(true)
    await stop()
    expect(routes.size).toBe(0)
    await ctx.fiber.dispose()
  })

  it('folds own-session tokens into the value the Session list carries', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
    const stop = watchLocalUsage(ctx, { timeZone: 'UTC', retainedDays: 30, pollMs: 2000 })
    await settle()
    const { Session } = await import('@deepseek-ai/dsh-session')
    const { createMessage } = await import('@deepseek-ai/dsh-llm')
    const session = Session.create(SessionId('wire-usage'))
    // A synthetic append is enough: any committed event advances the unit's cell.
    session.append('turn/start', { turn: 1 })
    session.append('assistant/message', {
      turn: 1, step: 0, stream: [],
      message: createMessage({ role: 'assistant', content: [], source: { kind: 'model', provider: 'p', model: 'm' } }),
      usage: { inputTokens: 10, outputTokens: 5 },
    }, { surfaceOp: 'append' })
    const values = ctx.sessionProjections.snapshot(session).values
    expect(values.codexConnectUsage).toMatchObject({ timeZone: 'UTC' })
    const days = (values.codexConnectUsage as { days: Record<string, { tokens: number; requests: number }> }).days
    expect(Object.values(days).reduce((sum, day) => sum + day.tokens, 0)).toBe(15)
    expect(Object.values(days).reduce((sum, day) => sum + day.requests, 0)).toBe(1)
    await stop()
    await ctx.fiber.dispose()
  })
})