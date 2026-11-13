/** Subscriber-owned view of the Session list's own usage projection values. */
import { requestJson } from './request-json.ts'
import { asRecord, usageLedgerOf } from './usage-ledger.ts'
import type { DayTotals, LocalUsageData, LocalUsageSnapshot, LocalUsageSource } from './usage-ledger.ts'

/** Owner-only warm-up trigger: starts the Host's one-pass projection backfill. */
const BACKFILL_ROUTE = '/api/dsh-codex-connect/local-usage/backfill'
/** Owner-only warm-up status: data only, never starts a pass. */
const STATUS_ROUTE = BACKFILL_ROUTE + '/status'
/** Lower bound for a Host-supplied cadence; timers have a signed 32-bit maximum. */
const MIN_POLL_MS = 100
const MAX_POLL_MS = 2_147_483_647

/** The Host's pass lifecycle for the on-demand projection warm-up. */
type WarmupState = 'idle' | 'running' | 'done' | 'partial' | 'failed'

const WARMUP_STATES = new Set<string>(['idle', 'running', 'done', 'partial', 'failed'])

/** One readable status response. */
interface WarmupStatus {
  state: WarmupState
  pollMs: number
}

/** The Session-list observable this store reads. */
export interface LocalUsageListFace {
  getSnapshot(): unknown
  subscribe(listener: () => void): () => void
}

/** The Session services this store observes; the client root context supplies them. */
export interface LocalUsageSessionsFace {
  readonly list: LocalUsageListFace
  refresh?(): Promise<unknown>
}

/** The client context fields this store reads. */
export interface LocalUsageContext {
  readonly sessions?: LocalUsageSessionsFace
}

/** @param value - Status payload field. @returns Whether it names a pass lifecycle state. */
function isWarmupState(value: unknown): value is WarmupState {
  return typeof value === 'string' && WARMUP_STATES.has(value)
}

/**
 * @param value - Warm-up status response body.
 * @returns The validated pass state and the Host-configured polling cadence.
 */
function warmupStatusOf(value: unknown): WarmupStatus {
  const record = asRecord(value)
  const state = record?.state
  const pollMs = record?.pollMs
  if (!isWarmupState(state) || typeof pollMs !== 'number' || !Number.isFinite(pollMs) || pollMs <= 0) {
    throw new Error('Local usage warm-up returned an invalid status')
  }
  return { state, pollMs }
}

/** @param value - Warm-up trigger response body. @returns Its pass state, when reported. */
function warmupStateOf(value: unknown): WarmupState | undefined {
  const state = asRecord(value)?.state
  return isWarmupState(state) ? state : undefined
}

/** An abortable polling delay; disposal clears the timer and its listener together. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const finish = (): void => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

/** @param pollMs - Host cadence. @returns The cadence bounded for a browser timer. */
function boundedPollMs(pollMs: number): number {
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, pollMs))
}

/** @param ledger - Merged ledger. @returns Frozen display data, or null when nothing was recorded. */
function frozenLedger(ledger: LocalUsageData): LocalUsageData | null {
  const days: Record<string, DayTotals> = {}
  let recorded = 0
  for (const [day, totals] of Object.entries(ledger.days)) {
    days[day] = Object.freeze({ tokens: totals.tokens, requests: totals.requests, sessions: totals.sessions })
    recorded++
  }
  if (recorded === 0) return null
  return Object.freeze({ ...(ledger.timeZone === undefined ? {} : { timeZone: ledger.timeZone }), days: Object.freeze(days) })
}

/** @param left - Displayed ledger. @param right - Rebuilt ledger. @returns Whether both carry the same figures. */
function sameLedger(left: LocalUsageData, right: LocalUsageData): boolean {
  if (left.timeZone !== right.timeZone) return false
  const days = Object.keys(left.days)
  if (days.length !== Object.keys(right.days).length) return false
  for (const day of days) {
    const before = left.days[day]
    const after = right.days[day]
    if (before === undefined || after === undefined) return false
    if (before.tokens !== after.tokens || before.requests !== after.requests || before.sessions !== after.sessions) return false
  }
  return true
}

/**
 * Merge the per-Session `codexConnectUsage` values the Session list already carries,
 * then drive the Host's one-pass warm-up so stored Sessions acquire their row.
 *
 * The ledger is always rebuilt from the list snapshot, so known figures stay
 * visible while a pass runs and survive a failed re-pull. Polling, timers, and
 * requests exist only while the store has subscribers.
 */
export class LocalUsageStore implements LocalUsageSource {
  private current: LocalUsageSnapshot = Object.freeze({ state: 'loading', data: null })
  private data: LocalUsageData | null = null
  private readonly listeners = new Set<() => void>()
  private detachList: (() => void) | undefined
  private controller: AbortController | undefined
  private work: Promise<void> | undefined
  private lastListSnapshot: unknown
  private synced = false
  private settled = false
  private restart = false
  private disposed = false

  /** @param ctx - client root context supplying the Session list and its refresh. */
  constructor(private readonly ctx: LocalUsageContext) {}

