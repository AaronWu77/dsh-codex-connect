import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SESSION_FORMAT_VERSION, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import { createCodexConnectUsageDefinition } from '../src/host/usage-projection'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap { 'usage-test/other': number }
  interface SessionProjectionStateMap { 'usage-test/other': number }
}

const otherProjection = {
  key: 'usage-test/other', stateVersion: 1, stateSchema: z.number(), init: () => 0,
  apply: (state, item) => item.type === 'assistant/message' ? state + 1 : state,
  wire: { viewSchema: z.number(), view: state => state },
} satisfies ProjectionDefinition<'usage-test/other', number>

async function disposeRegistration(registration: unknown): Promise<void> {
  if (typeof registration === 'function') await registration()
  else if (typeof registration === 'object' && registration !== null && 'dispose' in registration && typeof registration.dispose === 'function') await registration.dispose()
  else throw new Error('unsupported projection registration')
}

const make = (timeZone = 'Asia/Shanghai', retainedDays = 400) => createCodexConnectUsageDefinition({ timeZone, retainedDays })
const event = (seq: number, time: number, usage?: unknown, type = 'assistant/message') => ({ type, seq, time, data: { usage, turn: 1, step: 1, stream: [], message: { id: 'm', role: 'assistant', content: [], source: { kind: 'model', provider: 'test', model: 'model' } } } }) as never
const at = (date: string) => Date.parse(date)

