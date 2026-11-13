import { Context } from '@deepseek-ai/cordis'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { expect, it, vi } from 'vitest'
import { ConversationSpeedRegistry, createConversationSpeedRegistry } from '../src/speed-mode-registry.ts'

const accountA = 'acct_' + 'a'.repeat(43), accountB = 'acct_' + 'b'.repeat(43)
function fixture(limit = 256) {
  const registry = new ConversationSpeedRegistry(limit)
  const scope = () => ({ workspace: registry.workspaceFor('session'), provider: 'openai-codex-16', model: 'gpt-6.1-sol', accountKey: accountA })
  const choose = (mode: 'standard' | 'fast' | 'ultrafast') => {
    const current = scope(), state = registry.readSpeed('session', current)
    return registry.selectSpeed('session', current, state.generation, state.revision, mode)
  }
  return { registry, scope, choose }
}
it('keeps modes exclusive, legacy Standard explicit, and stale commands nonreplayable', () => {
  const { registry, scope, choose } = fixture()
  const initial = registry.readSpeed('session', scope())
  choose('ultrafast')
  expect(registry.isEnabled('session')).toBe(false)
  expect(registry.isUltrafastSelected('session')).toBe(true)
  expect(() => registry.selectSpeed('session', scope(), initial.generation, initial.revision, 'fast')).toThrow('SPEED_SELECTION_STALE')
  registry.setEnabled('session', false)
  expect(registry.captureSpeed('session')).toEqual({ mode: 'standard' })
  expect(registry.isUltrafastSelected('session')).toBe(false)
  choose('fast'); expect(registry.isEnabled('session')).toBe(true)
  choose('ultrafast'); expect(registry.isEnabled('session')).toBe(false)
})
it('marks a paid account A/B/A choice expired and requires a visible explicit reselection', () => {
  const { registry, scope, choose } = fixture()
  const old = choose('ultrafast'), captured = registry.captureSpeed('session')
  registry.invalidateAccountSelections(); registry.invalidateAccountSelections()
  const current = registry.readSpeed('session', scope())
  expect(current).toMatchObject({ mode: 'ultrafast', selectionExpired: true, eligibility: 'unknown' })
  expect(() => registry.selectSpeed('session', scope(), old.generation, old.revision, 'ultrafast')).toThrow('SPEED_SELECTION_STALE')
  expect(() => registry.confirmCapturedSpeed('session', captured, scope())).toThrow('ULTRAFAST_SELECTION_EXPIRED')
  expect(() => registry.confirmCapturedSpeed('session', registry.captureSpeed('session'), scope())).toThrow('ULTRAFAST_SELECTION_EXPIRED')
  choose('ultrafast')
  expect(registry.confirmCapturedSpeed('session', registry.captureSpeed('session'), scope())).toBe('ultrafast')
})
it('keeps an already captured request independent of later manual choices, but not of a mismatched account', () => {
  const { registry, scope, choose } = fixture()
  choose('ultrafast'); const captured = registry.captureSpeed('session')
  choose('standard')
  expect(registry.confirmCapturedSpeed('session', captured, scope())).toBe('ultrafast')
  expect(() => registry.confirmCapturedSpeed('session', captured, { ...scope(), accountKey: accountB })).toThrow('ULTRAFAST_SELECTION_EXPIRED')
  expect(() => registry.confirmCapturedSpeed('session', captured, scope())).toThrow('ULTRAFAST_SELECTION_EXPIRED')
})
it('does not seed startup defaults over a manual Standard or Fast command made before agent creation', () => {
  const { registry } = fixture()
  registry.set('standard', false)
  registry.seedStartupDefault('standard', 'fast')
  registry.seedStartupDefault('standard', 'ultrafast')
  expect(registry.captureSpeed('standard').mode).toBe('standard')
  registry.set('fast', true)
  registry.seedStartupDefault('fast', 'standard')
  expect(registry.captureSpeed('fast').mode).toBe('fast')
})
it('preserves manual Standard over an asynchronous startup account read', async () => {
  const { registry, scope } = fixture()
  registry.seedStartupDefault('session', 'ultrafast')
  let release!: (value: string) => void
  const resolve = vi.fn(() => new Promise<string>(done => { release = done }))
  const applying = registry.applyStartupDefault('session', scope(), resolve, new AbortController().signal)
  expect(resolve).toHaveBeenCalledWith('openai-codex-16', expect.any(AbortSignal))
  registry.set('session', false); release(accountA)
  await applying
  expect(registry.captureSpeed('session').mode).toBe('standard')
})
it('never silently downgrades unsupported or signed-out explicit startup intent, and ignores other providers', async () => {
  const { registry, scope } = fixture()
  registry.seedStartupDefault('session', 'ultrafast')
  const signal = new AbortController().signal
  await registry.applyStartupDefault('session', { provider: 'deepseek', model: 'deepseek-chat' }, async () => undefined, signal)
  await expect(registry.applyStartupDefault('session', { ...scope(), model: 'gpt-5.6-sol' }, async () => accountA, signal)).rejects.toThrow('ULTRAFAST_MODEL_UNSUPPORTED')
  for (let attempt = 0; attempt < 2; attempt++) await expect(registry.applyStartupDefault('session', scope(), async () => undefined, signal)).rejects.toThrow('ULTRAFAST_SIGN_IN_REQUIRED')
  expect(registry.isUltrafastSelected('session')).toBe(true)
  registry.set('session', false)
  await registry.applyStartupDefault('session', scope(), async () => undefined, signal)
})
it('watches committed Host selection A/B/A changes and releases the listener on disposal', async () => {
  const ctx = new Context(); await ctx.plugin(SessionStore)
  try {
    const session = ctx.sessions.create(SessionId('session'))
    const registry = createConversationSpeedRegistry(ctx)
    const scope = () => ({ workspace: registry.workspaceFor(session.id), provider: 'openai-codex', model: 'gpt-6.1-sol', accountKey: accountA })
    const current = registry.readSpeed(session.id, scope())
    registry.selectSpeed(session.id, scope(), current.generation, current.revision, 'ultrafast')
    const captured = registry.captureSpeed(session.id)
    session.append('model/selection', { provider: 'openai-codex-16', model: 'gpt-6-astra' })
    session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6.1-sol' })
    expect(registry.readSpeed(session.id, scope()).selectionExpired).toBe(true)
    expect(() => registry.confirmCapturedSpeed(session.id, captured, scope())).toThrow('ULTRAFAST_SELECTION_EXPIRED')
  } finally { await ctx.fiber.dispose() }
})
it('rejects old generations after bounded control eviction', () => {
  const { registry, scope, choose } = fixture(1)
  const old = choose('standard')
  registry.readSpeed('other', { ...scope(), workspace: registry.workspaceFor('other') })
  expect(() => registry.selectSpeed('session', scope(), old.generation, old.revision, 'ultrafast')).toThrow('SPEED_SELECTION_STALE')
})

