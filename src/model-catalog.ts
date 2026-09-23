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
import { readOpenAICodexRequestAuth } from './auth.ts'
import type { OpenAICodexCredentialStore } from './store.ts'
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

/** Cache document version owned by this plugin. */
const CATALOG_CACHE_VERSION = 1

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
}

/** Host dependencies of the catalog service. */
export interface OpenAICodexModelCatalogOptions {
  /** Owns the stored accounts and the request-scoped credential capture. */
  credentials: Pick<OpenAICodexCredentialStore, 'captureActiveAccount'>
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
export class OpenAICodexModelCatalog {
  private snapshot: OpenAICodexCatalogSnapshot
  private revisionCounter = 0
  /** When the last live layer was accepted (a 200 body or a 304); 0 means never. */
  private checkedAt = 0
  private failureLogged = false
  private inflight: Promise<void> | undefined
  private disposed = false
  private clientVersion: string

  /**
   * @param options - credential store, cache path, and optional proxy and clock overrides.
   */
  constructor(private readonly options: OpenAICodexModelCatalogOptions) {
    this.clientVersion = options.clientVersion
    this.snapshot = { source: 'bundled', models: [] }
  }

  /** Follow a settings change; a different gate invalidates the current TTL. */
  setClientVersion(value: string): void {
    if (value === this.clientVersion) return
    this.clientVersion = value
    this.checkedAt = 0
  }

  /** Monotonic identity of the current layer; profile caches key on it. */
  get revision(): number {
    return this.revisionCounter
  }

  /** The effective live-model layer; empty means the bundled catalog answers. */
  models(): readonly OpenAICodexLiveModel[] {
    return this.snapshot.models
  }

  /** Where the current layer came from and when it was accepted. */
  source(): OpenAICodexCatalogSource {
    return this.snapshot.source
  }

  /** Epoch milliseconds of the last accepted payload, when one exists. */
  updatedAt(): number | undefined {
    return this.snapshot.updatedAt
  }

  /** Load the plugin cache file, then start one live read when it is stale. */
  async initialize(): Promise<void> {
    const cached = await this.readCacheFile()
    if (cached !== undefined) {
      this.accept(cached.snapshot)
      this.checkedAt = cached.checkedAt
    }
    if (!this.isFresh()) await this.refresh()
  }

  /** Whether the last accepted layer is still inside the TTL. */
  isFresh(): boolean {
    // 'Never accepted' is its own state: the 0 sentinel is not a recent check.
    return this.checkedAt > 0
      && this.snapshot.models.length > 0
      && this.now() - this.checkedAt < OPENAI_CODEX_MODEL_CATALOG_TTL_MS
  }

  /** Stop accepting further reads; the current snapshot stays readable. */
  dispose(): void {
    this.disposed = true
  }

