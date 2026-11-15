/** Node-free settings contract shared by the Host plugin and browser card. */

import type { OpenAICodexContextWindowMode } from './model-contract.ts'
import { parseOpenAICodexSpeedDefault } from './speed-mode-contract.ts'
import type { OpenAICodexSpeedMode } from './speed-mode-contract.ts'
import { parseOpenAICodexReasoningEffort } from './reasoning-defaults.ts'
import type { OpenAICodexReasoningEffort } from './reasoning-defaults.ts'
import { parseAutoReviewLocalPolicy } from './auto-review-local-policy.ts'
import type { AutoReviewLocalPolicy } from './auto-review-local-policy.ts'

/** Stable Harness settings namespace owned by this plugin. */
export const OPENAI_CODEX_SETTINGS_NAMESPACE = 'llm-openai-codex'

/**
 * Official client version the model catalog endpoint requires. The endpoint is
 * version-gated: a recent official value returns the full catalog, older
 * values return an empty list, and omitting it fails with HTTP 400. Override
 * only to follow a newer official client.
 */
export const DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION = '0.155.0'

/** Default context-window mode: the server's default budget, not its extended ceiling. */
export const DEFAULT_OPENAI_CODEX_CONTEXT_WINDOW_MODE = 'default' as const

/** Whether a value is a bounded official-client version sent as `client_version`. */
export function isValidOpenAICodexModelCatalogClientVersion(value: unknown): value is string {
  return typeof value === 'string' && /^(?=.{1,32}$)\d+\.\d+\.\d+$/u.test(value)
}

/** Parse a bounded official-client version without exposing malformed input. */
export function parseOpenAICodexModelCatalogClientVersion(value: unknown): string {
  if (!isValidOpenAICodexModelCatalogClientVersion(value)) {
    throw new TypeError('OpenAI Codex modelCatalogClientVersion must be a dotted numeric client version such as 0.155.0')
  }
  return value
}

/** Suggested local HTTP proxy shown by the settings UI; it is never enabled by default. */
export const DEFAULT_OPENAI_CODEX_PROXY_URL = 'http://127.0.0.1:7890'

/** Empty profile setting, which makes image requests use the default route hint. */
export const DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT = ''

/** Validate an optional bounded ASCII image route model hint. */
export function isValidOpenAICodexImageModelHint(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || /^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value))
}

/** Parse an image route model hint without exposing malformed input. */
export function parseOpenAICodexImageModelHint(value: unknown): string {
  if (!isValidOpenAICodexImageModelHint(value)) {
    throw new TypeError('OpenAI Codex imageModelHint must be empty or a bounded ASCII model slug')
  }
  return value
}

/**
 * Normalize the credential-free HTTP proxy URL accepted by Codex Connect.
 * Paths, query strings, fragments, and embedded credentials are rejected so
 * the value remains an origin rather than an opaque request target.
 */
export function normalizeOpenAICodexProxyUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  try {
    const parsed = new URL(value.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    if (parsed.username !== '' || parsed.password !== '') return undefined
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') return undefined
    if (parsed.hostname.length === 0) return undefined
    if (parsed.port !== '' && (!/^\d+$/u.test(parsed.port) || Number(parsed.port) < 1 || Number(parsed.port) > 65_535)) return undefined
    return parsed.origin
  } catch {
    return undefined
  }
}

/** Whether a value is a supported, canonical HTTP(S) proxy origin. */
export function isValidOpenAICodexProxyUrl(value: unknown): value is string {
  return normalizeOpenAICodexProxyUrl(value) !== undefined
}

/** Search modes accepted by the Codex standalone search endpoint. */
export type OpenAICodexSearchMode = 'cached' | 'indexed' | 'live'

/** Search-context sizes accepted by the Codex standalone search endpoint. */
export type OpenAICodexSearchContextSize = 'low' | 'medium' | 'high'

/**
 * Whether a value is a bounded per-model override map. Keys are nonempty,
 * unpadded model ids; values are positive safe integers or null to restore
 * that model's catalog default. The Host also checks catalog membership and
 * the model-specific configuration ceiling.
 */