it('refuses a new readback instead of evicting an explicit paid selection', () => {
  const { registry, scope, choose } = fixture(1)
  choose('ultrafast')
  expect(() => registry.readSpeed('other', { ...scope(), workspace: registry.workspaceFor('other') })).toThrow('SPEED_STATE_CAPACITY')
  expect(registry.captureSpeed('session').mode).toBe('ultrafast')
  expect(registry.confirmCapturedSpeed('session', registry.captureSpeed('session'), scope())).toBe('ultrafast')
  registry.invalidateAccountSelections()
  expect(() => registry.readSpeed('other', { ...scope(), workspace: registry.workspaceFor('other') })).toThrow('SPEED_STATE_CAPACITY')
  expect(() => registry.confirmCapturedSpeed('session', registry.captureSpeed('session'), scope())).toThrow('ULTRAFAST_SELECTION_EXPIRED')
})

it('does not discard a pending paid startup default when bounded capacity is reached', () => {
  const { registry } = fixture(1)
  registry.seedStartupDefault('session', 'ultrafast')
  expect(() => registry.seedStartupDefault('other', 'ultrafast')).toThrow('SPEED_STATE_CAPACITY')
  expect(registry.captureSpeed('session').mode).toBe('ultrafast')
})

it('keeps an invalidated pending startup visibly expired while an account read settles', async () => {
  const { registry, scope } = fixture()
  registry.seedStartupDefault('session', 'ultrafast')
  let release!: (value: string) => void
  const applying = registry.applyStartupDefault('session', scope(), () => new Promise<string>(resolve => { release = resolve }), new AbortController().signal)
  registry.invalidateAccountSelections()
  release(accountA)
  await expect(applying).rejects.toThrow('ULTRAFAST_SELECTION_EXPIRED')
  expect(registry.captureSpeed('session').mode).toBe('ultrafast')
  expect(registry.readSpeed('session', scope()).selectionExpired).toBe(true)
})

it('keeps unmaterialized startup intent expired after a committed model selection', async () => {
  const { registry, scope } = fixture()
  registry.seedStartupDefault('session', 'ultrafast')
  registry.invalidateModelSelection('session')
  expect(registry.captureSpeed('session').mode).toBe('ultrafast')
  await expect(registry.applyStartupDefault('session', scope(), async () => accountA, new AbortController().signal)).rejects.toThrow('ULTRAFAST_SELECTION_EXPIRED')
  registry.set('session', false)
  expect(registry.captureSpeed('session').mode).toBe('standard')
})

it('does not count commands for initialized sessions as permanent pre-start marker history', () => {
  const registry = new ConversationSpeedRegistry(1, undefined, () => true)
  for (let index = 0; index < 300; index++) registry.set('initialized-' + index, false)
  expect(registry.captureSpeed('initialized-299').mode).toBe('standard')
})

it('releases a consumed pre-start manual marker without changing its explicit Standard choice', () => {
  const { registry } = fixture(1)
  registry.set('session', false)
  registry.seedStartupDefault('session', 'ultrafast')
  registry.finishStartup('session')
  registry.set('other', false)
  expect(registry.captureSpeed('session').mode).toBe('standard')
})

it('protects manual commands until the startup owner finishes, not merely until creation is observed', () => {
  let finished = false
  const registry = new ConversationSpeedRegistry(1, undefined, () => finished, () => { finished = true })
  registry.set('session', false)
  registry.seedStartupDefault('session', 'ultrafast')
  expect(registry.captureSpeed('session').mode).toBe('standard')
  registry.finishStartup('session')
  for (let index = 0; index < 300; index++) registry.set('after-' + index, false)
  expect(registry.captureSpeed('session').mode).toBe('standard')
})