  /**
   * Read the live catalog unless a fresh layer exists, coalescing callers.
   * Never rejects: every failure keeps the previous layer and is logged once
   * per failure streak.
   * @param force - bypass the TTL, as the manual refresh affordance does.
   */
  async refresh(force = false): Promise<void> {
    if (this.disposed) return
    if (this.inflight !== undefined) return this.inflight
    if (!force && this.isFresh()) return
    this.inflight = this.runRefresh().finally(() => { this.inflight = undefined })
    return this.inflight
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  private accept(next: OpenAICodexCatalogSnapshot): void {
    this.snapshot = next
    this.revisionCounter += 1
  }

  private logFailure(error: unknown): void {
    if (this.failureLogged) return
    this.failureLogged = true
    this.options.logError?.('dsh-codex-connect: live model catalog unavailable; keeping the last known catalog', error)
  }

  private async runRefresh(): Promise<void> {
    const operation = async (): Promise<void> => {
      const signal = AbortSignal.timeout(CATALOG_REQUEST_TIMEOUT_MS)
      const auth = await readOpenAICodexRequestAuth(this.options.credentials, signal)
      const response = await (this.options.fetchImpl ?? fetch)(this.requestUrl(), {
        method: 'GET',
        redirect: 'error',
        headers: this.requestHeaders(auth.access, auth.accountId),
        signal,
      })
      if (response.status === 304) {
        await cancelDiscardedResponseBody(response)
        // A 304 confirms the layer in hand, so it starts the TTL.
        this.checkedAt = this.now()
        this.failureLogged = false
        return
      }
      if (!response.ok) {
        await cancelDiscardedResponseBody(response)
        throw new Error(`OpenAI Codex model catalog request failed with HTTP ${String(response.status)}`)
      }
      const models = parseOpenAICodexModelsPayload(await response.json())
      const etag = response.headers.get('etag')
      this.accept({
        source: 'live',
        updatedAt: this.now(),
        models,
        ...etag === null || etag.length === 0 ? {} : { etag },
      })
      this.checkedAt = this.now()
      this.failureLogged = false
      await this.writeCacheFile()
    }
    try {
      await (this.options.proxyManager?.run(this.options.resolveProxyUrl?.(), operation) ?? operation())
    } catch (error: unknown) {
      this.logFailure(error)
    }
    if (this.snapshot.models.length === 0) await this.fallbackToCliCache()
  }

  /** Second fallback: the official client's own cache, read but never written. */
  private async fallbackToCliCache(): Promise<void> {
    const path = this.options.cliCachePath ?? openAICodexCliModelCachePath()
    try {
      const document = JSON.parse(await readFile(path, 'utf8')) as unknown
      const models = parseOpenAICodexModelsPayload(document)
      const fetchedAt = isRecord(document) ? optionalTimestamp(document['fetched_at']) : undefined
      this.accept({ source: 'cli-cache', models, ...fetchedAt === undefined ? {} : { updatedAt: fetchedAt } })
    } catch (error: unknown) {
      // No on-disk catalog answered; the bundled pi-ai records remain the picker.
      this.logFailure(error)
      this.accept({ source: 'bundled', models: [] })
    }
  }

  private requestUrl(): string {
    return `${OPENAI_CODEX_MODELS_URL}?client_version=${encodeURIComponent(this.clientVersion)}`
  }

  private requestHeaders(access: string, accountId: string): Record<string, string> {
    const etag = this.snapshot.etag
    return {
      authorization: `Bearer ${access}`,
      'chatgpt-account-id': accountId,
      originator: 'deepseek-harness',
      accept: 'application/json',
      'user-agent': 'dsh-codex-connect',
      ...etag === undefined ? {} : { 'if-none-match': etag },
    }
  }

  private async readCacheFile(): Promise<{ snapshot: OpenAICodexCatalogSnapshot; checkedAt: number } | undefined> {
    try {
      const document = JSON.parse(await readFile(this.options.cachePath, 'utf8')) as unknown
      if (!isRecord(document) || document['version'] !== CATALOG_CACHE_VERSION) return undefined
      const models = parseStoredOpenAICodexModels(document)
      const fetchedAt = optionalTimestamp(document['fetched_at'])
      const etag = optionalString(document, 'etag')
      return {
        snapshot: {
          source: 'cache',
          models,
          ...fetchedAt === undefined ? {} : { updatedAt: fetchedAt },
          ...etag === undefined ? {} : { etag },
        },
        checkedAt: fetchedAt ?? 0,
      }
    } catch (error: unknown) {
      // Absent or unreadable cache is the normal first-run state, not a failure streak.
      void error
      return undefined
    }
  }

  private async writeCacheFile(): Promise<void> {
    const document = {
      version: CATALOG_CACHE_VERSION,
      fetched_at: this.snapshot.updatedAt ?? this.now(),
      client_version: this.clientVersion,
      ...this.snapshot.etag === undefined ? {} : { etag: this.snapshot.etag },
      models: this.snapshot.models,
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
