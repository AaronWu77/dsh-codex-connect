/**
 * The cross-plugin quota face of the signed-in Codex account.
 *
 * The account store polls ChatGPT's usage endpoint for the plugin's own
 * settings UI; this module reshapes that snapshot into one stable service so
 * other plugins (the dsh-context panel) can render the rolling windows without
 * duplicating OAuth handling.
 *
 * A poll that reports nothing — still loading, signed out, a failed request —
 * must never blank a consumer's cells: the last real figure stands until it is
 * older than {@link STALE_HOLD_MS}. Only a value-equivalent snapshot is
 * swallowed entirely, so the store republishing the same numbers every 60s
 * does not re-render anyone.
 */
import type { AccountSnapshot, OpenAICodexAccountStore } from './account-store.ts'
import type { OpenAICodexUsage } from '../usage.ts'

/** How long the last reported quota survives refreshes that report nothing. */
const STALE_HOLD_MS = 5 * 60_000

/** One rolling quota window, flattened across the server's buckets. */
export interface CodexQuotaWindow {
  /** Stable server bucket id the window belongs to. */
  readonly bucketId: string
  /** Optional server-provided bucket name. */
  readonly bucketName?: string
  /** Percent still available in this window. */
  readonly remainingPercent: number
  /** Server-declared rolling-window length in seconds. */
  readonly windowSeconds: number
  /** Server-declared reset time as Unix seconds, when supplied. */
  readonly resetAt?: number
}

/** Optional prepaid credits reported for the account. */
export interface CodexQuotaCredits {
  /** Whether the balance is unmetered. */
  readonly unlimited: boolean
  /** Exact provider-formatted balance when finite and disclosed. */
  readonly balance?: string
}

/** The quota snapshot the service exposes. */
export interface CodexQuota {
  /** Every rolling window across buckets, in the server's order. */
  readonly windows: readonly CodexQuotaWindow[]
  /** Prepaid credits, when the server disclosed them. */
  readonly credits?: CodexQuotaCredits
}

/** The `codexQuota` client service. */
export interface CodexQuotaService {
  /** Latest known snapshot, or null before the first report and after the hold expires. */
  snapshot(): CodexQuota | null
  /** Observe snapshot changes. */
  subscribe(listener: () => void): () => void
}

/** The signed-in usage, or null for every other account state. */
function usageOf(snapshot: AccountSnapshot): OpenAICodexUsage | null {
  const status = snapshot.status
  return status.status === 'signed-in' ? status.usage : null
}

/** Flatten one usage payload, or null when it carries nothing renderable. */
function quotaOf(usage: OpenAICodexUsage | null): CodexQuota | null {
  if (usage === null) return null
  const windows: CodexQuotaWindow[] = []
  for (const bucket of usage.rateLimits) {
    for (const window of bucket.windows) {
      windows.push({
        bucketId: bucket.id,
        ...(bucket.name === undefined ? {} : { bucketName: bucket.name }),
        remainingPercent: window.remainingPercent,
        windowSeconds: window.windowSeconds,
        ...(window.resetAt === undefined ? {} : { resetAt: window.resetAt }),
      })
    }
  }
  const credits = usage.credits
  if (windows.length === 0 && credits === undefined) return null
  return {
    windows,
    ...(credits === undefined ? {} : { credits: { ...credits } }),
  }
}

/** Whether two snapshots carry the same figures (identity is irrelevant). */
function sameQuota(left: CodexQuota, right: CodexQuota): boolean {
  if (left.windows.length !== right.windows.length) return false
  for (let index = 0; index < left.windows.length; index += 1) {
    const a = left.windows[index]!
    const b = right.windows[index]!
    if (a.bucketId !== b.bucketId
      || a.remainingPercent !== b.remainingPercent
      || a.windowSeconds !== b.windowSeconds
      || a.resetAt !== b.resetAt) return false
  }
  const before = left.credits
  const after = right.credits
  if ((before === undefined) !== (after === undefined)) return false
  if (before === undefined || after === undefined) return true
  return before.unlimited === after.unlimited && before.balance === after.balance
}

/**
 * Bind the account store as the quota service.
 * @param account - the plugin instance's account store.
 * @returns the service published as `codexQuota`.
 */
export function createCodexQuotaService(account: OpenAICodexAccountStore): CodexQuotaService {
  const listeners = new Set<() => void>()
  let current: CodexQuota | null = null
  let currentAt = 0
  let unsubscribeAccount: (() => void) | undefined
  let staleTimer: ReturnType<typeof setTimeout> | undefined

  const notify = (): void => { for (const listener of listeners) listener() }
  const clearTimer = (): void => {
    clearTimeout(staleTimer)
    staleTimer = undefined
  }
  /** Drop a held figure once it is older than the hold window. */
  const armTimer = (): void => {
    clearTimer()
    if (current === null) return
    const left = STALE_HOLD_MS - (Date.now() - currentAt)
    staleTimer = setTimeout(() => {
      staleTimer = undefined
      if (current === null) return
      if (Date.now() - currentAt < STALE_HOLD_MS) { armTimer(); return }
      current = null
      notify()
    }, Math.max(0, left))
  }
  const sync = (): void => {
    const next = quotaOf(usageOf(account.getSnapshot()))
    if (next === null) { armTimer(); return }
    currentAt = Date.now()
    armTimer()
    if (current !== null && sameQuota(current, next)) return
    current = next
    notify()
  }
  return {
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      // The store polls while it has listeners, so the service attaches on the
      // first consumer and detaches with the last one.
      if (unsubscribeAccount === undefined) unsubscribeAccount = account.subscribe(sync)
      sync()
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0 || unsubscribeAccount === undefined) return
        unsubscribeAccount()
        unsubscribeAccount = undefined
        clearTimer()
      }
    },
  }
}
