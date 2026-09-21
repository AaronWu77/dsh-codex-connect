/**
 * The cross-plugin quota face of the signed-in Codex account.
 *
 * The account store already polls ChatGPT's usage endpoint for the plugin's own
 * settings UI; this module reshapes that snapshot into one stable, secret-free
 * service so other plugins (the dsh-context dashboard) can render the rolling
 * windows without duplicating OAuth handling. `subscribe` delegates to the
 * store, so the first consumer also starts the poll and every account change
 * reaches it.
 */
import type { AccountSnapshot, OpenAICodexAccountStore } from './account-store.ts'
import type { OpenAICodexUsage } from '../usage.ts'

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
  /** Latest snapshot, or null while no account reports quota. */
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

/**
 * Bind the account store as the quota service.
 * @param account - the plugin instance's account store.
 * @returns the service published as `codexQuota`.
 */
export function createCodexQuotaService(account: OpenAICodexAccountStore): CodexQuotaService {
  // Snapshot identity is the cache key: the same reference must yield the same
  // object, or a useSyncExternalStore consumer would re-render on every read.
  const derived = new WeakMap<AccountSnapshot, CodexQuota | null>()
  return {
    snapshot: (): CodexQuota | null => {
      const snapshot = account.getSnapshot()
      const cached = derived.get(snapshot)
      if (cached !== undefined) return cached
      const quota = quotaOf(usageOf(snapshot))
      derived.set(snapshot, quota)
      return quota
    },
    subscribe: listener => account.subscribe(listener),
  }
}
