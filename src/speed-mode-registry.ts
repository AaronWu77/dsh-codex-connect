/** Process-local revisioned speed choices with no credentials or entitlement cache. */
import { randomUUID } from 'node:crypto'
import { isOpenAICodexRouteId } from './account-route-id.ts'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionStore } from '@deepseek-ai/dsh-session'
import { FastModeRegistry, isFastModeSessionId, OPENAI_CODEX_FAST_MODE_MAX_SESSIONS } from './fast-mode.ts'
import { OpenAICodexSpeedError, supportsOpenAICodexUltrafast } from './speed-mode-contract.ts'
import type { ConversationSpeedState, OpenAICodexSpeedMode } from './speed-mode-contract.ts'

/** Scope attributed by the Host, never accepted from a browser account id. */
export interface ConversationSpeedScope {
  readonly workspace: string
  readonly accountKey: string | undefined
  readonly provider: string
  readonly model: string
}
interface Control {
  readonly generation: string
  revision: number
  mode: OpenAICodexSpeedMode
  expired: boolean
  readonly scope: ConversationSpeedScope
}
/** Immutable request selection, captured before authentication suspends. */
export interface CapturedConversationSpeed {
  readonly mode: OpenAICodexSpeedMode
  readonly scope?: ConversationSpeedScope
  expired?: boolean
}
const sameScope = (a: ConversationSpeedScope, b: ConversationSpeedScope): boolean => a.workspace === b.workspace
  && a.accountKey === b.accountKey && a.provider === b.provider && a.model === b.model

/** Explicit Standard/Fast commands remain compatible with the legacy boolean registry. */
export class ConversationSpeedRegistry extends FastModeRegistry {
  private readonly workspace = randomUUID()
  private accountRevision = 0
  private readonly controls = new Map<string, Control>()
  private readonly explicitCommands = new Map<string, true>()
  private readonly startup = new Map<string, { workspace: string; expired: boolean }>()

  constructor(private readonly limit = OPENAI_CODEX_FAST_MODE_MAX_SESSIONS,
    private readonly selectionKey?: (sessionId: string) => string | undefined,
    private readonly hasStarted?: (sessionId: string) => boolean,
    private readonly onStartupFinished?: (sessionId: string) => void) { super(limit) }

  override set(sessionId: unknown, enabled: boolean): void {
    if (!isFastModeSessionId(sessionId)) throw new TypeError('Invalid speed session')
    this.markExplicit(sessionId)
    super.set(sessionId, enabled)
    this.controls.delete(sessionId); this.startup.delete(sessionId)
  }
  override delete(sessionId: unknown): void {
    if (isFastModeSessionId(sessionId)) this.set(sessionId, false)
  }
  override clear(): void { super.clear(); this.controls.clear(); this.startup.clear(); this.explicitCommands.clear() }

  private markExplicit(sessionId: string): void {
    if (this.hasStarted?.(sessionId) === true) return
    if (!this.explicitCommands.has(sessionId) && this.explicitCommands.size >= this.limit) throw new OpenAICodexSpeedError('SPEED_STATE_CAPACITY')
    this.explicitCommands.set(sessionId, true)
  }

  /** Drop only the pre-creation race marker after the startup owner has consumed its choice. */
  finishStartup(sessionId: string): void {
    this.explicitCommands.delete(sessionId)
    this.onStartupFinished?.(sessionId)
  }

  /** Committed account changes invalidate paid choices, including an away/back change. */
  invalidateAccountSelections(): void {
    this.accountRevision++
    for (const control of this.controls.values()) if (control.mode === 'ultrafast') { control.expired = true; control.revision++ }
    for (const pending of this.startup.values()) pending.expired = true
  }
  /** A committed model command retires its paid choice without changing legacy Fast. */
  invalidateModelSelection(sessionId: string): void {
    const control = this.controls.get(sessionId)
    if (control?.mode === 'ultrafast') { control.expired = true; control.revision++ }
    else this.controls.delete(sessionId)
    const pending = this.startup.get(sessionId)
    if (pending !== undefined) pending.expired = true
  }

  /** Current plugin, account and live Host selection incarnation. */
  workspaceFor(sessionId: string): string {
    return this.workspace + ':' + this.accountRevision + ':' + (this.selectionKey?.(sessionId) ?? 'unavailable')
  }

