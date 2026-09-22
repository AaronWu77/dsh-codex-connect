/** Node-free model catalog contract shared by the Host route and browser card. */

/** Same-origin endpoint exposing the complete Codex model catalog. */
export const OPENAI_CODEX_MODEL_CATALOG_PATH = '/plugins/dsh-codex-connect/models'

/** Same-origin endpoint exposing where the catalog came from and when it was read. */
export const OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH = '/plugins/dsh-codex-connect/models/status'

/** Same-origin endpoint forcing one live catalog read through the active account. */
export const OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH = '/plugins/dsh-codex-connect/models/refresh'

/**
 * Which catalog layer supplied the live model metadata. The picker never
 * empties: every later layer only replaces fields the earlier one declared.
 */
export type OpenAICodexCatalogSource = 'live' | 'cache' | 'cli-cache' | 'bundled'

/**
 * Which server-advertised context window becomes the advertised default
 * budget. `default` uses `context_window`; `extended` uses
 * `max_context_window`, the same ceiling the override validation accepts.
 */
export type OpenAICodexContextWindowMode = 'default' | 'extended'

/** One server-advertised service tier for a Codex model. */
export interface OpenAICodexModelServiceTier {
  /** Stable server tier id sent as `service_tier`. */
  id: string
  /** Optional server-provided display name. */
  name?: string
  /** Optional server-provided description. */
  description?: string
}

/** One server-advertised reasoning effort accepted by a Codex model. */
export interface OpenAICodexModelReasoningLevel {
  /** Effort id accepted by the provider. */
  effort: string
  /** Optional server-provided description. */
  description?: string
}

/** Versioned official-client override policy, not a measured endpoint capacity. */
export const OPENAI_CODEX_CONTEXT_LIMIT_SOURCE = 'https://github.com/openai/codex/blob/a97cf1b72eaad05aa49847bc81d09ceac9327754/codex-rs/models-manager/models.json'

const CONFIGURATION_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  'gpt-6-astra': 872_000,
  'gpt-5.6-sol': 872_000,
  'gpt-5.6-terra': 872_000,
  'gpt-5.6-luna': 872_000,
  'gpt-5.4': 1_000_000,
  'gpt-5.5': 272_000,
  'gpt-5.4-mini': 272_000,
})

/**
 * Keep unlisted or newer provider defaults usable without inventing a larger
 * limit. A live `max_context_window` is the authoritative ceiling when present;
 * the shipped table only covers installed models the live catalog did not reach.
 * @param id - catalog model id.
 * @param contextWindow - advertised default budget for this model.
 * @param liveMaxContextWindow - server `max_context_window`, when the live catalog declared one.
 * @returns the ceiling accepted by override validation and its provenance.
 */
export function openAICodexContextLimit(
  id: string,
  contextWindow: number,
  liveMaxContextWindow?: number,
): {
  maxContextWindow: number
  contextLimitSource: 'codex-catalog' | 'catalog-default'
} {
  const ceiling = liveMaxContextWindow ?? (Object.hasOwn(CONFIGURATION_LIMITS, id) ? CONFIGURATION_LIMITS[id] : undefined)
  return ceiling === undefined || ceiling < contextWindow
    ? { maxContextWindow: contextWindow, contextLimitSource: 'catalog-default' }
    : { maxContextWindow: ceiling, contextLimitSource: 'codex-catalog' }
}

/** Resolve the advertised budget for one model from the selected context-window mode. */
export function openAICodexModeContextWindow(
  defaultWindow: number,
  extendedWindow: number,
  mode: OpenAICodexContextWindowMode,
): number {
  return mode === 'extended' ? Math.max(defaultWindow, extendedWindow) : defaultWindow
}

/** Whether a proposed local token budget fits the model's configuration range. */
export function isValidOpenAICodexContextBudget(value: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum
}

/** One model available from the complete provider catalog. */
export interface OpenAICodexModelCatalogEntry {
  id: string
  name: string
  /** Selected mode's advertised budget, even when a per-model override is active. */
  contextWindow: number
  /** Selected catalog default maximum output tokens, even when an override is active. */
  maxTokens: number
  /** Local configuration ceiling; account/route capacity can differ. */
  maxContextWindow: number
  contextLimitSource: 'codex-catalog' | 'catalog-default'
  /** Server-advertised tiers when the live catalog declared them; absent for bundled-only models. */
  serviceTiers?: readonly OpenAICodexModelServiceTier[]
  /** Server-advertised reasoning efforts when the live catalog declared them. */
  reasoningLevels?: readonly OpenAICodexModelReasoningLevel[]
}

