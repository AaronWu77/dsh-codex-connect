import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context, Service } from '@deepseek-ai/cordis'
import SessionStore, { SESSION_FORMAT_VERSION, Session, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import { createMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type { ProjectionDefinition, ProjectionSnapshot } from '@deepseek-ai/dsh-session-projection'
import Storage from '@deepseek-ai/dsh-storage'
import type { StorageBackend } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { DomainSpec } from '@deepseek-ai/dsh-storage-domain'
import { describe, expect, it } from 'vitest'
import { createCodexConnectUsageDefinition } from '../src/host/usage-projection.ts'

type StatsView = {
  turns: number; steps: number; llmMs: number; toolMs: number; ttftMs: number
  ttftSteps: number; decodeMs: number; decodeTokens: number
}
type StatsState = StatsView & {
  lastTurn: number | null
  openStep: { turn: number; step: number; startTime: number; firstTokenTime: number | null } | null
  pendingCalls: Record<string, number>
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap { 'usage-integration/dsh-stats': StatsView }
  interface SessionProjectionStateMap { 'usage-integration/dsh-stats': StatsState }
}

type CacheOptions = { writeEveryEvents: number; writeIntervalMs: number }
type Cut = ReturnType<typeof SessionLogOffset>
interface Cache {
  coldSnapshot(header: SessionHeader, inherited: Cut, events: readonly SessionEvent[]): ProjectionSnapshot
  cachedSnapshot(header: SessionHeader): ProjectionSnapshot | undefined
  hydratePrepared(session: Session, events: readonly SessionEvent[]): ProjectionSnapshot
}
type CacheModule = {
  default: new (ctx: Context, config: CacheOptions) => Service & Cache
  checkpointRecord: { parse(value: unknown): unknown }
  projectionCacheDomainSpec: DomainSpec
}
type StatsDefinition = Omit<ProjectionDefinition<'usage-integration/dsh-stats', StatsState>, 'key' | 'wire'> & {
  key: 'sessionStats'
  wire: NonNullable<ProjectionDefinition<'usage-integration/dsh-stats', StatsState>['wire']>
}
type StatsModule = { sessionStatsProjectionDefinition: StatsDefinition }
type MemoryModule = { MemoryStorageBackend: new () => StorageBackend }

const explicitRepo = process.env.DSH_REPO
const repo = explicitRepo === undefined || explicitRepo === ''
  ? fileURLToPath(new URL('../../../../', import.meta.url))
  : resolve(explicitRepo)
const cachePath = join(repo, 'packages/session/session-projection-cache/src/index.ts')
const statsPath = join(repo, 'packages/session/session-stats/src/projection.ts')
const memoryPath = join(repo, 'packages/storage/storage-domain/tests/helpers/memory-backend.ts')
const available = [cachePath, statsPath, memoryPath].every(path => existsSync(path))
if (!available && explicitRepo !== undefined && explicitRepo !== '') throw new Error('DSH_REPO must identify a DSH source checkout for shared-cache integration')
if (!available) console.info('Skipping DSH shared-cache integration: set DSH_REPO to a DSH source checkout.')

const make = (timeZone: string, retainedDays: number) => createCodexConnectUsageDefinition({ timeZone, retainedDays })
const event = (seq: number, date: string, usage?: object, type = 'assistant/message') => ({
  type, seq, time: Date.parse(date), data: { usage, turn: 1, step: 1, stream: [],
    message: { id: 'm', role: 'assistant', content: [], source: { kind: 'model', provider: 'test', model: 'model' } } },
}) as never

async function disposeRegistration(registration: unknown): Promise<void> {
  if (typeof registration === 'function') await registration()
  else if (typeof registration === 'object' && registration !== null && 'dispose' in registration && typeof registration.dispose === 'function') await registration.dispose()
  else throw new Error('unsupported projection registration')
}

describe.skipIf(!available)('DSH shared-cache integration (requires a checkout or DSH_REPO)', () => {
  it.each([
    { oldVersion: 'current', newZone: 'Asia/Shanghai', newRetention: 2 },
    { oldVersion: 'current', newZone: 'UTC', newRetention: 1 },
    { oldVersion: 'legacy', newZone: 'Asia/Shanghai', newRetention: 1 },
  ])('refolds $oldVersion checkpoints alongside DSH session statistics', async ({ oldVersion, newZone, newRetention }) => {
    const { default: SessionProjectionCache, checkpointRecord, projectionCacheDomainSpec } =
      await import(/* @vite-ignore */ pathToFileURL(cachePath).href) as CacheModule
    const { sessionStatsProjectionDefinition } = await import(/* @vite-ignore */ pathToFileURL(statsPath).href) as StatsModule
    const { MemoryStorageBackend } = await import(/* @vite-ignore */ pathToFileURL(memoryPath).href) as MemoryModule
    const ctx = new Context()
    const oldDef = make('UTC', 2)
    const newDef = make(newZone, newRetention)
    const header: SessionHeader = { id: SessionId('usage-cache'), version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false }
    const cut = SessionLogOffset(0)
    const events = [
      event(0, '2026-01-01T20:00:00Z', { inputTokens: 1, outputTokens: 2 }),
      event(1, '2026-01-02T20:00:00Z', { inputTokens: 4, outputTokens: 5 }),
      event(2, '2026-01-03T20:00:00Z', { inputTokens: 6, outputTokens: 7 }),
      event(3, '2026-01-03T20:00:00Z', undefined, 'step/end'),
    ]
    const backend = new MemoryStorageBackend()
    try {
      await ctx.plugin(Storage)
      ctx.storage.backend.register('usage-memory', backend)
      const facility = new DomainFacility(ctx, { backend: 'usage-memory' })
      ctx.provide('storageDomain', facility)
      await ctx.plugin(SessionStore)
      await ctx.plugin(SessionProjectionRegistry)
      await ctx.sessionProjections.register({ ...sessionStatsProjectionDefinition, key: 'usage-integration/dsh-stats' })
      const oldRegistration: unknown = await Promise.resolve(ctx.sessionProjections.register(oldDef))
      const old = ctx.sessionProjections.restore({}, events.slice(0, 2), cut, header, cut).checkpoint
      if (oldVersion === 'legacy') {
        const row = old.codexConnectUsage
        if (row === undefined) throw new Error('missing usage checkpoint')
        const { incompleteUsage: _incompleteUsage, ...legacyState } = oldDef.stateSchema.parse(row.val)
        old.codexConnectUsage = { ...row, ver: 3, val: legacyState }
      }
      const domain = await facility.open(projectionCacheDomainSpec)
      await domain.table('sessions').put(header.id, checkpointRecord.parse({
        identity: { formatVersion: header.version, createdAt: header.createdAt, isSeeded: false, inheritedEventCount: cut }, rows: old,
      }))
      await domain.close()
      await disposeRegistration(oldRegistration)
      await ctx.sessionProjections.register(newDef)
      expect(ctx.sessionProjections.restoreFloor(old)).toBe(0)
      const expected = ctx.sessionProjections.restore({}, events, cut, header, cut)
      expect(expected.snapshot.values['usage-integration/dsh-stats']).toMatchObject({ steps: 1, turns: 1 })
      expect(expected.checkpoint.codexConnectUsage?.val).toMatchObject({ totalTokens: 25, totalRequests: 3, fault: false, incompleteUsage: false })
      await ctx.plugin(SessionProjectionCache, { writeEveryEvents: 100, writeIntervalMs: 60_000 })
      const cache = (ctx as Context & { sessionProjectionCache: Cache }).sessionProjectionCache
      const written = new Promise<void>(resolve => {
        const dispose = ctx.on('domain/changed', change => {
          if (change.domain === projectionCacheDomainSpec.name && change.key === header.id && change.operation === 'put') { dispose(); resolve() }
        })
      })
      expect(cache.coldSnapshot(header, cut, events)).toEqual(expected.snapshot)
      await written
      expect(cache.cachedSnapshot(header)?.values).toEqual(expected.snapshot.values)
    } finally {
      await ctx.fiber.dispose()
      await backend.close()
    }
  })

  it('replays an invalid same-version usage row when preparing a Session', async () => {
    const { default: SessionProjectionCache, checkpointRecord, projectionCacheDomainSpec } =
      await import(/* @vite-ignore */ pathToFileURL(cachePath).href) as CacheModule
    const { MemoryStorageBackend } = await import(/* @vite-ignore */ pathToFileURL(memoryPath).href) as MemoryModule
    const ctx = new Context()
    const backend = new MemoryStorageBackend()
    const definition = make('UTC', 30)
    const id = SessionId('invalid-cache-date')
    const header: SessionHeader = { id, version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false }
    const cut = SessionLogOffset(0)
    try {
      await ctx.plugin(Storage)
      ctx.storage.backend.register('usage-memory-invalid', backend)
      const facility = new DomainFacility(ctx, { backend: 'usage-memory-invalid' })
      ctx.provide('storageDomain', facility)
      await ctx.plugin(SessionStore); await ctx.plugin(SessionProjectionRegistry)
      await ctx.sessionProjections.register(definition)
      const session = Session.create(id, undefined, header)
      session.append('assistant/message', { turn: 1, step: 1, stream: [], usage: { inputTokens: 5, outputTokens: 0 },
        message: createMessage({ role: 'assistant', content: [], source: { kind: 'model', provider: 'synthetic', model: 'synthetic' } }) }, { surfaceOp: 'append' })
      const events = session.snapshotEvents()
      const expected = ctx.sessionProjections.restore({}, events, cut, header, cut)
      const checkpoint = expected.checkpoint
      const row = checkpoint.codexConnectUsage
      if (row === undefined) throw new Error('missing usage checkpoint')
      const valid = definition.stateSchema.parse(row.val)
      checkpoint.codexConnectUsage = { ...row, val: { ...valid, possibleDays: ['2026-02-30'],
        view: { timeZone: 'UTC', days: { '2026-02-30': { tokens: 5, requests: 1 } } } } }
      const domain = await facility.open(projectionCacheDomainSpec)
      await domain.table('sessions').put(id, checkpointRecord.parse({
        identity: { formatVersion: header.version, createdAt: header.createdAt, isSeeded: false, inheritedEventCount: cut }, rows: checkpoint,
      }))
      await domain.close()
      await ctx.plugin(SessionProjectionCache, { writeEveryEvents: 100, writeIntervalMs: 60_000 })
      const cache = (ctx as Context & { sessionProjectionCache: Cache }).sessionProjectionCache
      expect(cache.hydratePrepared(session, events)).toEqual(expected.snapshot)
    } finally { await ctx.fiber.dispose(); await backend.close() }
  })
})
