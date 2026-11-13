import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionLogOffset, SessionStore } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent, SessionEventMap } from '@deepseek-ai/dsh-session'
import type { PtcDispatchStartEventData } from '@deepseek-ai/dsh-tool-executor-ptc/types'
import type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types'
import { describe, expect, it } from 'vitest'
import { resolveAutoReviewAction } from '../src/auto-review-contract.ts'

const rootCallId = ToolCallId('outer-run-code')
const subCallId = ToolCallId('opaque-inner-id')
const workspaceRoot = process.cwd()

async function fixture(options: { provider?: string; seed?: readonly SessionEvent[] } = {}) {
  const ctx = new Context()
  try {
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('ptc-review'), {
      meta: { cwd: workspaceRoot, ...options.seed === undefined ? {} : { isSeeded: true } },
      ...options.seed === undefined ? {} : { seed: options.seed, inheritedEventCount: SessionLogOffset(options.seed.length) },
    })
    session.append('request/header', {
      header: { config: { provider: options.provider ?? 'openai-codex', model: 'fixture' } }, reason: 'initial',
    })
    const unused = (): never => { throw new Error('The resolver fixture has no running model driver') }
    const agent: Agent = {
      id: session.id, ctx, session, options: {}, status: 'idle',
      model: { current: () => undefined, select: () => undefined },
      inbox: { nextTurn: [], nextStep: [], clear: unused, append: unused, prepend: unused, replace: unused, remove: unused, splice: unused },
      whenIdle: async () => undefined, runMaintenance: unused, send: unused, steer: unused,
      inject: unused, cancel: unused, followup: unused,
    }
    return { agent, session, async [Symbol.asyncDispose]() { await ctx.fiber.dispose() } }
  } catch (error) {
    await ctx.fiber.dispose()
    throw error
  }
}

function nativeCall(session: Session, overrides: Partial<SessionEventMap['tool/call']> = {}) {
  return session.append('tool/call', {
    callId: rootCallId, name: 'run_code', turn: 7, step: 2,
    arguments: JSON.stringify({ code: 'return await tools.read({ file_path: "wrapper-only.md" })' }),
    ...overrides,
  })
}

function dispatch(overrides: Partial<PtcDispatchStartEventData> = {}): PtcDispatchStartEventData {
  return {
    rootCallId, parentCallId: rootCallId, subCallId, name: 'read',
    arguments: { file_path: 'inner-only.md', options: { offset: 2, include: ['a', true, null] } },
    ...overrides,
  }
}

function start(session: Session, overrides: Partial<PtcDispatchStartEventData> = {}) {
  return session.append('tool/ptc-dispatch-start', dispatch(overrides))
}

function settle(session: Session, data: PtcDispatchStartEventData) {
  return session.append('tool/ptc-dispatch', { ...data, isError: true, content: [{ type: 'text', text: 'Approval denied' }] })
}

function request(agent: Agent, callId = subCallId, toolName = 'read'): ApprovalRequestEvent {
  return { agent, callId, toolName, reason: 'needs exact approval' }
}

