/**
 * The cross-plugin quota face of every signed-in Codex account.
 *
 * The account store polls ChatGPT's usage endpoint for the plugin's own
 * settings UI; this module reshapes that snapshot into one stable service so
 * other plugins (the dsh-context panel) can render every stored account's
 * rolling windows without duplicating OAuth handling.
 *
 * The active account keeps the store's polled snapshot. Every other stored
 * account is read on the Host through the plugin's quota route, because the
 * browser cannot authenticate as them; that read runs only while someone
 * subscribes, keeps one request in flight, and stops with the last subscriber.
 *
 * A poll that reports nothing — still loading, signed out, a failed request —
 * must never blank a consumer's cells: each account keeps its last real figure
 * until it is older than {@link STALE_HOLD_MS}. Only a value-equivalent
 * snapshot is swallowed entirely, so the same numbers do not re-render anyone.
 */
import type { AccountSnapshot, AccountStatus, OpenAICodexAccountStore } from './account-store.ts'
import { decodeOpenAICodexUsage } from './account-store.ts'
import type { OpenAICodexResetCredits, OpenAICodexUsage } from '../usage.ts'
import {
  OPENAI_CODEX_ACCOUNT_KEY_PATTERN,
  OPENAI_CODEX_ACCOUNT_LIMIT,
  openAICodexAccountLabel,
} from '../account-contract.ts'
import { OPENAI_CODEX_QUOTA_PATH } from '../quota-contract.ts'
import { requestJson } from './request-json.ts'

/** How long the last reported quota survives refreshes that report nothing. */
const STALE_HOLD_MS = 5 * 60_000

/** How often the Host is asked for the other accounts' figures while observed. */
const QUOTA_REFRESH_MS = 60_000

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

/** One signed-in account's quota figures. */
export interface CodexQuotaAccount {
  /** Stable account key (acct_...). */
  readonly accountKey: string
  /**
   * Human caption for a picker or cell header: the account's display-only
   * ChatGPT name, the same one the settings card shows.
   */
  readonly label: string
  /** Display-only masked email (`aa••@example.com`) when the credential carried one. */
  readonly maskedEmail?: string
  /** Whether this is the store's active account. */
  readonly active: boolean
  /** The account's rolling windows, server order. */
  readonly windows: readonly CodexQuotaWindow[]
  /** Prepaid credits when the server disclosed them. */
  readonly credits?: CodexQuotaCredits
  /** Rate-limit reset cards when the server disclosed them. */
  readonly resetCredits?: OpenAICodexResetCredits
  /** Unix ms this account's published figures were last refreshed. */
  readonly fetchedAt?: number
  /** True when this round could not read the account; its last real figures stand. */
  readonly unavailable?: boolean
}

/** The quota snapshot the service exposes. */
export interface CodexQuota {
  /** The active account's rolling windows, in the server's order. */
  readonly windows: readonly CodexQuotaWindow[]
  /** Prepaid credits for the active account, when the server disclosed them. */
  readonly credits?: CodexQuotaCredits
  /** Every signed-in account, active first, then document order. */
  readonly accounts?: readonly CodexQuotaAccount[]
  /** Unix ms of the newest successful read across accounts. */
  readonly fetchedAt?: number
}

/** The `codexQuota` client service. */
export interface CodexQuotaService {
  /** Latest known snapshot, or null before the first report and after the hold expires. */
  snapshot(): CodexQuota | null
  /** Observe snapshot changes. */
  subscribe(listener: () => void): () => void
}

/** One account's figures without identity, as held between refreshes. */
interface CodexQuotaFigures {
  readonly windows: readonly CodexQuotaWindow[]
  readonly credits?: CodexQuotaCredits
  readonly resetCredits?: OpenAICodexResetCredits
}

/** One entry decoded from the Host's per-account quota response. */
interface HostQuotaAccount {
  readonly accountKey: string
  readonly usage?: OpenAICodexUsage
  readonly unavailable?: true
}

/** The signed-in usage, or null for every other account state. */
function usageOf(snapshot: AccountSnapshot): OpenAICodexUsage | null {
  const status = snapshot.status
  return status.status === 'signed-in' ? status.usage : null
}