function isOpenAICodexOverrideMap(value: unknown): value is Readonly<Record<string, number | null>> {
  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  if (entries.length > 256) return false
  return entries.every(([modelId, budget]) => modelId.length > 0 && modelId.trim() === modelId
    && (budget === null || (typeof budget === 'number' && Number.isSafeInteger(budget) && budget > 0)))
}

/** Preserve per-model null masks until the Host has merged its settings layers. */
function parseOpenAICodexOverrideMap(value: unknown, field: string): Readonly<Record<string, number | null>> | undefined {
  if (value === undefined || value === null) return undefined
  if (!isOpenAICodexOverrideMap(value)) {
    throw new TypeError(`OpenAI Codex ${field} must contain at most 256 nonempty model ids with positive safe-integer token budgets or null resets`)
  }
  return { ...value }
}

/** Resolve merged settings; whole-map or per-model null masks use catalog defaults. */
function resolveOpenAICodexOverrideMap(overrides: Readonly<Record<string, number | null>> | undefined): Readonly<Record<string, number>> | undefined {
  if (overrides === undefined) return undefined
  return Object.fromEntries(Object.entries(overrides).filter((entry): entry is [string, number] => entry[1] !== null))
}

/** Whether a value is a bounded per-model context-window override map. */
export function isValidOpenAICodexContextWindowOverrides(value: unknown): value is Readonly<Record<string, number | null>> {
  return isOpenAICodexOverrideMap(value)
}

/** Preserve per-model context-window null masks until the Host merges its settings layers. */
export function parseOpenAICodexContextWindowOverrides(value: unknown): Readonly<Record<string, number | null>> | undefined {
  return parseOpenAICodexOverrideMap(value, 'contextWindowOverrides')
}

/** Resolve merged context-window overrides; whole-map or per-model null masks use catalog defaults. */
export function resolveOpenAICodexContextWindowOverrides(value: unknown): Readonly<Record<string, number>> | undefined {
  return resolveOpenAICodexOverrideMap(parseOpenAICodexContextWindowOverrides(value))
}

/** Whether a value is a bounded per-model maximum-output-token override map. */
export function isValidOpenAICodexMaxTokensOverrides(value: unknown): value is Readonly<Record<string, number | null>> {
  return isOpenAICodexOverrideMap(value)
}

/** Preserve per-model maximum-output-token null masks until the Host merges its settings layers. */
export function parseOpenAICodexMaxTokensOverrides(value: unknown): Readonly<Record<string, number | null>> | undefined {
  return parseOpenAICodexOverrideMap(value, 'maxTokensOverrides')
}

/** Resolve merged maximum-output-token overrides; whole-map or per-model null masks use catalog defaults. */
export function resolveOpenAICodexMaxTokensOverrides(value: unknown): Readonly<Record<string, number>> | undefined {
  return resolveOpenAICodexOverrideMap(parseOpenAICodexMaxTokensOverrides(value))
}

/** Default model used by the standalone search endpoint. */
export const DEFAULT_OPENAI_CODEX_SEARCH_MODEL = 'gpt-5.6-sol'
/** Default search mode, matching the official local Codex client. */
export const DEFAULT_OPENAI_CODEX_SEARCH_MODE: OpenAICodexSearchMode = 'cached'
/** Default provider search-context size. */
export const DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE: OpenAICodexSearchContextSize = 'medium'
/** Default output budget for the standalone search response. */
export const DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS = 10_000

/**
 * Codex model transport. `sse` keeps finite response streams, `auto` opens a
 * request-owned WebSocket per request, and `websocket-cached` keeps one
 * resident connection per admitted conversation so consecutive turns can
 * continue through `previous_response_id`.
 */
export type OpenAICodexModelTransport = 'sse' | 'auto' | 'websocket-cached'

/** Transport used when no resident connection is configured. */
export const DEFAULT_OPENAI_CODEX_MODEL_TRANSPORT: OpenAICodexModelTransport = 'sse'

/** Default resident-connection budget; 0 keeps every model request on SSE. */
export const DEFAULT_OPENAI_CODEX_MAX_RESIDENT_SESSIONS = 2

/** Largest resident-connection budget this contract accepts. */
export const MAX_OPENAI_CODEX_RESIDENT_SESSIONS = 8

/**
 * Parse an explicit transport selection.
 * @param value - serialized selection; omission leaves the transport to the resident budget.
 * @returns the validated transport, or undefined when the setting is absent.
 */