  /** Seed only new-session intent; route/account attribution waits for admitted routing. */
  seedStartupDefault(sessionId: string, mode: OpenAICodexSpeedMode): void {
    if (!isFastModeSessionId(sessionId)) throw new TypeError('Invalid speed session')
    if (this.explicitCommands.has(sessionId)) return
    if (mode !== 'ultrafast') { super.set(sessionId, mode === 'fast'); return }
    if (!this.startup.has(sessionId) && this.startup.size >= this.limit) throw new OpenAICodexSpeedError('SPEED_STATE_CAPACITY')
    this.startup.set(sessionId, { workspace: this.workspaceFor(sessionId), expired: false })
  }

  /** Resolve one startup intent against the admitted route; unsupported intent fails visibly. */
  async applyStartupDefault(sessionId: string, route: { provider: string; model: string },
    resolveAccountKey: (provider: string, signal: AbortSignal) => Promise<string | undefined>, signal: AbortSignal): Promise<void> {
    const pending = this.startup.get(sessionId)
    if (pending === undefined || !isOpenAICodexRouteId(route.provider)) return
    signal.throwIfAborted()
    if (pending.expired || pending.workspace !== this.workspaceFor(sessionId)) throw new OpenAICodexSpeedError('ULTRAFAST_SELECTION_EXPIRED')
    if (!supportsOpenAICodexUltrafast(route.provider, route.model)) throw new OpenAICodexSpeedError('ULTRAFAST_MODEL_UNSUPPORTED')
    let accountKey: string | undefined
    try { accountKey = await resolveAccountKey(route.provider, signal) } catch (error) {
      if (this.startup.get(sessionId) !== pending && !signal.aborted) return
      throw error
    }
    signal.throwIfAborted()
    if (this.startup.get(sessionId) !== pending) return
    if (pending.expired || pending.workspace !== this.workspaceFor(sessionId)) throw new OpenAICodexSpeedError('ULTRAFAST_SELECTION_EXPIRED')
    if (accountKey === undefined) throw new OpenAICodexSpeedError('ULTRAFAST_SIGN_IN_REQUIRED')
    const scope = { ...route, accountKey, workspace: pending.workspace }
    const state = this.readSpeed(sessionId, scope)
    this.selectSpeed(sessionId, scope, state.generation, state.revision, 'ultrafast')
  }

  /** Read current choices without authenticating or claiming entitlement. */
  readSpeed(sessionId: string, scope: ConversationSpeedScope): ConversationSpeedState {
    if (!isFastModeSessionId(sessionId)) throw new TypeError('Invalid speed session')
    let control = this.controls.get(sessionId)
    if (control === undefined || !sameScope(control.scope, scope)) {
      const retiredPaidChoice = control?.mode === 'ultrafast'
      control = { generation: randomUUID(), revision: 0, mode: retiredPaidChoice ? 'ultrafast' : super.isEnabled(sessionId) ? 'fast' : 'standard',
        expired: retiredPaidChoice, scope: { ...scope } }
    } else if (control.mode !== 'ultrafast') control.mode = super.isEnabled(sessionId) ? 'fast' : 'standard'
    const pending = this.startup.get(sessionId)
    if (pending !== undefined) { control.mode = 'ultrafast'; control.expired ||= pending.expired }
    if (!this.controls.has(sessionId) && this.controls.size >= this.limit) {
      const evictable = [...this.controls].find(([, entry]) => entry.mode !== 'ultrafast' && !entry.expired)
      if (evictable === undefined) throw new OpenAICodexSpeedError('SPEED_STATE_CAPACITY')
      this.controls.delete(evictable[0])
    }
    this.controls.delete(sessionId)
    this.controls.set(sessionId, control)
    return this.snapshot(sessionId, control)
  }