/** Flatten one usage payload, or null when it carries nothing renderable. */
function figuresOf(usage: OpenAICodexUsage | null): CodexQuotaFigures | null {
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
  const resetCredits = usage.resetCredits
  if (windows.length === 0 && credits === undefined && resetCredits === undefined) return null
  return {
    windows,
    ...(credits === undefined ? {} : { credits: { ...credits } }),
    ...(resetCredits === undefined ? {} : { resetCredits: {
      availableCount: resetCredits.availableCount,
      ...(resetCredits.credits === undefined ? {} : { credits: resetCredits.credits.map(credit => ({ ...credit })) }),
    } }),
  }
}

/** Whether a store state could not refresh the active account this round. */
function activeReadFailed(status: AccountStatus): boolean {
  if (status.status === 'error'
    || status.status === 'reauth-required'
    || status.status === 'remote-web-origin-not-trusted') return true
  return status.status === 'signed-in' && status.quotaError !== undefined
}

/** Validate the Host's per-account response before it enters shared state. */
function decodeQuotaPayload(value: unknown): readonly HostQuotaAccount[] | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const entries = (value as Record<string, unknown>)['accounts']
  if (!Array.isArray(entries) || entries.length > OPENAI_CODEX_ACCOUNT_LIMIT) return undefined
  const decoded: HostQuotaAccount[] = []
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined
    const record = entry as Record<string, unknown>
    const accountKey = record['accountKey']
    if (typeof accountKey !== 'string' || !OPENAI_CODEX_ACCOUNT_KEY_PATTERN.test(accountKey)) return undefined
    const unavailable = record['unavailable'] === true
    let usage: OpenAICodexUsage | undefined
    if (record['usage'] !== undefined) {
      try {
        usage = decodeOpenAICodexUsage(record['usage'])
      } catch {
        // A malformed projection rejects the payload; the client keeps its held figures.
        return undefined
      }
    }
    if (usage === undefined && !unavailable) return undefined
    decoded.push({
      accountKey,
      ...(usage === undefined ? {} : { usage }),
      ...(unavailable ? { unavailable: true as const } : {}),
    })
  }
  return decoded
}

/** Whether two window lists carry the same figures. */
function sameWindows(left: readonly CodexQuotaWindow[], right: readonly CodexQuotaWindow[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!
    const b = right[index]!
    if (a.bucketId !== b.bucketId
      || a.remainingPercent !== b.remainingPercent
      || a.windowSeconds !== b.windowSeconds
      || a.resetAt !== b.resetAt) return false
  }
  return true
}

/** Whether two credit projections carry the same figures. */
function sameCredits(left: CodexQuotaCredits | undefined, right: CodexQuotaCredits | undefined): boolean {
  if ((left === undefined) !== (right === undefined)) return false
  if (left === undefined || right === undefined) return true
  return left.unlimited === right.unlimited && left.balance === right.balance
}

/** Whether two reset-credit projections carry the same cards. */
function sameResetCredits(left: OpenAICodexResetCredits | undefined, right: OpenAICodexResetCredits | undefined): boolean {
  if ((left === undefined) !== (right === undefined)) return false
  if (left === undefined || right === undefined) return true
  if (left.availableCount !== right.availableCount) return false
  const before = left.credits ?? []
  const after = right.credits ?? []
  if (before.length !== after.length) return false
  for (let index = 0; index < before.length; index += 1) {
    const a = before[index]!
    const b = after[index]!
    if (a.id !== b.id
      || a.resetType !== b.resetType
      || a.status !== b.status
      || a.grantedAt !== b.grantedAt
      || a.expiresAt !== b.expiresAt
      || a.title !== b.title) return false
  }
  return true
}

/** Whether two account entries carry the same identity, figures, and flags. */
function sameAccount(left: CodexQuotaAccount, right: CodexQuotaAccount): boolean {
  return left.accountKey === right.accountKey
    && left.label === right.label
    && left.active === right.active
    && (left.unavailable ?? false) === (right.unavailable ?? false)
    && sameWindows(left.windows, right.windows)
    && sameCredits(left.credits, right.credits)
    && sameResetCredits(left.resetCredits, right.resetCredits)
}

/**
 * Whether two snapshots carry the same figures. Timestamps are excluded, so a
 * value-equal refresh keeps the published object and notifies nobody.
 */
