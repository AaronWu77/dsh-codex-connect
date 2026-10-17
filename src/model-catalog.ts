/**
 * Live Codex model catalog: one authenticated read through the plugin proxy,
 * cached in the plugin's own DSH-home file, with hard fallbacks that can never
 * shrink or empty the picker.
 *
 * Fallback order (each level only fills what the previous one could not):
 * live fetch, plugin cache file, the Codex CLI cache, the bundled pi-ai
 * catalog. The plugin never writes the Codex CLI cache; the `~/.codex`
 * directory stays owned by the official client.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { readOpenAICodexAccountRequestAuth } from './auth.ts'
import type { OpenAICodexAccountSummary, OpenAICodexCredentialStore } from './store.ts'
import type { OpenAICodexProxyManager } from './provider-proxy.ts'
import type {
  OpenAICodexCatalogSource,
  OpenAICodexModelReasoningLevel,
  OpenAICodexModelServiceTier,
} from './model-contract.ts'

/** Fixed endpoint the official Codex client reads its model catalog from. */
export const OPENAI_CODEX_MODELS_URL = 'https://chatgpt.com/backend-api/codex/models'

/**
 * Official client version sent as the `client_version` gate. GPT-6 Sol and
 * Luna declare `0.155.0` as their minimum client version; an older version
 * may omit them or return an empty list. Omitting the parameter fails with
 * HTTP 400. The value is configurable as the gate follows client releases.
 */
export const DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION = '0.155.0'

/** Plugin-owned cache basename inside the Harness home. */
export const OPENAI_CODEX_MODEL_CATALOG_CACHE_FILENAME = 'dsh-codex-connect-models.json'

/** How long an accepted catalog read suppresses the next live read. */
export const OPENAI_CODEX_MODEL_CATALOG_TTL_MS = 6 * 60 * 60 * 1_000

/** Total deadline for one catalog read, including authentication. */
const CATALOG_REQUEST_TIMEOUT_MS = 15_000

/** Cache document version owned by this plugin; it stores one layer per account. */
const CATALOG_CACHE_VERSION = 2

/** Cache document version that stored a single account's models at the top level. */
const LEGACY_CATALOG_CACHE_VERSION = 1

/** One server-advertised Codex model. */
export interface OpenAICodexLiveModel {
  /** Server model slug, matched against the installed catalog id. */
  slug: string
  /** Optional server display name. */
  displayName?: string
  /** Optional server description. */
  description?: string
  /** Optional server default reasoning effort. */
  defaultReasoningLevel?: string
  /** Server-advertised reasoning efforts. */
  reasoningLevels: readonly OpenAICodexModelReasoningLevel[]
  /** Server default context window in tokens. */
  contextWindow: number
  /** Server extended context ceiling in tokens; equals `contextWindow` when omitted. */
  maxContextWindow: number
  /** Server maximum output tokens when the model declares one. */
  maxOutputTokens?: number
  /** Server-advertised service tiers. */
  serviceTiers: readonly OpenAICodexModelServiceTier[]
  /** Server input modalities when the model declares them. */
  inputModalities: readonly string[]
  /**
   * True when the last accepted read for this account no longer advertised the model.
   * The entry keeps resolving, so surfaces can explain the change instead of dropping it.
   */
  withdrawn?: true
}

/** Host dependencies of the catalog service. */
export interface OpenAICodexModelCatalogOptions {
  /** Owns the stored accounts and the request-scoped credential capture. */
  credentials: Pick<OpenAICodexCredentialStore, 'accounts' | 'captureAccount' | 'captureActiveAccount'>
  /** Plugin-owned cache file path under the Harness home. */
  cachePath: string
  /** Official client version sent as the `client_version` gate. */
  clientVersion: string
  /** Owns Codex-only proxy dispatch; absent uses the direct connection. */
  proxyManager?: OpenAICodexProxyManager | undefined
  /** Resolve the explicitly activated proxy for each read. */
  resolveProxyUrl?: (() => string | undefined) | undefined
  /** Codex CLI cache path; defaults to `$CODEX_HOME/models_cache.json`. */
  cliCachePath?: string | undefined
  /** Override the HTTP implementation in tests. */
  fetchImpl?: typeof fetch | undefined
  /** Monotonic clock override in tests. */
  now?: (() => number) | undefined
  /** Structured logger for the once-per-streak failure report. */
  logError?: ((message: string, error?: unknown) => void) | undefined
}