export function parseOpenAICodexModelTransport(value: unknown): OpenAICodexModelTransport | undefined {
  if (value === undefined || value === null) return undefined
  if (value !== 'sse' && value !== 'auto' && value !== 'websocket-cached') {
    throw new TypeError('OpenAI Codex transport must be "sse", "auto", or "websocket-cached"')
  }
  return value
}

/**
 * Whether a value is a supported resident-connection budget.
 * @param value - candidate budget.
 * @returns true for an integer from 0 through the supported maximum.
 */
export function isValidOpenAICodexResidentSessions(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_OPENAI_CODEX_RESIDENT_SESSIONS
}

/**
 * Validate one resident-connection budget.
 * @param value - serialized budget; omission uses the default.
 * @returns the bounded budget.
 */
export function parseOpenAICodexMaxResidentSessions(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_OPENAI_CODEX_MAX_RESIDENT_SESSIONS
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_OPENAI_CODEX_RESIDENT_SESSIONS) {
    throw new TypeError(`OpenAI Codex maxResidentWebSocketSessions must be an integer from 0 to ${MAX_OPENAI_CODEX_RESIDENT_SESSIONS}`)
  }
  return value
}

/**
 * Resolve the transport one profile should publish. The settings card's budget
 * is authoritative for continuation; `sse` is the operator's hard off switch,
 * and `auto` keeps request-owned WebSocket only while the budget is 0.
 * @param settings - resolved settings with the optional explicit selection.
 * @returns the transport to publish on the adapter profile.
 */
export function resolveOpenAICodexModelTransport(
  settings: Pick<OpenAICodexSettingsConfig, 'transport' | 'maxResidentWebSocketSessions'>,
): OpenAICodexModelTransport {
  if (settings.transport === 'sse') return 'sse'
  if (settings.maxResidentWebSocketSessions > 0) return 'websocket-cached'
  return settings.transport === 'auto' ? 'auto' : DEFAULT_OPENAI_CODEX_MODEL_TRANSPORT
}

/** Fully resolved user-editable section presented by Plugin configuration. */
export interface OpenAICodexSettingsConfig {
  /**
   * Explicit model transport; undefined lets {@link maxResidentWebSocketSessions}
   * decide, and `auto` keeps request-owned WebSocket connections without reuse.
   */
  transport?: OpenAICodexModelTransport | undefined
  /**
   * Resident continuation connections kept open for conversation turns. Each
   * admitted conversation holds one connection while it stays active; title,
   * compaction, Auto-review, and subagent requests always use SSE. 0 disables
   * continuation entirely.
   */
  maxResidentWebSocketSessions: number
  /** Model ids advertised in selectors; undefined advertises the full catalog. */
  models: string[] | undefined
  /** Route Codex Connect requests through the explicitly configured proxy. */
  enableProxy: boolean
  /** Credential-free HTTP(S) proxy origin; inactive while enableProxy is false. */
  proxyUrl: string
  /**
   * Per-model context-window overrides keyed by catalog model id. Each value
   * replaces the advertised `contextWindow` for that model inside the adapter
   * profile for client budgeting. It does not change or verify server capacity,
   * output-token limits, or the deployment's compaction policy.
   */
  contextWindowOverrides: Readonly<Record<string, number>> | undefined
  /**
   * Per-model maximum output tokens keyed by catalog model id. Each value sets
   * the request default output cap DSH reports for that model and the resolved
   * model record's `maxTokens`. It does not change the context window or the
   * provider's actual capability.
   */
  maxTokensOverrides: Readonly<Record<string, number>> | undefined
  /**
   * Which server-advertised window becomes the advertised budget. "default"
   * uses the live catalog's `context_window`; "extended" uses its
   * `max_context_window`, the same ceiling override validation accepts.
   * An explicit per-model `contextWindowOverrides` entry still wins.
   */
  contextWindowMode: OpenAICodexContextWindowMode
  /** Official client version sent as the model catalog's `client_version` gate. */
  modelCatalogClientVersion: string
  /**
   * Log the payload field names of each Codex request. Development-only: it
   * records field names, never payload content, and the default is off.
   */
  debugLogPayloadFields: boolean
  enableNewSessionFastMode: boolean
  enableNewSubagentFastMode: boolean
  newSessionSpeedMode: OpenAICodexSpeedMode | undefined
  newSubagentSpeedMode: OpenAICodexSpeedMode | undefined
  reasoningEffort: OpenAICodexReasoningEffort | undefined
  enableSearch: boolean
  enableImageTool: boolean
  enableImageGeneration: boolean
  /** Optional profile-scoped model hint for image generation; empty uses the route default. */
  imageModelHint: string
  /** Whether this profile accepted the Auto-review data disclosure. */
  autoReviewDisclosureAcknowledged: boolean
  /** Let the hidden Codex reviewer answer eligible DSH approval requests. */
  enableAutoReview: boolean
  /** Explicit local standing scope; remote model advice never grants authority. */
  autoReviewLocalPolicy: AutoReviewLocalPolicy
  searchModel: string
  searchMode: OpenAICodexSearchMode
  searchContextSize: OpenAICodexSearchContextSize
  searchMaxOutputTokens: number
}