  /** Compare-and-set a command once; duplicate/stale commands never replay. */
  selectSpeed(sessionId: string, scope: ConversationSpeedScope, generation: string, revision: number, mode: OpenAICodexSpeedMode): ConversationSpeedState {
    const control = this.controls.get(sessionId)
    if (control === undefined || !sameScope(control.scope, scope) || scope.workspace !== this.workspaceFor(sessionId)
      || control.generation !== generation || control.revision !== revision) throw new OpenAICodexSpeedError('SPEED_SELECTION_STALE')
    if (mode === 'ultrafast') {
      if (!supportsOpenAICodexUltrafast(scope.provider, scope.model)) throw new OpenAICodexSpeedError('ULTRAFAST_MODEL_UNSUPPORTED')
      if (scope.accountKey === undefined) throw new OpenAICodexSpeedError('ULTRAFAST_SIGN_IN_REQUIRED')
      if (this.selectionKey !== undefined && this.selectionKey(sessionId) === undefined) throw new OpenAICodexSpeedError('ULTRAFAST_SELECTION_UNAVAILABLE')
    }
    this.markExplicit(sessionId)
    this.startup.delete(sessionId)
    super.set(sessionId, mode === 'fast')
    control.mode = mode
    control.expired = false
    control.revision++
    return this.snapshot(sessionId, control)
  }

  /** Legacy boolean GET cannot represent an explicit or pending Ultrafast choice. */
  isUltrafastSelected(sessionId: unknown): boolean {
    return typeof sessionId === 'string' && (this.controls.get(sessionId)?.mode === 'ultrafast' || this.startup.has(sessionId))
  }

  /** Capture once for a request; later manual speed choices do not mutate it. */
  captureSpeed(sessionId: string | undefined): CapturedConversationSpeed {
    if (sessionId === undefined) return { mode: 'standard' }
    if (super.isEnabled(sessionId)) return { mode: 'fast' }
    const control = this.controls.get(sessionId)
    if (control?.mode === 'ultrafast') return { mode: 'ultrafast', scope: { ...control.scope }, expired: control.expired }
    return { mode: this.startup.has(sessionId) ? 'ultrafast' : 'standard' }
  }

  /** Recheck the frozen request against its actual authenticated account and live incarnation. */
  confirmCapturedSpeed(sessionId: string | undefined, captured: CapturedConversationSpeed, scope: ConversationSpeedScope): OpenAICodexSpeedMode {
    if (captured.mode !== 'ultrafast') return captured.mode
    if (captured.expired || sessionId === undefined || captured.scope === undefined || !sameScope(captured.scope, scope)
      || scope.workspace !== this.workspaceFor(sessionId) || !supportsOpenAICodexUltrafast(scope.provider, scope.model)) {
      captured.expired = true
      throw new OpenAICodexSpeedError('ULTRAFAST_SELECTION_EXPIRED')
    }
    return 'ultrafast'
  }

  private snapshot(sessionId: string, control: Control): ConversationSpeedState {
    return { generation: control.generation, revision: control.revision, mode: control.mode,
      provider: control.scope.provider, model: control.scope.model,
      modelSupported: supportsOpenAICodexUltrafast(control.scope.provider, control.scope.model), eligibility: 'unknown',
      selectionExpired: control.expired, hasAccount: control.scope.accountKey !== undefined, selectionAvailable: this.selectionKey === undefined || this.selectionKey(sessionId) !== undefined }
  }
}

/** Observe committed live Host selection revisions; a view unmount does not invalidate choices. */
export function createConversationSpeedRegistry(ctx: Context): ConversationSpeedRegistry {
  const selections = new WeakMap<Session, { generation: string; revision: number }>()
  const started = new WeakSet<Session>()
  const liveSession = (sessionId: string): Session | undefined => {
    const sessions = ctx.get('sessions') as Partial<SessionStore> | undefined
    return sessions?.get?.(SessionId(sessionId))
  }
  const entry = (session: Session) => {
    let current = selections.get(session)
    if (current === undefined) { current = { generation: randomUUID(), revision: 0 }; selections.set(session, current) }
    return current
  }
  const registry = new ConversationSpeedRegistry(OPENAI_CODEX_FAST_MODE_MAX_SESSIONS, sessionId => {
    const session = liveSession(sessionId)
    if (session === undefined) return undefined
    const current = entry(session)
    return current.generation + ':' + current.revision
  }, sessionId => {
    const session = liveSession(sessionId)
    return session !== undefined && started.has(session)
  }, sessionId => {
    const session = liveSession(sessionId)
    if (session !== undefined) started.add(session)
  })
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'model/selection' || liveSession(session.id) !== session) return
    entry(session).revision++
    registry.invalidateModelSelection(session.id)
  }, { global: true })
  ctx.effect(() => () => registry.clear(), 'dsh-codex-connect: conversation speed state')
  return registry
}