function sameSnapshot(left: CodexQuota, right: CodexQuota): boolean {
  if (!sameWindows(left.windows, right.windows) || !sameCredits(left.credits, right.credits)) return false
  const before = left.accounts ?? []
  const after = right.accounts ?? []
  if (before.length !== after.length) return false
  for (let index = 0; index < before.length; index += 1) {
    if (!sameAccount(before[index]!, after[index]!)) return false
  }
  return true
}

/**
 * Bind the account store and the Host quota route as the quota service.
 * @param account - the plugin instance's account store.
 * @returns the service published as `codexQuota`.
 */
export function createCodexQuotaService(account: OpenAICodexAccountStore): CodexQuotaService {
  const listeners = new Set<() => void>()
  let current: CodexQuota | null = null
  let activeFigures: CodexQuotaFigures | null = null
  let activeAt = 0
  let activeUnavailable = false
  const otherFigures = new Map<string, { figures: CodexQuotaFigures; at: number }>()
  const unavailableAccounts = new Set<string>()
  let unsubscribeAccount: (() => void) | undefined
  let staleTimer: ReturnType<typeof setTimeout> | undefined
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let pollController: AbortController | undefined

  const notify = (): void => { for (const listener of listeners) listener() }

  const clearStaleTimer = (): void => {
    clearTimeout(staleTimer)
    staleTimer = undefined
  }

  /** Rebuild the published snapshot from the account list and every held figure. */
  const buildSnapshot = (): CodexQuota | null => {
    // No figure anywhere keeps the original "nothing to show yet" signal.
    if (activeFigures === null && otherFigures.size === 0) return null
    const summaries = account.getSnapshot().accounts
    const activeSummary = summaries.find(summary => summary.active)
    const ordered = activeSummary === undefined
      ? [...summaries]
      : [activeSummary, ...summaries.filter(summary => summary !== activeSummary)]
    const accounts = ordered.map((summary): CodexQuotaAccount => {
      const isActive = summary === activeSummary
      const held = isActive ? undefined : otherFigures.get(summary.accountKey)
      const figures = isActive ? activeFigures : held?.figures
      const at = isActive ? activeAt : held?.at
      const unavailable = isActive ? activeUnavailable : unavailableAccounts.has(summary.accountKey)
      return {
        accountKey: summary.accountKey,
        label: summary.displayName,
        ...(summary.maskedEmail === undefined ? {} : { maskedEmail: summary.maskedEmail }),
        active: summary.active,
        windows: figures?.windows ?? [],
        ...(figures?.credits === undefined ? {} : { credits: figures.credits }),
        ...(figures?.resetCredits === undefined ? {} : { resetCredits: figures.resetCredits }),
        ...(at === undefined || at === 0 ? {} : { fetchedAt: at }),
        ...(unavailable ? { unavailable: true } : {}),
      }
    })
    let newest = activeAt
    for (const entry of otherFigures.values()) if (entry.at > newest) newest = entry.at
    return {
      windows: activeFigures?.windows ?? [],
      ...(activeFigures?.credits === undefined ? {} : { credits: activeFigures.credits }),
      ...(summaries.length === 0 ? {} : { accounts }),
      ...(newest === 0 ? {} : { fetchedAt: newest }),
    }
  }

  const publish = (): void => {
    const next = buildSnapshot()
    if (current !== null && next !== null && sameSnapshot(current, next)) return
    if (current === null && next === null) return
    current = next
    notify()
  }

  /** Drop each account's figures once they are older than the hold window. */
  const onStale = (): void => {
    staleTimer = undefined
    const now = Date.now()
    let changed = false
    if (activeFigures !== null && now - activeAt >= STALE_HOLD_MS) {
      activeFigures = null
      activeAt = 0
      activeUnavailable = false
      changed = true
    }
    for (const [key, entry] of [...otherFigures]) {
      if (now - entry.at < STALE_HOLD_MS) continue
      otherFigures.delete(key)
      unavailableAccounts.delete(key)
      changed = true
    }
    armStaleTimer()
    if (changed) publish()
  }

  /** Hold every figure only until its own deadline; the oldest one fires first. */
  const armStaleTimer = (): void => {
    clearStaleTimer()
    let soonest: number | undefined
    const consider = (at: number): void => {
      const left = STALE_HOLD_MS - (Date.now() - at)
      if (soonest === undefined || left < soonest) soonest = left
    }
    if (activeFigures !== null) consider(activeAt)
    for (const entry of otherFigures.values()) consider(entry.at)
    if (soonest === undefined) return
    staleTimer = setTimeout(onStale, Math.max(0, soonest))
  }

  /** Forget figures for accounts the credential document no longer stores. */
  const prune = (): void => {
    const present = new Set(account.getSnapshot().accounts.map(summary => summary.accountKey))
    for (const key of [...otherFigures.keys()]) if (!present.has(key)) otherFigures.delete(key)
    for (const key of [...unavailableAccounts]) if (!present.has(key)) unavailableAccounts.delete(key)
  }

  /** Fold one account-store snapshot into the active account's held figures. */
  const syncActive = (): void => {
    const snapshot = account.getSnapshot()
    const figures = figuresOf(usageOf(snapshot))
    if (figures === null) {
      activeUnavailable = activeReadFailed(snapshot.status)
    } else {
      activeFigures = figures
      activeAt = Date.now()
      activeUnavailable = false
    }
    prune()
    armStaleTimer()
    publish()
  }

  /** Hold every other account's figures when a whole round could not complete. */
  const markUnavailable = (): void => {
    for (const summary of account.getSnapshot().accounts) {
      if (!summary.active) unavailableAccounts.add(summary.accountKey)
    }
    armStaleTimer()
    publish()
  }

  /** Merge one Host response, keeping the figures of every account it omits or fails. */
  const merge = (entries: readonly HostQuotaAccount[]): void => {
    const readAt = Date.now()
    const summaries = account.getSnapshot().accounts
    const activeAccountKey = summaries.find(summary => summary.active)?.accountKey
    for (const entry of entries) {
      if (entry.accountKey === activeAccountKey) continue
      if (!summaries.some(summary => summary.accountKey === entry.accountKey)) continue
      const figures = entry.usage === undefined ? null : figuresOf(entry.usage)
      if (figures === null) {
        unavailableAccounts.add(entry.accountKey)
        continue
      }
      otherFigures.set(entry.accountKey, { figures, at: readAt })
      unavailableAccounts.delete(entry.accountKey)
    }
    armStaleTimer()
    publish()
  }

  const clearPollTimer = (): void => {
    clearTimeout(pollTimer)
    pollTimer = undefined
  }

  const schedulePoll = (): void => {
    clearPollTimer()
    if (listeners.size === 0) return
    pollTimer = setTimeout(() => { void poll() }, QUOTA_REFRESH_MS)
  }

  /** Drop the pending round; the in-flight one sees its controller replaced. */
  const stopPolling = (): void => {
    clearPollTimer()
    pollController?.abort()
    pollController = undefined
  }

  /** Read every non-active account once; never overlap two live rounds. */
  const poll = async (): Promise<void> => {
    if (pollController !== undefined || listeners.size === 0) return
    const controller = new AbortController()
    pollController = controller
    try {
      const { response, value } = await requestJson(OPENAI_CODEX_QUOTA_PATH, {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      const payload = response.ok ? decodeQuotaPayload(value) : undefined
      if (payload === undefined) {
        markUnavailable()
        return
      }
      merge(payload)
    } catch {
      // A lost response holds every other account's last figures until the next round.
      if (!controller.signal.aborted) markUnavailable()
    } finally {
      // A replacement round owns the slot; an aborted round leaves it alone.
      if (pollController === controller) {
        pollController = undefined
        schedulePoll()
      }
    }
  }

  return {
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      // The store polls while it has listeners, so the service attaches on the
      // first consumer and detaches with the last one.
      if (unsubscribeAccount === undefined) unsubscribeAccount = account.subscribe(syncActive)
      syncActive()
      // Only the first consumer starts a round; later ones share it and its timer.
      if (listeners.size === 1 && pollController === undefined) {
        clearPollTimer()
        void poll()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        // A later subscriber starts a fresh round rather than inheriting a 60s wait.
        if (unsubscribeAccount !== undefined) {
          unsubscribeAccount()
          unsubscribeAccount = undefined
        }
        clearStaleTimer()
        stopPolling()
      }
    },
  }
}