export const DEFAULT_OPENAI_CODEX_SETTINGS: Readonly<OpenAICodexSettingsConfig> = Object.freeze({
  transport: undefined,
  maxResidentWebSocketSessions: DEFAULT_OPENAI_CODEX_MAX_RESIDENT_SESSIONS,
  models: undefined,
  enableProxy: false,
  proxyUrl: DEFAULT_OPENAI_CODEX_PROXY_URL,
  contextWindowOverrides: undefined,
  maxTokensOverrides: undefined,
  contextWindowMode: DEFAULT_OPENAI_CODEX_CONTEXT_WINDOW_MODE,
  modelCatalogClientVersion: DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION,
  debugLogPayloadFields: false,
  enableNewSessionFastMode: false,
  enableNewSubagentFastMode: false,
  newSessionSpeedMode: undefined,
  newSubagentSpeedMode: undefined,
  reasoningEffort: undefined,
  enableSearch: false,
  enableImageTool: false,
  enableImageGeneration: false,
  imageModelHint: DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT,
  autoReviewDisclosureAcknowledged: false,
  enableAutoReview: false,
  autoReviewLocalPolicy: 'manual',
  searchModel: DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  searchMode: DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  searchContextSize: DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  searchMaxOutputTokens: DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
})

/** Input settings allow null to disable overrides inherited from a lower settings layer. */
export interface OpenAICodexSettingsInput
  extends Partial<Omit<OpenAICodexSettingsConfig, 'contextWindowOverrides' | 'maxTokensOverrides' | 'newSessionSpeedMode' | 'newSubagentSpeedMode' | 'reasoningEffort'>> {
  newSessionSpeedMode?: OpenAICodexSpeedMode | null | undefined
  newSubagentSpeedMode?: OpenAICodexSpeedMode | null | undefined
  reasoningEffort?: OpenAICodexReasoningEffort | null | undefined
  contextWindowOverrides?: Readonly<Record<string, number | null>> | null | undefined
  maxTokensOverrides?: Readonly<Record<string, number | null>> | null | undefined
}

/** Fill the schema defaults even when called without Cordis validation. */
export function resolveOpenAICodexSettings(
  value: OpenAICodexSettingsInput,
): OpenAICodexSettingsConfig {
  const resolved = { ...DEFAULT_OPENAI_CODEX_SETTINGS, ...value }
  if (!isValidOpenAICodexProxyUrl(resolved.proxyUrl)) {
    throw new TypeError('OpenAI Codex proxyUrl must be an HTTP(S) origin without credentials or a path')
  }
  parseOpenAICodexImageModelHint(resolved.imageModelHint)
  parseOpenAICodexModelCatalogClientVersion(resolved.modelCatalogClientVersion)
  if (resolved.contextWindowMode !== 'default' && resolved.contextWindowMode !== 'extended') {
    throw new TypeError('OpenAI Codex contextWindowMode must be "default" or "extended"')
  }
  return {
    ...resolved,
    transport: parseOpenAICodexModelTransport(resolved.transport),
    maxResidentWebSocketSessions: parseOpenAICodexMaxResidentSessions(resolved.maxResidentWebSocketSessions),
    newSessionSpeedMode: parseOpenAICodexSpeedDefault(resolved.newSessionSpeedMode) ?? undefined,
    newSubagentSpeedMode: parseOpenAICodexSpeedDefault(resolved.newSubagentSpeedMode) ?? undefined,
    reasoningEffort: parseOpenAICodexReasoningEffort(resolved.reasoningEffort) ?? undefined,
    autoReviewLocalPolicy: parseAutoReviewLocalPolicy(resolved.autoReviewLocalPolicy),
    contextWindowOverrides: resolveOpenAICodexContextWindowOverrides(resolved.contextWindowOverrides),
    maxTokensOverrides: resolveOpenAICodexMaxTokensOverrides(resolved.maxTokensOverrides),
  }
}