/** One resolved view of the catalog plus where it came from. */
export interface OpenAICodexCatalogSnapshot {
  source: OpenAICodexCatalogSource
  updatedAt?: number
  etag?: string
  models: readonly OpenAICodexLiveModel[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/**
 * One cache `fetched_at`: epoch milliseconds as this plugin writes them, or the
 * official Codex CLI's ISO-8601 string, which carries nanosecond digits.
 * @param value - the raw document field.
 * @returns epoch milliseconds, or undefined when unreadable.
 */
function optionalTimestamp(value: unknown): number | undefined {
  const count = optionalTokenCount(value)
  if (count !== undefined) return count
  if (typeof value !== 'string' || value.length === 0) return undefined
  const parsed = Date.parse(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

/** Read one bounded list of `{effort, description}` server records. */
function parseReasoningLevels(value: unknown): OpenAICodexModelReasoningLevel[] {
  if (!Array.isArray(value)) return []
  const levels: OpenAICodexModelReasoningLevel[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const effort = optionalString(item, 'effort')
    if (effort === undefined) continue
    const description = optionalString(item, 'description')
    levels.push({ effort, ...description === undefined ? {} : { description } })
  }
  return levels
}

/** Read one bounded list of `{id, name, description}` server records. */
function parseServiceTiers(value: unknown): OpenAICodexModelServiceTier[] {
  if (!Array.isArray(value)) return []
  const tiers: OpenAICodexModelServiceTier[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const id = optionalString(item, 'id')
    if (id === undefined) continue
    const name = optionalString(item, 'name')
    const description = optionalString(item, 'description')
    tiers.push({ id, ...name === undefined ? {} : { name }, ...description === undefined ? {} : { description } })
  }
  return tiers
}

/** Field names for one catalog encoding: the server body or this plugin's cache file. */
interface OpenAICodexLiveModelFields {
  contextWindow: string
  maxContextWindow: string
  maxOutputTokens: string
  displayName: string
  description: string
  defaultReasoningLevel: string
  inputModalities: readonly string[]
}

const SERVER_MODEL_FIELDS: OpenAICodexLiveModelFields = {
  contextWindow: 'context_window',
  maxContextWindow: 'max_context_window',
  maxOutputTokens: 'max_output_tokens',
  displayName: 'display_name',
  description: 'description',
  defaultReasoningLevel: 'default_reasoning_level',
  inputModalities: ['input_modalities', 'input'],
}

const STORED_MODEL_FIELDS: OpenAICodexLiveModelFields = {
  contextWindow: 'contextWindow',
  maxContextWindow: 'maxContextWindow',
  maxOutputTokens: 'maxOutputTokens',
  displayName: 'displayName',
  description: 'description',
  defaultReasoningLevel: 'defaultReasoningLevel',
  inputModalities: ['inputModalities'],
}

/** Read the optional input-modality list; the server has used two field names. */
function parseInputModalities(record: Record<string, unknown>, keys: readonly string[]): string[] {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
  }
  return []
}

/** Convert one model record; undefined when it cannot describe a usable model. */
function parseOpenAICodexLiveModel(value: unknown, fields: OpenAICodexLiveModelFields): OpenAICodexLiveModel | undefined {
  if (!isRecord(value)) return undefined
  const slug = optionalString(value, 'slug')
  const contextWindow = optionalTokenCount(value[fields.contextWindow])
  if (slug === undefined || contextWindow === undefined) return undefined
  const maxContextWindow = optionalTokenCount(value[fields.maxContextWindow]) ?? contextWindow
  const maxOutputTokens = optionalTokenCount(value[fields.maxOutputTokens])
  const displayName = optionalString(value, fields.displayName)
  const description = optionalString(value, fields.description)
  const defaultReasoningLevel = optionalString(value, fields.defaultReasoningLevel)
  return {
    slug,
    contextWindow,
    maxContextWindow: Math.max(contextWindow, maxContextWindow),
    reasoningLevels: parseReasoningLevels(value['supported_reasoning_levels'] ?? value['reasoningLevels']),
    serviceTiers: parseServiceTiers(value['service_tiers'] ?? value['serviceTiers']),
    inputModalities: parseInputModalities(value, fields.inputModalities),
    ...displayName === undefined ? {} : { displayName },
    ...description === undefined ? {} : { description },
    ...defaultReasoningLevel === undefined ? {} : { defaultReasoningLevel },
    ...maxOutputTokens === undefined ? {} : { maxOutputTokens },
    ...value['withdrawn'] === true ? { withdrawn: true as const } : {},
  }
}

function parseOpenAICodexModelArray(value: unknown, fields: OpenAICodexLiveModelFields): OpenAICodexLiveModel[] {
  if (!isRecord(value) || !Array.isArray(value['models'])) {
    throw new Error('OpenAI Codex returned a malformed model catalog')
  }
  const models: OpenAICodexLiveModel[] = []
  const slugs = new Set<string>()
  for (const item of value['models']) {
    const model = parseOpenAICodexLiveModel(item, fields)
    if (model === undefined || slugs.has(model.slug)) continue
    slugs.add(model.slug)
    models.push(model)
  }
  // A version-gated or truncated response must fall through to the next layer,
  // never replace a usable catalog with an empty one.
  if (models.length === 0) throw new Error('OpenAI Codex returned an empty model catalog')
  return models
}

/**
 * Decode the catalog payload shared by the live endpoint and the Codex CLI cache.
 * @param value - parsed JSON body.
 * @returns every decodable model, in server order.
 */
export function parseOpenAICodexModelsPayload(value: unknown): OpenAICodexLiveModel[] {
  return parseOpenAICodexModelArray(value, SERVER_MODEL_FIELDS)
}

/** Decode this plugin's own cache file, whose model fields are already camel-cased. */
function parseStoredOpenAICodexModels(value: unknown): OpenAICodexLiveModel[] {
  return parseOpenAICodexModelArray(value, STORED_MODEL_FIELDS)
}

/**
 * Union one account's freshly advertised models with the ones it already had. A model the
 * account no longer advertises keeps its last known record and is flagged, so its id still
 * resolves and the surfaces can report the change rather than losing it silently.
 * @param advertised - models from the latest accepted read, in server order.
 * @param previous - models accepted for the same account before that read.
 * @returns the advertised models followed by the withdrawn ones.
 */
export function mergeOpenAICodexLiveModels(
  advertised: readonly OpenAICodexLiveModel[],
  previous: readonly OpenAICodexLiveModel[],
): readonly OpenAICodexLiveModel[] {
  const advertisedSlugs = new Set(advertised.map(model => model.slug))
  return [
    ...advertised,
    ...previous
      .filter(model => !advertisedSlugs.has(model.slug))
      .map(model => ({ ...model, withdrawn: true as const })),
  ]
}

/** Release a discarded response without masking the status that caused it. */
async function cancelDiscardedResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch (error: unknown) {
    // Body cancellation is best effort; the response status remains the useful signal.
    void error
  }
}

/** Resolve the Codex CLI cache path without writing anything under it. */
export function openAICodexCliModelCachePath(): string {
  const codexHome = process.env['CODEX_HOME']
  return codexHome === undefined || codexHome.length === 0
    ? join(homedir(), '.codex', 'models_cache.json')
    : join(codexHome, 'models_cache.json')
}

/**
 * Read, cache, and fall back through the Codex model catalog. Construction
 * never touches the network or disk; {@link initialize} loads the plugin cache,
 * and {@link refresh} performs at most one live read per TTL.
 */
/** One stored account's resolved catalog layer and when it was last confirmed. */
interface OpenAICodexAccountCatalogLayer {
  snapshot: OpenAICodexCatalogSnapshot
  /** When this layer was last confirmed live (a 200 body or a 304); 0 means never. */
  checkedAt: number
}

export class OpenAICodexModelCatalog {
  private readonly layers = new Map<string, OpenAICodexAccountCatalogLayer>()
  private activeAccountKey: string | undefined
  private revisionCounter = 0
  private failureLogged = false
  private inflight: Promise<void> | undefined
  private disposed = false
  private readonly lifetime = new AbortController()
  private clientVersion: string

  /**
   * @param options - credential store, cache path, and optional proxy and clock overrides.
   */
  constructor(private readonly options: OpenAICodexModelCatalogOptions) {
    this.clientVersion = options.clientVersion
  }

  /** Follow a settings change; a different gate invalidates every account's TTL. */
  setClientVersion(value: string): void {
    if (value === this.clientVersion) return
    this.clientVersion = value
    for (const layer of this.layers.values()) layer.checkedAt = 0
  }

  /** Monotonic identity of the current layer; profile caches key on it. */
  get revision(): number {
    return this.revisionCounter
  }

  /** The current selection's effective live-model layer; empty means the bundled catalog answers. */
  models(): readonly OpenAICodexLiveModel[] {
    return this.layers.get(this.layerKey())?.snapshot.models ?? []
  }

  /**
   * One stored account's effective live-model layer. An account with no accepted read
   * answers with nothing, so its route falls back to the bundled catalog instead of
   * advertising another account's entitlement list.
   * @param accountKey - browser-safe account key from the credential store.
   * @returns that account's server-advertised models.
   */
  modelsFor(accountKey: string | undefined): readonly OpenAICodexLiveModel[] {
    if (accountKey === undefined) return this.models()
    return this.layers.get(accountKey)?.snapshot.models ?? []
  }

  /** @param accountKey - Stored account, or the current account when omitted. @returns The accepted catalog source. */
  source(accountKey?: string): OpenAICodexCatalogSource {
    return this.layers.get(accountKey ?? this.layerKey())?.snapshot.source ?? 'bundled'
  }

  /** @param accountKey - Stored account, or the current account when omitted. @returns Accepted-payload epoch milliseconds, or undefined for bundled-only metadata. */
  updatedAt(accountKey?: string): number | undefined {
    return this.layers.get(accountKey ?? this.layerKey())?.snapshot.updatedAt
  }

  /** Load the plugin cache file, then start one live read per stored account when stale. */
  async initialize(): Promise<void> {
    const cached = await this.readCacheFile()
    if (cached !== undefined) {
      for (const [accountKey, layer] of cached.byAccount) this.layers.set(accountKey, layer)
    }
    this.activeAccountKey = await this.readActiveAccountKey()
    // Version 1 carried a single account's models; only the current selection can own it.
    if (cached?.legacy !== undefined && this.activeAccountKey !== undefined
      && !this.layers.has(this.activeAccountKey)) {
      this.layers.set(this.activeAccountKey, cached.legacy)
    }
    await this.refresh()
  }

  /** Whether the current account's layer is still inside the TTL. */
  isFresh(): boolean {
    const layer = this.layers.get(this.layerKey())
    // 'Never accepted' is its own state: the 0 sentinel is not a recent check.
    return layer !== undefined
      && layer.checkedAt > 0
      && layer.snapshot.models.length > 0
      && this.now() - layer.checkedAt < OPENAI_CODEX_MODEL_CATALOG_TTL_MS
  }

  /** Stop accepting further reads; the current layers stay readable. */
  async dispose(): Promise<void> {
    this.disposed = true
    this.lifetime.abort()
    await this.inflight
  }

  /** The layer key answering for the current selection; empty until an account is known. */
  private layerKey(): string {
    return this.activeAccountKey ?? ''
  }

  /** Resolve the stored account the primary route currently authenticates as. */
  private async readActiveAccountKey(): Promise<string | undefined> {
    try {
      const accounts = await this.options.credentials.accounts()
      return accounts.find(account => account.active)?.accountKey
    } catch (error: unknown) {
      // An unreadable credential document leaves every layer as it was.
      void error
      return undefined
    }
  }

  /**
   * Read every stored account's live catalog unless fresh layers exist, coalescing callers.
   * Never rejects: a failed account read keeps that account's previous layer and is logged
   * once per failure streak.
   * @param force - bypass the TTL, as the manual refresh affordance does.
   */
  async refresh(force = false, cancellation?: AbortSignal): Promise<void> {
    if (this.disposed) return
    if (this.inflight !== undefined) return this.inflight
    const signal = cancellation === undefined ? this.lifetime.signal : AbortSignal.any([cancellation, this.lifetime.signal])
    if (signal.aborted) return
    this.inflight = this.runRefresh(force, signal).finally(() => { this.inflight = undefined })
    return this.inflight
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  /** Publish one account's layer at the point its read settled. */
  private setLayer(accountKey: string, snapshot: OpenAICodexCatalogSnapshot, checkedAt: number): void {
    this.layers.set(accountKey, { snapshot, checkedAt })
    this.revisionCounter += 1
  }

  private logFailure(error: unknown): void {
    if (this.failureLogged) return
    this.failureLogged = true
    this.options.logError?.('dsh-codex-connect: live model catalog unavailable; keeping the last known catalog', error)
  }

  private async runRefresh(force: boolean, signal: AbortSignal): Promise<void> {
    const operation = async (): Promise<void> => {
      const accounts = await this.options.credentials.accounts()
      this.activeAccountKey = accounts.find(account => account.active)?.accountKey
      // Drop layers of accounts the credential document no longer stores, so the cache
      // file cannot accumulate entries for accounts a user removed.
      const present = new Set(accounts.map(account => account.accountKey))
      for (const accountKey of [...this.layers.keys()]) {
        if (accountKey.length > 0 && !present.has(accountKey)) this.layers.delete(accountKey)
      }
      // Each stored account owns its entitlement list, so each read stands alone.
      await Promise.all(accounts.map(account => this.refreshAccount(account, force, signal)))
      const remaining = new Set((await this.options.credentials.accounts()).map(account => account.accountKey))
      for (const key of this.layers.keys()) {
        if (key.length > 0 && !remaining.has(key)) { this.layers.delete(key); this.revisionCounter += 1 }
      }
      if (signal.aborted) return
      await this.writeCacheFile()
    }
    try {
      await (this.options.proxyManager?.run(this.options.resolveProxyUrl?.(), operation) ?? operation())
    } catch (error: unknown) {
      this.logFailure(error)
    }
    if (!signal.aborted && this.models().length === 0) await this.fallbackToCliCache()
  }

  /** Read one account's catalog as that exact account; a failure keeps its previous layer. */
  private async refreshAccount(account: OpenAICodexAccountSummary, force: boolean, cancellation: AbortSignal): Promise<void> {
    const accountKey = account.accountKey
    const current = this.layers.get(accountKey)
    if (!force && current !== undefined && current.checkedAt > 0
      && this.now() - current.checkedAt < OPENAI_CODEX_MODEL_CATALOG_TTL_MS) return
    // A conditional read only makes sense against the layer it would replace.
    const etag = current === undefined || current.checkedAt === 0 ? undefined : current.snapshot.etag
    try {
      const operation = async (): Promise<void> => {
        const signal = AbortSignal.any([cancellation, AbortSignal.timeout(CATALOG_REQUEST_TIMEOUT_MS)])
        const auth = await readOpenAICodexAccountRequestAuth(this.options.credentials, accountKey, signal)
        const response = await (this.options.fetchImpl ?? fetch)(this.requestUrl(), {
          method: 'GET',
          redirect: 'error',
          headers: this.requestHeaders(auth.access, auth.accountId, etag),
          signal,
        })
        if (response.status === 304) {
          await cancelDiscardedResponseBody(response)
          // A 304 confirms the layer in hand, so it starts that account's TTL.
          signal.throwIfAborted()
          const layer = this.layers.get(accountKey)
          if (layer !== undefined) layer.checkedAt = this.now()
          this.failureLogged = false
          return
        }
        if (!response.ok) {
          await cancelDiscardedResponseBody(response)
          throw new Error(`OpenAI Codex model catalog request failed with HTTP ${String(response.status)}`)
        }
        const advertised = parseOpenAICodexModelsPayload(await response.json())
        signal.throwIfAborted()
        const nextEtag = response.headers.get('etag')
        this.setLayer(accountKey, {
          source: 'live',
          updatedAt: this.now(),
          models: mergeOpenAICodexLiveModels(advertised, current?.snapshot.models ?? []),
          ...nextEtag === null || nextEtag.length === 0 ? {} : { etag: nextEtag },
        }, this.now())
        this.failureLogged = false
      }
      await (this.options.proxyManager?.run(this.options.resolveProxyUrl?.(), operation) ?? operation())
    } catch (error: unknown) {
      // One account's failure must not blank another account's picker.
      this.logFailure(error)
    }
  }

  /** Second fallback: the official client's own cache, read but never written. */
  private async fallbackToCliCache(): Promise<void> {
    const accountKey = this.layerKey()
    const checkedAt = this.layers.get(accountKey)?.checkedAt ?? 0
    const path = this.options.cliCachePath ?? openAICodexCliModelCachePath()
    try {
      const document = JSON.parse(await readFile(path, 'utf8')) as unknown
      const models = parseOpenAICodexModelsPayload(document)
      const fetchedAt = isRecord(document) ? optionalTimestamp(document['fetched_at']) : undefined
      // The official client caches one account's catalog, so it only answers for the
      // current selection and never counts as a confirmed live read.
      this.setLayer(accountKey, {
        source: 'cli-cache',
        models,
        ...fetchedAt === undefined ? {} : { updatedAt: fetchedAt },
      }, checkedAt)
    } catch (error: unknown) {
      // No on-disk catalog answered; the bundled pi-ai records remain the picker.
      this.logFailure(error)
      this.setLayer(accountKey, { source: 'bundled', models: [] }, checkedAt)
    }
  }

  private requestUrl(): string {
    return `${OPENAI_CODEX_MODELS_URL}?client_version=${encodeURIComponent(this.clientVersion)}`
  }

  private requestHeaders(access: string, accountId: string, etag: string | undefined): Record<string, string> {
    return {
      authorization: `Bearer ${access}`,
      'chatgpt-account-id': accountId,
      originator: 'deepseek-harness',
      accept: 'application/json',
      'user-agent': 'dsh-codex-connect',
      ...etag === undefined ? {} : { 'if-none-match': etag },
    }
  }

  private async readCacheFile(): Promise<{
    byAccount: ReadonlyMap<string, OpenAICodexAccountCatalogLayer>
    legacy?: OpenAICodexAccountCatalogLayer
  } | undefined> {
    try {
      const document = JSON.parse(await readFile(this.options.cachePath, 'utf8')) as unknown
      if (!isRecord(document)) return undefined
      if (document['version'] === CATALOG_CACHE_VERSION) {
        const stored = document['accounts']
        if (!isRecord(stored)) return undefined
        const byAccount = new Map<string, OpenAICodexAccountCatalogLayer>()
        for (const [accountKey, value] of Object.entries(stored)) {
          if (!isRecord(value)) continue
          const snapshot = this.cachedSnapshot(value)
          if (snapshot === undefined) continue
          byAccount.set(accountKey, { snapshot, checkedAt: optionalTimestamp(value['fetched_at']) ?? 0 })
        }
        return { byAccount }
      }
      if (document['version'] !== LEGACY_CATALOG_CACHE_VERSION) return undefined
      const snapshot = this.cachedSnapshot(document)
      return snapshot === undefined
        ? { byAccount: new Map() }
        : { byAccount: new Map(), legacy: { snapshot, checkedAt: optionalTimestamp(document['fetched_at']) ?? 0 } }
    } catch (error: unknown) {
      // Absent or unreadable cache is the normal first-run state, not a failure streak.
      void error
      return undefined
    }
  }

  /** Decode one stored layer; a malformed layer reads as absent. */
  private cachedSnapshot(value: Record<string, unknown>): OpenAICodexCatalogSnapshot | undefined {
    try {
      const models = parseStoredOpenAICodexModels(value)
      const fetchedAt = optionalTimestamp(value['fetched_at'])
      const etag = optionalString(value, 'etag')
      return {
        source: 'cache',
        models,
        ...fetchedAt === undefined ? {} : { updatedAt: fetchedAt },
        ...etag === undefined ? {} : { etag },
      }
    } catch (error: unknown) {
      // One malformed stored layer is dropped; the next live read refills it.
      void error
      return undefined
    }
  }

  private async writeCacheFile(): Promise<void> {
    // No account was read yet; keep whatever is already on disk.
    if (this.layers.size === 0) return
    const document = {
      version: CATALOG_CACHE_VERSION,
      accounts: Object.fromEntries([...this.layers]
        .filter(([accountKey]) => accountKey.length > 0)
        .map(([accountKey, layer]) => [accountKey, {
          fetched_at: layer.snapshot.updatedAt ?? this.now(),
          client_version: this.clientVersion,
          ...layer.snapshot.etag === undefined ? {} : { etag: layer.snapshot.etag },
          models: layer.snapshot.models,
        }])),
    }
    try {
      await mkdir(dirname(this.options.cachePath), { recursive: true })
      await writeFile(this.options.cachePath, `${JSON.stringify(document)}\n`, { mode: 0o600 })
    } catch (error: unknown) {
      // The in-memory catalog stays authoritative; a cache write is best effort.
      this.logFailure(error)
    }
  }
}
