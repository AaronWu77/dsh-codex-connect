/** Shared, bounded DeepSeek platform balance reads for the quota surfaces. */
import type { PlatformBalance, PlatformBalanceEntry } from '../balance-route.ts'
import { asRecord } from './usage-ledger.ts'
import { requestJson } from './request-json.ts'

// The balance route of host/balance.ts — re-declared here (the client bundle
// inlines every import, and the host module must never reach it). Same-origin
// POST under the harness's authenticated `/api` fence.
const BALANCE_ROUTE = '/api/dsh-codex-connect/balance'

/** How long a settled answer (including a `null`) serves identical reads. */
const TTL_MS = 60_000

/** One platform amount ('110.00', or an already-numeric producer variant), or null. */
function amountOf(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Narrow the delivered payload to a render-safe value (the same boundary
 * rigor as `timelineOf`): each entry's currency and amounts re-proved, an
 * entry failing the shape drops whole, and a payload with no valid entry is
 * no balance — the caller renders nothing rather than half a figure.
 */
export function platformBalanceOf(value: unknown): PlatformBalance | null {
  const data = asRecord(value)
  if (data === null) return null
  const infos = Array.isArray(data.balances) ? data.balances : []
  const balances: PlatformBalanceEntry[] = []
  for (const info of infos) {
    // Bounded catch: a hostile entry may throw on property access — it drops
    // whole, and the entries that prove their shape keep serving.
    try {
      const entry = asRecord(info)
      if (entry === null) continue
      const currency = entry.currency
      const total = amountOf(entry.total)
      const granted = amountOf(entry.granted)
      const toppedUp = amountOf(entry.toppedUp)
      if (typeof currency !== 'string' || currency === ''
        || total === null || granted === null || toppedUp === null) continue
      balances.push({ currency, total, granted, toppedUp })
    } catch (_error) {
      continue
    }
  }
  return balances.length > 0
    ? { isAvailable: data.isAvailable === true, balances }
    : null
}

/**
 * The entry matching the display currency (zh → CNY, en → USD), falling back
 * to the account's first entry when the platform reports none in it — a
 * number in the account's own currency beats no number.
 */
export function balanceEntryOf(
  balance: PlatformBalance | null | undefined,
  currency: 'cny' | 'usd',
): PlatformBalanceEntry | null {
  if (balance === null || balance === undefined || balance.balances.length === 0) return null
  const want = currency === 'cny' ? 'CNY' : 'USD'
  return balance.balances.find(entry => entry.currency === want) ?? balance.balances[0] ?? null
}

let cached: { at: number; promise: Promise<PlatformBalance | null> } | null = null

/**
 * The capsule's read: one route POST, narrowed through
 * `platformBalanceOf`, deduplicated in flight, TTL-cached. Never rejects.
 */
export function fetchPlatformBalance(force = false): Promise<PlatformBalance | null> {
  if (!force && cached !== null && Date.now() - cached.at < TTL_MS) return cached.promise
  const at = Date.now()
  const promise = (async (): Promise<PlatformBalance | null> => {
    try {
      const { response, value } = await requestJson(BALANCE_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
      if (!response.ok) return null
      const r = asRecord(value)
      if (r === null || r.ok !== true || r.value === null || r.value === undefined) return null
      return platformBalanceOf(r.value)
    } catch (_error) {
      return null
    }
  })()
  cached = { at, promise }
  return promise
}

/** How often a mounted surface re-reads a figure its own mount already served. */
export const PLATFORM_BALANCE_REFRESH_MS = 60_000

/** The last live figure any read delivered; `null` until one lands. */
let latest: PlatformBalance | null = null

/** Mounted surfaces awaiting a publish. */
const listeners = new Set<() => void>()

/** The one refresh interval; it runs while at least one surface is subscribed. */
let timer: ReturnType<typeof setInterval> | null = null

/**
 * Publish one settled read. A read that reports nothing keeps the last real
 * figure instead of blanking a pill between refreshes.
 * @param value - the settled read, or `null` when this attempt carried no figure.
 */
function publish(value: PlatformBalance | null): void {
  if (value === null) return
  latest = value
  for (const listener of [...listeners]) listener()
}

/**
 * The mounted surfaces' figure: the last live read, or `null` before one lands.
 * @returns the published balance.
 */
export function platformBalanceSnapshot(): PlatformBalance | null {
  return latest
}

/**
 * Keep one mounted surface's figure live. The first subscriber primes a shared
 * read and starts the refresh interval; every later read is forced past the TTL
 * so a surface that stays mounted does not keep serving its mount's answer. The
 * last unsubscribe stops the interval.
 * @param listener - called after every publish; `useSyncExternalStore` supplies its own.
 * @returns the unsubscribe callback.
 */
export function subscribePlatformBalance(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    // Prime through the TTL: surfaces mounting together share one route read.
    void fetchPlatformBalance().then(publish)
    timer = setInterval(() => { void fetchPlatformBalance(true).then(publish) }, PLATFORM_BALANCE_REFRESH_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0 || timer === null) return
    clearInterval(timer)
    timer = null
  }
}

/** Test isolation: drop the cache, the published figure, and the refresh interval. */
export function resetPlatformBalance(): void {
  cached = null
  latest = null
  listeners.clear()
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}
