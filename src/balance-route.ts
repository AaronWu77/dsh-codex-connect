/**
 * Authenticated, read-only DeepSeek platform balance route for Codex usage views.
 * Provider settings and the credential service resolve the key on the Host; only
 * currency totals reach the browser. Identical credential/endpoint reads share
 * one request and a short cache. Unavailable configuration or failed reads serve
 * null without exposing credentials or making the Codex provider unavailable.
 */

import type { Context } from '@deepseek-ai/cordis'
/**
 * DeepSeek platform balance figures, owned here so the route needs no sibling
 * plugin's module. Mirrors the shape the dashboard has always read.
 */
export interface PlatformBalance {
  /** Whether the platform reports the balance sufficient for API calls. */
  isAvailable: boolean
  /** One entry per currency the account holds; at least one. */
  balances: PlatformBalanceEntry[]
}

/** One currency's balance breakdown. */
export interface PlatformBalanceEntry {
  /** The ISO code the platform reported (`CNY` / `USD`). */
  currency: string
  /** Total available funds: the granted and topped-up balances summed. */
  total: number
  /** The not-expired granted (gift) balance. */
  granted: number
  /** The topped-up balance. */
  toppedUp: number
}

/** The plugin's balance route, under the authenticated `/api` fence. */
export const BALANCE_ROUTE = '/api/dsh-codex-connect/balance'

/** The settings namespace llm-deepseek installs its connection section under. */
const DEEPSEEK_SETTINGS_NS = 'llm-deepseek'

/** llm-deepseek's default credential ref (the env-var name its section resolves). */
const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'

/** The platform's public API root (llm-deepseek's PUBLIC_BASE_URL default). */
const PUBLIC_BASE_URL = 'https://api.deepseek.com'

/** A settled read serves identical reads for this long; failures decay faster. */
const CACHE_TTL_MS = 5 * 60_000
const CACHE_FAIL_TTL_MS = 60_000

/** One platform read's whole budget — never worth blocking the route longer. */
const FETCH_TIMEOUT_MS = 10_000

/** The harness `settings` service, as far as the route consumes it. */
interface SettingsHostFace {
  /** Pre-0.1.7 read face: one namespace's live section. */
  get?(ns: string): unknown
  /** 0.1.7+ read face: every served entry's descriptor, its `value` included. */
  describe?(options?: object): Array<{ ns: string; value: unknown }>
}

/** The harness `credentials` service, as far as the route consumes it. */
interface CredentialsHostFace {
  resolve?(ref: string): Promise<{ value?: unknown } | undefined>
}

/** The host `connection` service, as far as the route consumes it (host/detail.ts's seam). */
interface ConnectionHostFace {
  fetch?: {
    register?(route: {
      path: string
      methods: readonly string[]
      requestBody: 'buffered'
      fetch: (request: Request) => Promise<Response>
    }): () => void
  }
}