/** Where the effective catalog came from and when it was last replaced. */
export interface OpenAICodexModelCatalogStatus {
  source: OpenAICodexCatalogSource
  /** Epoch milliseconds of the last accepted catalog payload; absent when only the bundled catalog answered. */
  updatedAt?: number
  /** Official client version sent as the `client_version` gate. */
  clientVersion: string
  /** Number of models in the effective catalog. */
  modelCount: number
  /** Live slugs whose family the installed catalog does not know; kept out of the picker. */
  unavailableModels: readonly string[]
}

/** Validate the model catalog before it enters React state. */
export function decodeOpenAICodexModelCatalog(value: unknown): OpenAICodexModelCatalogEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const catalog: OpenAICodexModelCatalogEntry[] = []
  const ids = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined
    const record = entry as Record<string, unknown>
    const id = record['id']
    const name = record['name']
    const contextWindow = record['contextWindow']
    const maxTokens = record['maxTokens']
    const maxContextWindow = record['maxContextWindow']
    const contextLimitSource = record['contextLimitSource']
    if (typeof id !== 'string' || id.length === 0 || typeof name !== 'string' || name.length === 0 || ids.has(id)) return undefined
    if (typeof contextWindow !== 'number' || typeof maxTokens !== 'number' || typeof maxContextWindow !== 'number'
      || !isValidOpenAICodexContextBudget(maxContextWindow, Number.MAX_SAFE_INTEGER)
      || !isValidOpenAICodexContextBudget(contextWindow, maxContextWindow)
      || !isValidOpenAICodexContextBudget(maxTokens, maxContextWindow)
      || (contextLimitSource !== 'codex-catalog' && contextLimitSource !== 'catalog-default')) return undefined
    const serviceTiers = decodeServiceTiers(record['serviceTiers'])
    const reasoningLevels = decodeReasoningLevels(record['reasoningLevels'])
    if (record['serviceTiers'] !== undefined && serviceTiers === undefined) return undefined
    if (record['reasoningLevels'] !== undefined && reasoningLevels === undefined) return undefined
    ids.add(id)
    catalog.push({
      id, name, contextWindow, maxTokens, maxContextWindow, contextLimitSource,
      ...serviceTiers === undefined ? {} : { serviceTiers },
      ...reasoningLevels === undefined ? {} : { reasoningLevels },
    })
  }
  return catalog
}

/** Accept a bounded service-tier list from the Host route, ignoring malformed entries. */
function decodeServiceTiers(value: unknown): OpenAICodexModelServiceTier[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  const tiers: OpenAICodexModelServiceTier[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined
    const record = item as Record<string, unknown>
    const id = record['id']
    if (typeof id !== 'string' || id.length === 0) return undefined
    const name = record['name']
    const description = record['description']
    if (name !== undefined && typeof name !== 'string') return undefined
    if (description !== undefined && typeof description !== 'string') return undefined
    tiers.push({ id, ...name === undefined ? {} : { name }, ...description === undefined ? {} : { description } })
  }
  return tiers
}

/** Accept a bounded reasoning-effort list from the Host route, ignoring malformed entries. */
function decodeReasoningLevels(value: unknown): OpenAICodexModelReasoningLevel[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  const levels: OpenAICodexModelReasoningLevel[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined
    const record = item as Record<string, unknown>
    const effort = record['effort']
    if (typeof effort !== 'string' || effort.length === 0) return undefined
    const description = record['description']
    if (description !== undefined && typeof description !== 'string') return undefined
    levels.push({ effort, ...description === undefined ? {} : { description } })
  }
  return levels
}

/** Validate the catalog-source status before it enters React state. */
export function decodeOpenAICodexModelCatalogStatus(value: unknown): OpenAICodexModelCatalogStatus | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const source = record['source']
  const clientVersion = record['clientVersion']
  const modelCount = record['modelCount']
  const updatedAt = record['updatedAt']
  const unavailableModels = record['unavailableModels']
  if (source !== 'live' && source !== 'cache' && source !== 'cli-cache' && source !== 'bundled') return undefined
  if (typeof clientVersion !== 'string' || clientVersion.length === 0) return undefined
  if (typeof modelCount !== 'number' || !Number.isSafeInteger(modelCount) || modelCount < 0) return undefined
  if (updatedAt !== undefined && (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt))) return undefined
  if (unavailableModels !== undefined
    && (!Array.isArray(unavailableModels) || unavailableModels.some(entry => typeof entry !== 'string'))) return undefined
  return {
    source,
    clientVersion,
    modelCount,
    ...updatedAt === undefined ? {} : { updatedAt },
    unavailableModels: unavailableModels ?? [],
  }
}