describe('Auto-review nested PTC action resolution', () => {
  it('uses the unique pre-approval start arguments and preserves the exact sub-call id', async () => {
    await using f = await fixture()
    nativeCall(f.session)
    const args = { file_path: 'only-the-start-argument.md', nested: { nullable: null, list: [1, '二', false] } }
    const logged = start(f.session, { arguments: args })
    args.file_path = 'not-the-logged-argument.md'
    const action = resolveAutoReviewAction(request(f.agent))
    expect(action).toMatchObject({
      toolName: 'read', callId: subCallId, turn: 7,
      arguments: logged.data.arguments, provider: 'openai-codex',
      cwd: workspaceRoot, workspaceRoot, reason: 'needs exact approval',
    })
    expect(action?.arguments).not.toBe(logged.data.arguments)
    expect(action?.arguments).not.toHaveProperty('code')
    expect(Object.isFrozen(action)).toBe(true)
  })

  it('takes the root turn without inferring a parent event or parsing wrapper code', async () => {
    await using f = await fixture()
    nativeCall(f.session, { arguments: JSON.stringify({ code: 'x'.repeat(20_000) }), turn: 3 })
    nativeCall(f.session, { callId: ToolCallId('another-root'), turn: 99 })
    start(f.session, { parentCallId: ToolCallId('unlogged-nested-parent') })
    f.session.append('turn/start', { turn: 100 })
    expect(resolveAutoReviewAction(request(f.agent))).toMatchObject({ callId: subCallId, turn: 3, arguments: dispatch().arguments })
  })

  it('keeps an already-settled start available to exact /approve retry lookup', async () => {
    await using f = await fixture()
    nativeCall(f.session)
    const logged = start(f.session)
    const original = resolveAutoReviewAction(request(f.agent))
    expect(original).toBeDefined()
    settle(f.session, logged.data)
    start(f.session, { subCallId: ToolCallId('unrelated-retry-id'), arguments: { file_path: 'other.md' } })
    expect(resolveAutoReviewAction(request(f.agent))).toEqual(original)
  })

  it('canonicalizes inner JSON like a native call without binding wrapper ids or turns', async () => {
    await using ptc = await fixture()
    await using native = await fixture()
    nativeCall(ptc.session)
    start(ptc.session, { arguments: { z: [null, true], a: { second: 2, first: 1 } } })
    nativeCall(native.session, {
      callId: ToolCallId('native-read'), name: 'read', turn: 12,
      arguments: '{"a":{"first":1,"second":2},"z":[null,true]}',
    })
    const nestedAction = resolveAutoReviewAction(request(ptc.agent))
    const nativeAction = resolveAutoReviewAction(request(native.agent, ToolCallId('native-read')))
    expect(nestedAction).toBeDefined()
    expect(nativeAction).toBeDefined()
    expect(nestedAction?.fingerprint).toBe(nativeAction?.fingerprint)
  })

  it('binds provider, actual cwd, original workspace, and inner arguments to the fingerprint', async () => {
    await using f = await fixture()
    nativeCall(f.session)
    start(f.session)
    const directory = { cwd: join(workspaceRoot, 'actual-cwd'), workspaceRoot }
    const original = resolveAutoReviewAction(request(f.agent), directory)
    expect(original).toMatchObject({ ...directory, provider: 'openai-codex' })
    expect(resolveAutoReviewAction(request(f.agent), { ...directory, cwd: workspaceRoot })?.fingerprint).not.toBe(original?.fingerprint)
    expect(resolveAutoReviewAction(request(f.agent), { ...directory, workspaceRoot: join(workspaceRoot, 'other-workspace') })?.fingerprint).not.toBe(original?.fingerprint)
    start(f.session, { subCallId: ToolCallId('different-arguments'), arguments: { file_path: 'different.md' } })
    expect(resolveAutoReviewAction(request(f.agent, ToolCallId('different-arguments')), directory)?.fingerprint).not.toBe(original?.fingerprint)
    f.session.append('request/header', { header: { config: { provider: 'other-provider', model: 'fixture' } }, reason: 'change' })
    const changedProvider = resolveAutoReviewAction(request(f.agent), directory)
    expect(changedProvider?.provider).toBe('other-provider')
    expect(changedProvider?.fingerprint).not.toBe(original?.fingerprint)
  })

  it('reads inherited Session events without rewriting the event format or the log', async () => {
    await using source = await fixture()
    nativeCall(source.session)
    const logged = start(source.session)
    settle(source.session, logged.data)
    const seed = source.session.snapshotEvents()
    await using inherited = await fixture({ seed })
    const before = inherited.session.snapshotEvents()
    expect(resolveAutoReviewAction(request(inherited.agent))).toEqual(resolveAutoReviewAction(request(source.agent)))
    expect(inherited.session.snapshotEvents()).toBe(before)
    expect(before.slice(0, seed.length)).toEqual(seed)
  })

  it('accepts exactly the existing 10,000-byte inner JSON budget', async () => {
    await using f = await fixture()
    nativeCall(f.session)
    const overhead = Buffer.byteLength(JSON.stringify({ file_path: '' }), 'utf8')
    const argumentsValue = { file_path: 'a'.repeat(10_000 - overhead) }
    expect(Buffer.byteLength(JSON.stringify(argumentsValue), 'utf8')).toBe(10_000)
    start(f.session, { arguments: argumentsValue })
    expect(resolveAutoReviewAction(request(f.agent))?.arguments).toEqual(argumentsValue)
  })

  it.each([
    ['ASCII', 'a'.repeat(10_000)],
    ['multibyte UTF-8', '字'.repeat(4_000)],
  ])('delegates oversized %s inner JSON', async (_label, value) => {
    await using f = await fixture()
    nativeCall(f.session)
    start(f.session, { arguments: { file_path: value } })
    expect(resolveAutoReviewAction(request(f.agent))).toBeUndefined()
  })

  it('delegates inner objects that cannot be serialized within the JSON stack limit', async () => {
    await using f = await fixture()
    nativeCall(f.session)
    let argumentsValue: Record<string, unknown> = {}
    for (let depth = 0; depth < 20_000; depth++) argumentsValue = { nested: argumentsValue }
    start(f.session, { arguments: argumentsValue })
    expect(resolveAutoReviewAction(request(f.agent))).toBeUndefined()
  })

  it.each([null, [], ['read'], 'string', 42, true])('delegates non-object inner arguments %j', async argumentsValue => {
    await using f = await fixture()
    nativeCall(f.session)
    start(f.session, { arguments: argumentsValue })
    expect(resolveAutoReviewAction(request(f.agent))).toBeUndefined()
  })

  it('delegates missing call ids and unmatched sub-call ids', async () => {
    await using f = await fixture()
    nativeCall(f.session)
    start(f.session)
    expect(resolveAutoReviewAction({ agent: f.agent, toolName: 'read' })).toBeUndefined()
    expect(resolveAutoReviewAction(request(f.agent, ToolCallId('missing-start')))).toBeUndefined()
  })

  it('does not accept a settle-only dispatch as approval evidence', async () => {
    await using f = await fixture()
    nativeCall(f.session)
    settle(f.session, dispatch())
    expect(resolveAutoReviewAction(request(f.agent))).toBeUndefined()
  })

  it.each(['start', 'settle'] as const)('delegates native and PTC %s call-id collisions', async kind => {
    await using f = await fixture()
    nativeCall(f.session)
    nativeCall(f.session, { callId: subCallId, name: 'read', arguments: '{"file_path":"native.md"}' })
    if (kind === 'start') start(f.session)
    else settle(f.session, dispatch())
    expect(resolveAutoReviewAction(request(f.agent))).toBeUndefined()
  })

  it.each(['identical', 'different'] as const)('delegates %s repeated starts for the same sub-call id', async kind => {
    await using f = await fixture()
    nativeCall(f.session)
    start(f.session)
    start(f.session, kind === 'identical' ? {} : { arguments: { file_path: 'other.md' }, name: 'write' })
    expect(resolveAutoReviewAction(request(f.agent))).toBeUndefined()
  })

  it('delegates a start whose root is absent rather than using its parent or another run_code', async () => {
    await using f = await fixture()
    nativeCall(f.session, { callId: ToolCallId('parent-only') })
    start(f.session, { parentCallId: ToolCallId('parent-only') })
    expect(resolveAutoReviewAction(request(f.agent))).toBeUndefined()
  })

  it.each(['before-start', 'after-start'] as const)('delegates repeated roots even when the duplicate is %s', async position => {
    await using f = await fixture()
    nativeCall(f.session)
    if (position === 'before-start') nativeCall(f.session)
    start(f.session)
    if (position === 'after-start') nativeCall(f.session)
    expect(resolveAutoReviewAction(request(f.agent))).toBeUndefined()
  })

  it('delegates roots that are not run_code', async () => {
    await using f = await fixture()
    nativeCall(f.session, { name: 'read' })
    start(f.session)
    expect(resolveAutoReviewAction(request(f.agent))).toBeUndefined()
  })

  it('delegates a root logged after its start', async () => {
    await using f = await fixture()
    start(f.session)
    nativeCall(f.session)
    expect(resolveAutoReviewAction(request(f.agent))).toBeUndefined()
  })

  it('delegates an inner name mismatch instead of substituting the requested name', async () => {
    await using f = await fixture()
    nativeCall(f.session)
    start(f.session, { name: 'write' })
    expect(resolveAutoReviewAction(request(f.agent))).toBeUndefined()
    expect(resolveAutoReviewAction(request(f.agent, rootCallId))).toBeUndefined()
  })

  it.each(['malformed-json', 'oversized-json', 'name-mismatch', 'duplicate-native'] as const)('preserves native %s rejection', async kind => {
    await using f = await fixture()
    nativeCall(f.session, {
      callId: subCallId, name: kind === 'name-mismatch' ? 'write' : 'read',
      arguments: kind === 'malformed-json' ? '{' : JSON.stringify({ file_path: kind === 'oversized-json' ? 'a'.repeat(10_000) : 'native.md' }),
    })
    if (kind === 'duplicate-native') nativeCall(f.session, { callId: subCallId, name: 'read', arguments: '{}' })
    expect(resolveAutoReviewAction(request(f.agent))).toBeUndefined()
  })
})