/** Narrow an unknown value to a string-keyed record, or null. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** One platform amount ('110.00', or an already-numeric producer variant), or null. */
function amountOf(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

/** The connection facts one read needs, as far as runtime can prove them. */
interface DeepSeekFacts { baseUrl: string; apiKey: string }

/**
 * Read llm-deepseek's live section across the settings service's two read
 * faces: `get(ns)` on harnesses up to 0.1.5 and the `describe()` descriptor
 * list (whose entries carry `value`) from 0.1.7 on, where `get` was removed.
 * @param settings - the host settings service, when composed.
 * @returns the section record, or null when neither face serves it.
 */
function readDeepSeekSection(settings: SettingsHostFace | undefined): Record<string, unknown> | null {
  if (typeof settings?.get === 'function') {
    try {
      const direct = asRecord(settings.get(DEEPSEEK_SETTINGS_NS))
      if (direct !== null) return direct
    } catch (error) {
      // A read face that refuses (an unsettled loader) is absent, not fatal.
      void error
    }
  }
  if (typeof settings?.describe === 'function') {
    try {
      const descriptor = settings.describe().find(candidate => candidate.ns === DEEPSEEK_SETTINGS_NS)
      return asRecord(descriptor?.value)
    } catch (error) {
      // Same contract as the legacy face: an unreadable section reads absent.
      void error
    }
  }
  return null
}

/**
 * Resolve the DeepSeek connection facts exactly as llm-deepseek serves its
 * requests: its settings section for the credential ref and endpoint, the
 * credentials service for the key. `null` whenever any fact is missing —
 * the platform is simply not configured for this deployment.
 */
async function resolveFacts(ctx: Context): Promise<DeepSeekFacts | null> {
  const settings = ctx.get('settings') as SettingsHostFace | undefined
  const section = readDeepSeekSection(settings)
  if (section === null) return null
  const apiKeyEnv = typeof section.apiKeyEnv === 'string' && section.apiKeyEnv !== ''
    ? section.apiKeyEnv
    : DEFAULT_API_KEY_ENV
  const baseUrl = typeof section.baseURL === 'string' && section.baseURL !== ''
    ? section.baseURL
    : PUBLIC_BASE_URL
  const credentials = ctx.get('credentials') as CredentialsHostFace | undefined
  const resolve = typeof credentials?.resolve === 'function' ? credentials.resolve.bind(credentials) : undefined
  if (resolve === undefined) return null
  let hit: { value?: unknown } | undefined
  try {
    hit = await resolve(apiKeyEnv)
  } catch (_error) {
    return null
  }
  const apiKey = typeof hit?.value === 'string' ? hit.value : ''
  return apiKey === '' ? null : { baseUrl, apiKey }
}

/**
 * Narrow the platform's payload to the wire value (the boundary rigor every
 * parser owes untrusted input): each entry's currency and three amounts are
 * re-proved, an entry failing the shape drops whole, and a payload with no
 * valid entry is no balance at all.
 */
export function balanceOfPayload(value: unknown): PlatformBalance | null {
  const data = asRecord(value)
  if (data === null) return null
  const infos = Array.isArray(data.balance_infos) ? data.balance_infos : []
  const balances: PlatformBalanceEntry[] = []
  for (const info of infos) {
    // Bounded catch: a hostile entry may throw on property access — it drops
    // whole, and the entries that prove their shape keep serving.
    try {
      const entry = asRecord(info)
      if (entry === null) continue
      const currency = entry.currency
      const total = amountOf(entry.total_balance)
      const granted = amountOf(entry.granted_balance)
      const toppedUp = amountOf(entry.topped_up_balance)
      if (typeof currency !== 'string' || currency === ''
        || total === null || granted === null || toppedUp === null) continue
      balances.push({ currency, total, granted, toppedUp })
    } catch (_error) {
      continue
    }
  }
  return balances.length > 0
    ? { isAvailable: data.is_available === true, balances }
    : null
}

/** The outbound platform fetch (test seam; the real read). */
type BalanceFetcher = (url: string, init: RequestInit) => Promise<Response>

/** The outbound platform fetch through the real global fetch. */
const defaultFetcher: BalanceFetcher = (url, init) => fetch(url, init)

let fetcher: BalanceFetcher = defaultFetcher

/** Test seam: replace the platform fetch; null restores the default. */
export function setBalanceFetcher(next: BalanceFetcher | null): void {
  fetcher = next ?? defaultFetcher
}

interface CacheSlot { key: string; at: number; value: PlatformBalance | null }

let cache: CacheSlot | null = null
const inFlight = new Map<string, Promise<PlatformBalance | null>>()

/** Drop the cache and any in-flight read (test isolation). */
export function resetBalance(): void {
  cache = null
  inFlight.clear()
}

/**
 * One platform read for these facts, shared across identical concurrent
 * reads and remembered briefly: successes for CACHE_TTL_MS, failures for
 * CACHE_FAIL_TTL_MS (a blip must not pin the capsule away for the full
 * window). Every failure path — transport, timeout, non-ok status, malformed
 * payload — resolves `null`; the route never throws into the transport.
 */
async function readBalance(facts: DeepSeekFacts): Promise<PlatformBalance | null> {
  const key = facts.baseUrl + '\u0000' + facts.apiKey
  if (cache !== null && cache.key === key
    && Date.now() - cache.at < (cache.value === null ? CACHE_FAIL_TTL_MS : CACHE_TTL_MS)) {
    return cache.value
  }
  const pending = inFlight.get(key)
  if (pending !== undefined) return pending
  const settled = (async () => {
    let value: PlatformBalance | null = null
    try {
      const response = await fetcher(facts.baseUrl.replace(/\/+$/, '') + '/user/balance', {
        headers: { accept: 'application/json', authorization: 'Bearer ' + facts.apiKey },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (response.ok) value = balanceOfPayload(await response.json())
    } catch (_error) {
      // Absent on purpose: any failure serves null — the capsule stays hidden.
    }
    cache = { key, at: Date.now(), value }
    return value
  })()
  inFlight.set(key, settled)
  try {
    return await settled
  } finally {
    if (inFlight.get(key) === settled) inFlight.delete(key)
  }
}

/**
 * Serve the balance route whenever the connection service composes (see
 * host/detail.ts for the load-order contract). The registration rides the
 * injected fiber: the service unloading withdraws the route. A rejecting
 * registry only closes the capsule — never the plugin.
 */
export function watchBalanceChannel(ctx: Context): void {
  ctx.inject(['connection'], (c) => {
    const connection = c.get('connection') as ConnectionHostFace | undefined
    const register = typeof connection?.fetch?.register === 'function'
      ? connection.fetch.register.bind(connection.fetch)
      : undefined
    if (register === undefined) return

    const handler = async (): Promise<Response> => {
      const facts = await resolveFacts(ctx)
      const value = facts !== null ? await readBalance(facts) : null
      return Response.json({ ok: true, value }, { headers: { 'cache-control': 'no-store' } })
    }

    try {
      c.effect(() => register({
        path: BALANCE_ROUTE,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: handler,
      }), 'dsh-codex-connect: DeepSeek balance route')
    } catch (_error) {
      return
    }
  })
}