describe('own session usage projection', () => {
  it('matches tokens and requests from the preserved Context parity fixture', () => {
    // Token/request subset of Context's synthetic usage-parity fixture and preserved 0.54.1 output.
    const events = [
      event(0, 1785542400000, { inputTokens: 9000000 }),
      event(1, 1790964000000, undefined, 'request/header'),
      event(3, 1790964000000, { inputTokens: 800, cacheReadTokens: 100, cacheWriteTokens: 25, outputTokens: 100 }),
      event(10, 1791046800000, { inputTokens: 7, outputTokens: 3 }),
      event(11, 1791046860000),
    ]
    const definition = make()
    let state = definition.init(undefined as never, 1 as never)
    for (const item of events) state = definition.apply(state, item)
    expect(definition.wire.view(state)).toEqual({
      timeZone: 'Asia/Shanghai',
      days: { '2026-10-03': { tokens: 1025, requests: 1 }, '2026-10-04': { tokens: 10, requests: 2 } },
    })
    expect(definition.stateSchema.safeParse(state).success).toBe(true)
    expect(definition.wire.viewSchema.safeParse(state.view).success).toBe(true)
    expect(Number.isSafeInteger(definition.stateVersion)).toBe(true)
    expect(definition.stateVersion).toBeGreaterThan(3)
    expect(state.incompleteUsage).toBe(true)
  })

  it('restores hashed pending calls, matches results once, and excludes inherited calls', () => {
    const def = make('UTC', 30)
    const day = (n: number) => Date.UTC(2026, 0, n, 12)
    const call = (seq: number, when: number, callId: string, name = 'synthetic-tool') =>
      ({ type: 'tool/call', seq, time: when, data: { callId, name, arguments: 'synthetic-secret-args' } }) as never
    const result = (seq: number, when: number, callId: string) =>
      ({ type: 'tool/result', seq, time: when, data: { message: { source: { callId }, content: [{ type: 'text', text: 'synthetic-secret-result' }] } } }) as never
    const first = '\ud800'; const second = '\ud801'
    const initial = def.init(undefined as never, 0 as never)
    const one = def.apply(initial, call(0, day(1), first))
    expect(one.view).toBe(initial.view)
    const two = def.apply(one, call(1, day(1), second, 'ask_user_question'))
    expect(Object.values(two.pendingTools).flatMap(bucket => Object.values(bucket))).toHaveLength(2)
    const encoded = JSON.stringify(two)
    expect(encoded).not.toContain('synthetic-secret')
    expect(encoded).not.toContain('synthetic-tool')
    expect(encoded).not.toContain('ask_user_question')
    expect(encoded).not.toContain('\\ud800')
    expect(encoded).not.toContain('\\ud801')
    const recovered = def.stateSchema.parse(JSON.parse(encoded))
    const own = def.apply(recovered, result(2, day(2), first))
    expect(own.view.days).toEqual({ '2026-01-02': { tokens: 0, requests: 0 } })
    expect(Object.values(own.pendingTools).flatMap(bucket => Object.values(bucket))).toHaveLength(1)
    const duplicate = def.apply(own, result(3, day(3), first))
    expect(duplicate.view).toBe(own.view)
    const settled = def.apply(duplicate, result(4, day(4), second))
    expect(settled.view.days).toEqual({ '2026-01-02': { tokens: 0, requests: 0 }, '2026-01-04': { tokens: 0, requests: 0 } })
    expect(settled.pendingTools).toEqual({})
    expect(settled).toMatchObject({ totalTokens: 0, totalRequests: 0, fault: false })
    const inherited = def.init(undefined as never, 1 as never)
    const forked = def.apply(def.apply(inherited, call(0, day(1), first)), result(1, day(2), first))
    expect(forked.view.days).toEqual({})
    expect(forked.pendingTools).toEqual({})
    expect(def.stateSchema.safeParse({ ...recovered, semanticsVersion: 5 }).success).toBe(false)
    expect(def.stateSchema.safeParse({ ...recovered, pendingTools: { invalid: {} } }).success).toBe(false)
  })

  it('does not rescan retained days when an unrelated event changes nothing', () => {
    const def = make('UTC', 400)
    let state = def.init(undefined as never, 0 as never)
    for (let i = 0; i < 50; i++) state = def.apply(state, event(i, Date.UTC(2026, 0, i + 1), { inputTokens: 1, outputTokens: 0 }))
    expect(def.stateSchema.safeParse({ ...state, retentionUncertain: true }).success).toBe(false)
    const includes = vi.spyOn(state.possibleDays, 'includes')
    try {
      const next = def.apply(state, event(50, Date.UTC(2026, 0, 50), undefined, 'request/header'))
      expect(next).toBe(state)
      expect(includes).toHaveBeenCalledTimes(1)
    } finally { includes.mockRestore() }
  })

  it('recognizes answered legacy question results without inventing tokens', () => {
    const def = make('UTC')
    const initial = def.init(undefined as never, 0 as never)
    const call = { type: 'tool/call', seq: 0, time: at('2026-01-01T00:00:00Z'),
      data: { callId: 'legacy-question', name: 'ask_user_question', arguments: 'private' } } as never
    const result = (seq: number, data: object) => ({ type: 'tool/result', seq, time: at('2026-01-02T00:00:00Z'), data }) as never
    const pending = def.apply(initial, call)
    const content = [{ type: 'text', text: JSON.stringify({ answers: [{ id: 'q', selected: ['yes'] }] }) }]
    const answered = def.apply(pending, result(1, { callId: 'legacy-question', message: { content } }))
    expect(answered.view.days).toEqual({ '2026-01-02': { tokens: 0, requests: 0 } })
    expect(answered).toMatchObject({ totalTokens: 0, totalRequests: 0, fault: false })
    for (const data of [
      { callId: 'legacy-question', message: { isError: true, content } },
      { callId: 'legacy-question', error: true, message: { content } },
      { callId: 'legacy-question', message: { content: [{ type: 'text', text: JSON.stringify({ pending: true, answers: [{ id: 'q', selected: [] }] }) }] } },
    ]) expect(def.apply(pending, result(1, data)).view.days).toEqual({})
  })

  it('restores a checkpoint taken between a native call and its result', async () => {
    const def = make('UTC', 30)
    const ctx = new Context()
    const header: SessionHeader = { id: SessionId('synthetic-pending-tool-checkpoint'), version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false }
    const cut = SessionLogOffset(0)
    const id = 'synthetic-private-call'
    const events = [
      { type: 'tool/call', seq: 0, time: at('2026-01-01T00:00:00Z'), data: { callId: id, name: 'synthetic-tool', arguments: 'synthetic-secret' } } as never,
      { type: 'tool/result', seq: 1, time: at('2026-01-02T00:00:00Z'), data: { message: { source: { callId: id }, content: [] } } } as never,
    ]
    try {
      await ctx.plugin(SessionStore); await ctx.plugin(SessionProjectionRegistry)
      await ctx.sessionProjections.register(def)
      const checkpoint = ctx.sessionProjections.restore({}, events.slice(0, 1), cut, header, cut).checkpoint
      const encoded = JSON.stringify(checkpoint)
      expect(encoded).not.toContain(id)
      expect(encoded).not.toContain('synthetic-secret')
      const resumed = ctx.sessionProjections.restore(JSON.parse(encoded), events.slice(1), SessionLogOffset(1), header, cut)
      const full = ctx.sessionProjections.restore({}, events, cut, header, cut)
      expect(resumed).toEqual(full)
      expect(resumed.snapshot.values.codexConnectUsage).toMatchObject({ days: { '2026-01-02': { tokens: 0, requests: 0 } } })
    } finally { await ctx.fiber.dispose() }
  })

  it('counts disjoint reported buckets only for each settled event', () => {
    const def = make('UTC')
    let state = def.init(undefined as never, 1 as never)
    const time = at('2026-01-01T23:59:00Z')
    state = def.apply(state, event(0, time, { inputTokens: 1000 }))
    const before = state
    state = def.apply(state, event(1, time, { inputTokens: 999 }, 'assistant/stream'))
    expect(state.view).toBe(before.view)
    state = def.apply(state, event(2, time, { inputTokens: ' 3.6 ', cacheReadTokens: 9, cacheWriteTokens: -3, outputTokens: 4, reasoningTokens: 4, totalTokens: 100 }))
    state = def.apply(state, event(3, time))
    state = def.apply(state, event(4, time, { inputTokens: 'bad', cacheReadTokens: Infinity, outputTokens: null }))
    expect(state.view.days['2026-01-01']).toEqual({ tokens: 17, requests: 3 })
    expect(state).toMatchObject({ totalTokens: 17, totalRequests: 3, fault: false, incompleteUsage: true })
  })

  it('distinguishes absent and damaged usage from valid optional omissions', () => {
    const def = make('UTC')
    const time = at('2026-01-01T00:00:00Z')
    const initial = def.init(undefined as never, 1 as never)
    expect(def.apply(initial, event(0, time, { inputTokens: 'bad' })).incompleteUsage).toBe(false)
    const good = def.apply(initial, event(1, time, { inputTokens: '3.6', outputTokens: 2, totalTokens: 999 }))
    expect(good).toMatchObject({ fault: false, incompleteUsage: false, totalTokens: 6, totalRequests: 1 })
    const noUsage = def.apply(good, event(2, time))
    expect(noUsage).toMatchObject({ fault: false, incompleteUsage: true, totalTokens: 6, totalRequests: 2 })
    for (const usage of [null, [], 0, '12', false, {}, { outputTokens: 5 }, { inputTokens: 1 }]) {
      const partial = def.apply(good, event(2, time, usage))
      expect(partial).toMatchObject({ fault: false, incompleteUsage: true, totalRequests: 2 })
    }
    for (const bad of ['not-a-number', '', [], {}, null, NaN, Infinity, -1, '-2', Number.MAX_SAFE_INTEGER + 1]) {
      const partial = def.apply(good, event(2, time, { inputTokens: bad, outputTokens: 7, cacheReadTokens: 4 }))
      expect(partial).toMatchObject({ fault: false, incompleteUsage: true, totalTokens: 17, totalRequests: 2 })
    }
    const extra = def.apply(good, event(2, time, { inputTokens: 1, outputTokens: 2, totalTokens: 'bad', reasoningTokens: [] }))
    expect(extra).toMatchObject({ incompleteUsage: false, totalTokens: 9, totalRequests: 2 })
    const malformed = def.apply(good, { type: 'assistant/message', seq: 2, time, data: { usage: { inputTokens: 5, outputTokens: 3 } } } as never)
    expect(malformed).toMatchObject({ fault: true, incompleteUsage: false, totalTokens: 6, totalRequests: 1 })
    expect(def.apply(malformed, event(3, time, { inputTokens: 5, outputTokens: 3 })))
      .toMatchObject({ fault: true, incompleteUsage: false, totalTokens: 14, totalRequests: 2 })
    expect(def.apply(good, event(2, time, { inputTokens: 99, outputTokens: 99 }, 'assistant/attempt')).view).toBe(good.view)
  })

  it.each([
    { oldVersion: 'current', newZone: 'Asia/Shanghai', newRetention: 2 },
    { oldVersion: 'current', newZone: 'UTC', newRetention: 1 },
    { oldVersion: 'legacy', newZone: 'Asia/Shanghai', newRetention: 1 },
  ])('refolds $oldVersion checkpoints when calendar configuration changes', async ({ oldVersion, newZone, newRetention }) => {
    const ctx = new Context()
    const oldDef = make('UTC', 2)
    const newDef = make(newZone, newRetention)
    const header: SessionHeader = { id: SessionId('usage-registry'), version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false }
    const cut = SessionLogOffset(0)
    const events = [
      event(0, at('2026-01-01T20:00:00Z'), { inputTokens: 1, outputTokens: 2 }),
      event(1, at('2026-01-02T20:00:00Z'), { inputTokens: 4, outputTokens: 5 }),
      event(2, at('2026-01-03T20:00:00Z'), { inputTokens: 6, outputTokens: 7 }),
    ]
    try {
      await ctx.plugin(SessionStore)
      await ctx.plugin(SessionProjectionRegistry)
      await ctx.sessionProjections.register(otherProjection)
      const oldRegistration: unknown = await Promise.resolve(ctx.sessionProjections.register(oldDef))
      expect(oldDef.stateVersion).toBe(make('UTC', 2).stateVersion)
      expect(oldDef.stateVersion).not.toBe(newDef.stateVersion)
      await expect(Promise.resolve().then(() => ctx.sessionProjections.register(newDef))).rejects.toThrow()
      const old = ctx.sessionProjections.restore({}, events.slice(0, 2), cut, header, cut).checkpoint
      if (oldVersion === 'legacy') {
        const row = old.codexConnectUsage
        if (row === undefined) throw new Error('missing usage checkpoint')
        const { incompleteUsage: _incompleteUsage, ...legacyState } = oldDef.stateSchema.parse(row.val)
        old.codexConnectUsage = { ...row, ver: 3, val: legacyState }
      }
      await disposeRegistration(oldRegistration)
      await ctx.sessionProjections.register(newDef)
      expect(ctx.sessionProjections.restoreFloor(old)).toBe(0)
      const restored = ctx.sessionProjections.restore(old, events, cut, header, cut)
      const expected = ctx.sessionProjections.restore({}, events, cut, header, cut)
      expect(restored).toEqual(expected)
      expect(restored.snapshot.values['usage-test/other']).toBe(3)
      expect(restored.checkpoint.codexConnectUsage?.val).toMatchObject({ totalTokens: 25, totalRequests: 3, fault: false, incompleteUsage: false })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('contains a same-version configuration collision without serving old buckets', async () => {
    const ctx = new Context()
    const oldDef = make('UTC', 2)
    const newDef = make('Asia/Shanghai', 1)
    const header: SessionHeader = { id: SessionId('usage-collision'), version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false }
    const cut = SessionLogOffset(0)
    const events = [
      event(0, at('2026-01-01T20:00:00Z'), { inputTokens: 1, outputTokens: 2 }),
      event(1, at('2026-01-02T20:00:00Z'), { inputTokens: 4, outputTokens: 5 }),
      event(2, at('2026-01-03T20:00:00Z'), { inputTokens: 6, outputTokens: 7 }),
    ]
    try {
      await ctx.plugin(SessionStore)
      await ctx.plugin(SessionProjectionRegistry)
      await ctx.sessionProjections.register(otherProjection)
      const oldRegistration: unknown = await Promise.resolve(ctx.sessionProjections.register(oldDef))
      const old = ctx.sessionProjections.restore({}, events.slice(0, 2), cut, header, cut).checkpoint
      const row = old.codexConnectUsage
      if (row === undefined) throw new Error('missing usage checkpoint')
      old.codexConnectUsage = { ...row, ver: newDef.stateVersion }
      await disposeRegistration(oldRegistration)
      await ctx.sessionProjections.register(newDef)
      const floor = ctx.sessionProjections.restoreFloor(old)
      expect(floor).toBe(1)
      if (floor === undefined) throw new Error('missing replay floor')
      const restored = ctx.sessionProjections.restore(old, events.slice(floor), floor, header, cut)
      expect(restored.snapshot.values).toEqual({
        'usage-test/other': 3, codexConnectUsage: { timeZone: 'Asia/Shanghai', days: { '2026-01-04': { tokens: 13, requests: 1 } } },
      })
      expect(restored.checkpoint.codexConnectUsage?.val).toMatchObject({ fault: true, incompleteUsage: true, totalTokens: 13, totalRequests: 1 })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects impossible checkpoint dates before registry recovery', async () => {
    const ctx = new Context()
    const definition = make('UTC', 30)
    const header: SessionHeader = { id: SessionId('invalid-usage-date'), version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false }
    const cut = SessionLogOffset(0)
    const events = [event(0, at('2026-01-01T00:00:00Z'), { inputTokens: 5, outputTokens: 0 })]
    try {
      await ctx.plugin(SessionStore); await ctx.plugin(SessionProjectionRegistry)
      await ctx.sessionProjections.register(definition)
      const checkpoint = ctx.sessionProjections.restore({}, events, cut, header, cut).checkpoint
      const row = checkpoint.codexConnectUsage
      if (row === undefined) throw new Error('missing usage checkpoint')
      const value = definition.stateSchema.parse(row.val)
      const invalid = { ...value, possibleDays: ['2026-02-30'], view: { timeZone: 'UTC', days: { '2026-02-30': { tokens: 5, requests: 1 } } } }
      expect(definition.stateSchema.safeParse(invalid).success).toBe(false)
      checkpoint.codexConnectUsage = { ...row, val: invalid }
      expect(ctx.sessionProjections.restoreFloor(checkpoint)).toBe(0)
      expect(() => ctx.sessionProjections.restore(checkpoint, events, cut, header, cut)).toThrow()
      const leap = { ...value, possibleDays: ['2024-02-29'], view: { timeZone: 'UTC', days: { '2024-02-29': { tokens: 5, requests: 1 } } } }
      expect(definition.stateSchema.safeParse(leap).success).toBe(true)
    } finally { await ctx.fiber.dispose() }
  })

  it('uses event calendar and keeps the latest configured active days with out-of-order events', () => {
    const def = make('Asia/Shanghai', 2)
    let state = def.init(undefined as never, 0 as never)
    state = def.apply(state, event(0, at('2026-01-01T16:01:00Z'), { inputTokens: 1 }))
    state = def.apply(state, event(1, at('2026-01-03T00:00:00Z'), { inputTokens: 2 }))
    state = def.apply(state, event(2, at('2026-01-04T00:00:00Z'), { inputTokens: 3 }))
    const before = state
    state = def.apply(state, event(3, at('2026-01-01T00:00:00Z'), { inputTokens: 99 }))
    expect(state.view).toBe(before.view)
    expect(state.view.days).toEqual({ '2026-01-03': { tokens: 2, requests: 1 }, '2026-01-04': { tokens: 3, requests: 1 } })
  })

  it('retains 400 active days and keeps separately initialized sessions independent', () => {
    const def = make('UTC')
    let first = def.init(undefined as never, 0 as never)
    const second = def.init(undefined as never, 0 as never)
    const start = at('2025-01-01T00:00:00Z')
    for (let i = 0; i < 401; i++) first = def.apply(first, event(i, start + i * 86_400_000, { outputTokens: 1 }))
    expect(Object.keys(first.view.days)).toHaveLength(400)
    expect(first.view.days['2025-01-01']).toBeUndefined()
    expect(second.view.days).toEqual({})
  })

  it('isolates invalid events and keeps checkpoint suffix replay equivalent', () => {
    const def = make('UTC')
    const initial = def.init(undefined as never, 0 as never)
    const time = at('2026-06-01T00:00:00Z')
    const first = def.apply(initial, event(0, time, { inputTokens: 5 }))
    expect(def.apply(first, event(1, NaN, { inputTokens: 9 }))).toMatchObject({ fault: true, view: first.view })
    expect(def.apply(first, event(1, time, { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 2 })))
      .toMatchObject({ fault: false, incompleteUsage: true, totalTokens: 7, totalRequests: 2 })
    const hostile = { type: 'assistant/message', seq: 1, time, get data() { throw new Error('bad record') } }
    expect(def.apply(first, hostile as never)).toMatchObject({ fault: true, view: first.view })
    const restored = def.stateSchema.parse(JSON.parse(JSON.stringify(first)))
    expect(def.apply(restored, event(2, time, { cacheReadTokens: 7 }))).toEqual(def.apply(first, event(2, time, { cacheReadTokens: 7 })))
    expect(initial.view.days).toEqual({})
    expect(def.wire.view(first)).toBe(first.view)
    expect(make('Asia/Shanghai').stateSchema.parse(first)).toMatchObject({ fault: true, incompleteUsage: true, totalTokens: 0, view: { timeZone: 'Asia/Shanghai', days: {} } })
    expect(make('UTC', 10).stateSchema.parse(first)).toMatchObject({ fault: true, incompleteUsage: true, totalTokens: 0, retainedDays: 10 })
    expect(() => make('not-a-zone')).toThrow()
    expect(() => make('UTC', 0)).toThrow()
  })

  it('tracks a turn in the inherited prefix without counting inherited usage', () => {
    const def = make('UTC')
    const time = at('2026-01-01T00:00:00Z')
    const initial = def.init(undefined as never, 1 as never)
    const inherited = def.apply(initial, event(0, time, undefined, 'turn/start'))
    expect(inherited).toMatchObject({ hasTurnStart: true, totalRequests: 0, possibleDays: [] })
    const own = def.apply(inherited, event(1, time, { inputTokens: 5 }))
    expect(own).toMatchObject({ hasTurnStart: true, totalRequests: 1 })
    const withoutTurn = def.apply(def.init(undefined as never, 0 as never), event(0, time))
    expect(withoutTurn).toMatchObject({ hasTurnStart: false, totalRequests: 1 })
    expect(def.apply(withoutTurn, event(1, time, undefined, 'turn/start')))
      .toMatchObject({ hasTurnStart: true, totalRequests: 1, view: withoutTurn.view })
  })

  it('retains confirmed human activity days and excludes injected messages', () => {
    const def = make('UTC', 30)
    let state = def.init(undefined as never, 0 as never)
    const start = at('2026-01-01T00:00:00Z')
    state = def.apply(state, event(0, start, { inputTokens: 5 }))
    for (let i = 1; i <= 30; i++) {
      state = def.apply(state, { type: 'user/message', seq: i, time: start + i * 86_400_000,
        data: { role: 'user', content: [], source: { kind: 'user' } } } as never)
    }
    expect(state.view.days['2026-01-01']).toBeUndefined()
    expect(Object.keys(state.view.days)).toHaveLength(30)
    expect(state.retentionUncertain).toBe(false)
    const injected = def.apply(state, { type: 'user/message', seq: 31, time: start + 31 * 86_400_000,
      data: { role: 'user', content: [], source: { kind: 'agent-instructions' } } } as never)
    expect(injected.view.days).toEqual(state.view.days)
    const reply = def.apply(injected, { type: 'user/message', seq: 32, time: start + 32 * 86_400_000,
      data: { message: { role: 'user', content: [], source: { kind: 'user-question-reply' } } } } as never)
    expect(reply.view.days['2026-02-02']).toEqual({ tokens: 0, requests: 0 })
  })

  it('matches Context retention when a step ends on a later activity day', () => {
    const def = make('UTC', 30)
    let state = def.init(undefined as never, 0 as never)
    const start = at('2026-01-01T12:00:00Z')
    for (let day = 0; day < 30; day++) state = def.apply(state, event(day, start + day * 86_400_000, { inputTokens: day === 0 ? 5 : 1, outputTokens: 0 }))
    state = def.apply(state, { type: 'step/start', seq: 30, time: at('2026-01-30T23:50:00Z'), data: { turn: 1, step: 1 } } as never)
    const checkpoint = def.stateSchema.parse(JSON.parse(JSON.stringify(state)))
    const end = { type: 'step/end', seq: 31, time: at('2026-01-31T00:10:00Z'), data: { turn: 1, step: 1 } } as never
    const finished = def.apply(state, end)
    expect(def.apply(checkpoint, end)).toEqual(finished)
    expect(finished.view.days['2026-01-01']).toBeUndefined()
    expect(finished.view.days['2026-01-31']).toEqual({ tokens: 0, requests: 0 })
    expect(Object.keys(finished.view.days)).toHaveLength(30)
    expect(finished.retentionUncertain).toBe(false)
  })

  it('matches Context retention for a completed PTC question answer', () => {
    const def = make('UTC', 30)
    let state = def.init(undefined as never, 0 as never)
    const start = at('2026-01-01T12:00:00Z')
    for (let day = 0; day < 30; day++) state = def.apply(state, event(day, start + day * 86_400_000, { inputTokens: day === 0 ? 5 : 1, outputTokens: 0 }))
    const answer = JSON.stringify({ answers: [{ id: 'question', selected: [] }] })
    const result = { type: 'tool/ptc-dispatch', seq: 30, time: at('2026-01-31T00:10:00Z'),
      data: { name: 'ask_user_question', content: [{ type: 'text', text: answer }] } } as never
    const complete = def.apply(state, result)
    expect(complete.view.days['2026-01-01']).toBeUndefined()
    expect(complete.view.days['2026-01-31']).toEqual({ tokens: 0, requests: 0 })
    const nested = { type: 'tool/ptc-dispatch', seq: 30, time: at('2026-01-31T00:10:00Z'),
      data: { name: 'ask_user_question', content: [{ type: 'tool-result', content: [{ type: 'text', text: answer }] }] } } as never
    expect(def.apply(state, nested).view.days).toEqual(complete.view.days)
    expect(Object.keys(complete.view.days)).toHaveLength(30)
    expect(complete.retentionUncertain).toBe(false)
  })

  it('does not add activity days for failed, pending, or malformed PTC answers', () => {
    const def = make('UTC', 1)
    const start = at('2026-01-01T12:00:00Z')
    const initial = def.apply(def.init(undefined as never, 0 as never), event(0, start, { inputTokens: 5, outputTokens: 0 }))
    const answer = JSON.stringify({ answers: [{ id: 'question', selected: [] }] })
    const rejected = [
      { name: 'another_tool', content: [{ type: 'text', text: answer }] },
      { name: 'ask_user_question', isError: true, content: [{ type: 'text', text: answer }] },
      { name: 'ask_user_question', content: [{ type: 'text', text: JSON.stringify({ pending: true, answers: [{ id: 'q', selected: [] }] }) }] },
      { name: 'ask_user_question', content: [{ type: 'text', text: JSON.stringify({ answers: [] }) }] },
      { name: 'ask_user_question', content: [{ type: 'text', text: '{bad' }] },
      { name: 'ask_user_question', content: [{ type: 'tool-result', isError: true, content: [{ type: 'text', text: answer }] }] },
      { name: 'ask_user_question', content: [{ type: 'text', text: JSON.stringify({ answers: [{ id: 'q', selected: [4] }] }) }] },
    ]
    for (const data of rejected) {
      const next = def.apply(initial, { type: 'tool/ptc-dispatch', seq: 1, time: start + 86_400_000, data } as never)
      expect(next.view.days).toEqual(initial.view.days)
    }
  })

  it('rejects older semantics and removes an explicitly undefined optional step', () => {
    const def = make('UTC')
    const initial = def.init(undefined as never, 0 as never)
    const { semanticsVersion: _version, ...previousSemantics } = initial
    expect(def.stateSchema.safeParse(previousSemantics).success).toBe(false)
    const recovered = def.stateSchema.parse({ ...initial, stepStartTime: undefined })
    expect(Object.hasOwn(recovered, 'stepStartTime')).toBe(false)
    expect(JSON.parse(JSON.stringify(recovered))).toEqual(recovered)
  })

  it('does not confirm zero-duration, unpaired, or inherited step ends', () => {
    const def = make('UTC', 1)
    const start = at('2026-01-01T12:00:00Z')
    const usage = event(0, start, { inputTokens: 5, outputTokens: 0 })
    const end = { type: 'step/end', seq: 1, time: start + 86_400_000, data: { turn: 1, step: 1 } } as never
    const initial = def.apply(def.init(undefined as never, 0 as never), usage)
    expect(def.apply(initial, end).view.days).toEqual(initial.view.days)
    const opened = def.apply(initial, { type: 'step/start', seq: 1, time: start + 86_400_000, data: { turn: 1, step: 1 } } as never)
    expect(def.apply(opened, { type: 'step/end', seq: 2, time: start + 86_400_000, data: { turn: 1, step: 1 } } as never).view.days).toEqual(initial.view.days)
    const inherited = def.init(undefined as never, 1 as never)
    const prior = def.apply(inherited, { type: 'step/start', seq: 0, time: start, data: { turn: 1, step: 1 } } as never)
    expect(def.apply(prior, end).view.days).toEqual({})
  })

  it('marks any visible older request outside the bounded possible-date window', () => {
    const def = make('UTC', 30)
    let state = def.init(undefined as never, 1 as never)
    const start = at('2026-01-01T00:00:00Z')
    state = def.apply(state, event(0, start - 86_400_000, { inputTokens: 999 }))
    state = def.apply(state, event(1, start, { inputTokens: 1 }))
    state = def.apply(state, event(2, start + 30 * 86_400_000, { inputTokens: 2 }))
    for (let i = 1; i < 30; i++) state = def.apply(state, event(i + 2, start + i * 86_400_000, undefined, 'turn/start'))
    expect(state.possibleDays).toHaveLength(30)
    expect(state.view.days['2026-01-01']).toEqual({ tokens: 1, requests: 1 })
    expect(state.view.days['2026-01-31']).toEqual({ tokens: 2, requests: 1 })
    expect(state.retentionUncertain).toBe(true)
    for (let i = 1; i <= 30; i++) state = def.apply(state, { type: 'user/message', seq: i + 32,
      time: start + i * 86_400_000, data: { role: 'user', content: [], source: { kind: 'user' } } } as never)
    expect(state.view.days['2026-01-01']).toBeUndefined()
    expect(state.retentionUncertain).toBe(false)
  })

  it('does not confirm a malformed user day or silently evict prior usage', () => {
    const def = make('UTC', 1)
    const start = at('2026-01-01T00:00:00Z')
    const first = def.apply(def.init(undefined as never, 0 as never), event(0, start, { inputTokens: 5 }))
    for (const data of [null, {}, { role: 'user', content: null }]) {
      const state = def.apply(first, { type: 'user/message', seq: 1, time: start + 86_400_000, data } as never)
      expect(state.view).toBe(first.view)
      expect(state).toMatchObject({ fault: true, retentionUncertain: true, possibleDays: ['2026-01-02'] })
    }
  })

  it('retains requests and valid counters for malformed data and total overflow', () => {
    const def = make('UTC', 1)
    const start = at('2026-01-01T00:00:00Z')
    const initial = def.init(undefined as never, 0 as never)
    const malformed = def.apply(initial, { type: 'assistant/message', seq: 0, time: start,
      data: { turn: 1, step: 1, stream: [], message: {} } } as never)
    expect(malformed).toMatchObject({ fault: true, incompleteUsage: false, totalRequests: 0, view: initial.view })
    const first = def.apply(initial, event(0, start, { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0 }))
    const overflow = def.apply(first, event(1, start + 86_400_000, { inputTokens: 0, outputTokens: 1 }))
    expect(overflow).toMatchObject({ fault: false, incompleteUsage: true, totalTokens: Number.MAX_SAFE_INTEGER, totalRequests: 2 })
    expect(overflow.view.days['2026-01-02']).toEqual({ tokens: 0, requests: 1 })
    expect(def.stateSchema.parse(JSON.parse(JSON.stringify(overflow))).incompleteUsage).toBe(true)
  })
})