  /** @param listener - Called after a new immutable snapshot is published. @returns The subscription disposer. */
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    if (this.listeners.size === 1) this.activate()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.deactivate()
    }
  }

  /** @returns The same snapshot until merged usage or the pass state changes. */
  readonly snapshot = (): LocalUsageSnapshot => this.current

  /** Re-run a failed warm-up observation; the one-pass Host never starts a second pass. */
  readonly retry = (): void => {
    if (this.disposed || this.listeners.size === 0) return
    this.settled = false
    this.restart = false
    this.publish(this.data === null ? 'loading' : 'ready')
    this.syncFromList()
    this.start()
    this.controller?.abort()
  }

  /** Abort requests, clear polling, and wait for the owned observation to settle. */
  async dispose(): Promise<void> {
    this.disposed = true
    this.listeners.clear()
    this.detachList?.()
    this.detachList = undefined
    const work = this.work
    this.controller?.abort()
    if (work === undefined) return
    try {
      await work
    } catch (_error) {
      // The observation reports its own request failures; disposal only waits for it.
    }
  }

  /** @returns The Session face, when the Host generation supplies one. */
  private sessions(): LocalUsageSessionsFace | undefined {
    try {
      return this.ctx.sessions
    } catch (_error) {
      // A proxy for an absent service must not fail the usage surface.
      return undefined
    }
  }

  private activate(): void {
    const list = this.sessions()?.list
    if (list !== undefined) this.detachList = list.subscribe(() => { this.syncFromList() })
    this.syncFromList()
    if (!this.settled) this.publish(this.data === null ? 'loading' : 'ready')
    this.start()
  }

  private deactivate(): void {
    this.detachList?.()
    this.detachList = undefined
    this.synced = false
    this.lastListSnapshot = undefined
    // A later subscription re-observes; the Host pass itself never restarts.
    this.settled = false
    this.restart = false
    this.controller?.abort()
    this.publish(this.data === null ? 'loading' : 'ready')
  }

  /**
   * Rebuild the merged ledger from the list snapshot.
   * @returns Whether new figures were published.
   */
  private syncFromList(): boolean {
    const list = this.sessions()?.list
    if (list === undefined) return false
    const snapshot = list.getSnapshot()
    if (this.synced && snapshot === this.lastListSnapshot) return false
    this.lastListSnapshot = snapshot
    this.synced = true
    const data = frozenLedger(usageLedgerOf(snapshot))
    // An empty list is not evidence that recorded days disappeared.
    if (data === null) return false
    if (this.data !== null && sameLedger(this.data, data)) return false
    this.data = data
    this.publish(this.current.state, this.current.failure)
    return true
  }

  private publish(state: LocalUsageSnapshot['state'], failure?: LocalUsageSnapshot['failure']): void {
    const next: LocalUsageSnapshot = Object.freeze({
      state,
      data: this.data,
      ...(failure === undefined ? {} : { failure }),
    })
    if (next.state === this.current.state && next.data === this.current.data && next.failure === this.current.failure) return
    this.current = next
    for (const listener of [...this.listeners]) listener()
  }

  private start(): void {
    if (this.disposed || this.listeners.size === 0 || this.settled) return
    // An aborted observation still unwinds; the next cycle starts once it settles.
    if (this.controller !== undefined) {
      this.restart = true
      return
    }
    const controller = new AbortController()
    this.controller = controller
    // The observation converts every failure into a published state.
    const work = this.observe(controller.signal).catch(() => { /* observe publishes its own failures */ })
    this.work = work
    void work.then(() => {
      if (this.controller !== controller) return
      this.controller = undefined
      this.work = undefined
      if (this.restart && !this.disposed && this.listeners.size > 0) {
        this.restart = false
        this.start()
      }
    })
  }

  /**
   * Observe the Host's one-pass warm-up, then re-pull the list that carries the folded rows.
   * @param signal - Cancellation owned by the subscription cycle.
   * @returns Resolution once the pass settled or the observation stopped.
   */
  private async observe(signal: AbortSignal): Promise<void> {
    try {
      let status = await this.readStatus(signal)
      if (signal.aborted) return
      if (status.state === 'idle') {
        const started = await this.trigger(signal)
        if (signal.aborted) return
        status = started === undefined || started === 'idle'
          ? await this.readStatus(signal)
          : { state: started, pollMs: status.pollMs }
        if (signal.aborted) return
      }
      while (status.state === 'running') {
        await pause(boundedPollMs(status.pollMs), signal)
        if (signal.aborted) return
        status = await this.readStatus(signal)
        if (signal.aborted) return
      }
      this.settled = true
      // A pass that never started leaves nothing new to re-pull.
      if (status.state !== 'idle') await this.refreshSessions()
      if (signal.aborted) return
      this.publish(status.state === 'failed' ? 'failed' : 'ready')
    } catch (_error) {
      if (signal.aborted) return
      // An absent or unreachable route leaves the ledger the list already carries.
      this.publish('unavailable', 'request')
    }
  }

  /** @param signal - Cancellation owned by the subscription cycle. @returns The validated Host status. */
  private async readStatus(signal: AbortSignal): Promise<WarmupStatus> {
    const { response, value } = await requestJson(STATUS_ROUTE, { method: 'POST', signal })
    if (!response.ok) throw new Error('Local usage warm-up status is unavailable')
    return warmupStatusOf(value)
  }

  /** @param signal - Cancellation owned by the subscription cycle. @returns The pass state the trigger reported. */
  private async trigger(signal: AbortSignal): Promise<WarmupState | undefined> {
    const { response, value } = await requestJson(BACKFILL_ROUTE, { method: 'POST', signal })
    if (!response.ok) throw new Error('Local usage warm-up could not start')
    return warmupStateOf(value)
  }

  /** Re-pull the Session list so the freshly folded projection rows reach this browser. */
  private async refreshSessions(): Promise<void> {
    const sessions = this.sessions()
    if (sessions === undefined || typeof sessions.refresh !== 'function') return
    try {
      await sessions.refresh()
    } catch (_error) {
      // A failed re-pull keeps the rows already displayed.
      return
    }
    this.syncFromList()
  }
}