/** Resolve the active proxy without treating a disabled value as a route. */
export function resolveOpenAICodexProxyUrl(
  value: OpenAICodexSettingsInput,
): string | undefined {
  const resolved = resolveOpenAICodexSettings(value)
  return resolved.enableProxy ? normalizeOpenAICodexProxyUrl(resolved.proxyUrl) : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrow the redacted settings wire payload before it enters React state. */
export function decodeOpenAICodexSettings(value: unknown): OpenAICodexSettingsConfig | undefined {
  if (!isRecord(value)) return undefined
  const transport = value['transport']
  if (transport !== undefined && transport !== 'sse' && transport !== 'auto' && transport !== 'websocket-cached') return undefined
  const maxResidentWebSocketSessions = value['maxResidentWebSocketSessions']
  const models = value['models']
  const enableProxy = value['enableProxy']
  const proxyUrl = value['proxyUrl']
  const contextWindowOverrides = value['contextWindowOverrides']
  const maxTokensOverrides = value['maxTokensOverrides']
  const contextWindowMode = value['contextWindowMode']
  const modelCatalogClientVersion = value['modelCatalogClientVersion']
  const debugLogPayloadFields = value['debugLogPayloadFields']
  const enableNewSessionFastMode = value['enableNewSessionFastMode']
  const enableNewSubagentFastMode = value['enableNewSubagentFastMode']
  const newSessionSpeedMode = value['newSessionSpeedMode']
  const newSubagentSpeedMode = value['newSubagentSpeedMode']
  const reasoningEffort = value['reasoningEffort']
  const autoReviewLocalPolicy = value['autoReviewLocalPolicy']
  const enableSearch = value['enableSearch']
  const enableImageTool = value['enableImageTool']
  const enableImageGeneration = value['enableImageGeneration']
  const imageModelHint = value['imageModelHint']
  const autoReviewDisclosureAcknowledged = value['autoReviewDisclosureAcknowledged']
  const enableAutoReview = value['enableAutoReview']
  const searchModel = value['searchModel']
  const searchMode = value['searchMode']
  const searchContextSize = value['searchContextSize']
  const searchMaxOutputTokens = value['searchMaxOutputTokens']
  if (models !== undefined && (!Array.isArray(models) || models.some(model => typeof model !== 'string'))) return undefined
  // Older Host snapshots predate the resident budget; absence maps to its safe default.
  if (maxResidentWebSocketSessions !== undefined && !isValidOpenAICodexResidentSessions(maxResidentWebSocketSessions)) return undefined
  if (enableProxy !== undefined && typeof enableProxy !== 'boolean') return undefined
  if (proxyUrl !== undefined && (typeof proxyUrl !== 'string' || !isValidOpenAICodexProxyUrl(proxyUrl))) return undefined
  if (contextWindowOverrides !== undefined && contextWindowOverrides !== null && !isValidOpenAICodexContextWindowOverrides(contextWindowOverrides)) return undefined
  if (maxTokensOverrides !== undefined && maxTokensOverrides !== null && !isValidOpenAICodexMaxTokensOverrides(maxTokensOverrides)) return undefined
  // Older Host snapshots predate the context-window mode; absence maps to its safe default.
  if (contextWindowMode !== undefined && contextWindowMode !== 'default' && contextWindowMode !== 'extended') return undefined
  if (modelCatalogClientVersion !== undefined && !isValidOpenAICodexModelCatalogClientVersion(modelCatalogClientVersion)) return undefined
  // Older Host snapshots predate payload-field logging; absence maps to its safe default.
  if (enableNewSessionFastMode !== undefined && typeof enableNewSessionFastMode !== 'boolean') return undefined
  if (enableNewSubagentFastMode !== undefined && typeof enableNewSubagentFastMode !== 'boolean') return undefined
  if (debugLogPayloadFields !== undefined && typeof debugLogPayloadFields !== 'boolean') return undefined
  if (typeof enableSearch !== 'boolean' || typeof enableImageTool !== 'boolean') return undefined
  // Older Host snapshots predate image generation; absence maps to its safe default.
  if (enableImageGeneration !== undefined && typeof enableImageGeneration !== 'boolean') return undefined
  if (imageModelHint !== undefined && !isValidOpenAICodexImageModelHint(imageModelHint)) return undefined
  // Older Host snapshots predate the disclosure acknowledgement; absence requires confirmation.
  if (autoReviewDisclosureAcknowledged !== undefined && typeof autoReviewDisclosureAcknowledged !== 'boolean') return undefined
  // Older Host snapshots predate Auto-review; absence maps to its safe default.
  if (enableAutoReview !== undefined && typeof enableAutoReview !== 'boolean') return undefined
  if (typeof searchModel !== 'string' || searchModel.trim().length === 0) return undefined
  if (searchMode !== 'cached' && searchMode !== 'indexed' && searchMode !== 'live') return undefined
  if (searchContextSize !== 'low' && searchContextSize !== 'medium' && searchContextSize !== 'high') return undefined
  if (typeof searchMaxOutputTokens !== 'number' || !Number.isInteger(searchMaxOutputTokens) || searchMaxOutputTokens < 1) return undefined
  let newSessionSpeed: OpenAICodexSpeedMode | undefined
  let newSubagentSpeed: OpenAICodexSpeedMode | undefined
  let effort: OpenAICodexReasoningEffort | undefined
  let localPolicy: AutoReviewLocalPolicy
  try {
    newSessionSpeed = parseOpenAICodexSpeedDefault(newSessionSpeedMode) ?? undefined
    newSubagentSpeed = parseOpenAICodexSpeedDefault(newSubagentSpeedMode) ?? undefined
    effort = parseOpenAICodexReasoningEffort(reasoningEffort) ?? undefined
    localPolicy = parseAutoReviewLocalPolicy(autoReviewLocalPolicy)
  } catch (error) {
    // Malformed wire settings must not become an editable or permissive snapshot.
    return undefined
  }
  const overrides = resolveOpenAICodexContextWindowOverrides(contextWindowOverrides)
  const tokenOverrides = resolveOpenAICodexMaxTokensOverrides(maxTokensOverrides)
  return {
    transport: parseOpenAICodexModelTransport(transport),
    maxResidentWebSocketSessions: parseOpenAICodexMaxResidentSessions(maxResidentWebSocketSessions),
    models: models === undefined ? undefined : [...new Set(models)],
    enableProxy: enableProxy ?? false,
    proxyUrl: proxyUrl === undefined ? DEFAULT_OPENAI_CODEX_PROXY_URL : normalizeOpenAICodexProxyUrl(proxyUrl)!,
    contextWindowOverrides: overrides === undefined ? undefined : Object.freeze(overrides),
    maxTokensOverrides: tokenOverrides === undefined ? undefined : Object.freeze(tokenOverrides),
    contextWindowMode: (contextWindowMode as OpenAICodexContextWindowMode | undefined) ?? DEFAULT_OPENAI_CODEX_CONTEXT_WINDOW_MODE,
    modelCatalogClientVersion: modelCatalogClientVersion ?? DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION,
    debugLogPayloadFields: debugLogPayloadFields ?? false,
    enableNewSessionFastMode: enableNewSessionFastMode ?? false,
    enableNewSubagentFastMode: enableNewSubagentFastMode ?? false,
    newSessionSpeedMode: newSessionSpeed,
    newSubagentSpeedMode: newSubagentSpeed,
    reasoningEffort: effort,
    autoReviewLocalPolicy: localPolicy,
    enableSearch,
    enableImageTool,
    enableImageGeneration: enableImageGeneration ?? false,
    imageModelHint: imageModelHint ?? DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT,
    autoReviewDisclosureAcknowledged: autoReviewDisclosureAcknowledged ?? false,
    enableAutoReview: enableAutoReview ?? false,
    searchModel,
    searchMode,
    searchContextSize,
    searchMaxOutputTokens,
  }
}
