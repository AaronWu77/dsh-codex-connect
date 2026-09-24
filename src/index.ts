/**
 * ChatGPT OAuth and Codex models for DeepSeek Harness, with opt-in search and
 * image tooling.
 * @module dsh-codex-connect
 */

import './undici-runtime.ts'
import './message-source.ts'
import type { Context, Fiber, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-web'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-user-approval'
import {
  assertOpenAICodexContextWindowOverrides,
  assertOpenAICodexMaxTokensOverrides,
  createOpenAICodexAdapter,
  openAICodexModelCatalog,
  openAICodexModelCatalogFrom,
  openAICodexUnavailableModels,
} from './adapter.ts'
import type { OpenAICodexCatalogLayer } from './adapter.ts'
import { OPENAI_CODEX_PRIMARY_ROUTE } from './adapter.ts'
import type { OpenAICodexRouteBinding } from './adapter.ts'
import type { OpenAICodexAccountRoute } from './account-routes.ts'
import { OpenAICodexAccountRouteRegistry } from './account-routes.ts'
import { OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS, registerOpenAICodexAuthRoutes } from './auth-routes.ts'
import { registerOpenAICodexProxyRoutes } from './proxy-routes.ts'
import { OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME, OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import { registerOpenAICodexModelCatalogRoute, registerOpenAICodexModelCatalogStatusRoutes } from './model-routes.ts'
import { OPENAI_CODEX_MODEL_CATALOG_CACHE_FILENAME, OpenAICodexModelCatalog } from './model-catalog.ts'
import type { OpenAICodexContextWindowMode, OpenAICodexModelCatalogStatus } from './model-contract.ts'
import { registerOpenAICodexQuotaRoute } from './quota-routes.ts'
import { registerOpenAICodexOriginalImageRoute } from './image-asset-routes.ts'
import {
  compareOpenAICodexVersions,
  parseOpenAICodexVersion,
} from './update.ts'
import { FastModeRegistry } from './fast-mode.ts'
import { assertNoOpenAICodexProviderConflict } from './doctor.ts'
import { imageGenerateTool } from './image-tool.ts'
import { viewImageTool } from './view-image.ts'
import { OpenAICodexTransport } from './transport.ts'
import type { OpenAICodexTransportV1 } from './transport.ts'
import { OpenAICodexProxyManager } from './provider-proxy.ts'
import { OpenAICodexImageAssetStore } from './image-assets.ts'
import { registerOpenAICodexAutoReview } from './auto-review.ts'
import { selectOpenAICodexSearchRoute } from './search-route-override.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-only image transport owned by the Codex Connect core fiber. */
    openaiCodexTransport: OpenAICodexTransportV1
  }
}

export { VIEW_IMAGE_TOOL_NAME } from './view-image.ts'
export { IMAGE_GENERATE_TOOL_NAME } from './image-tool.ts'
export {
  assertNoOpenAICodexProviderConflict,
  diagnoseOpenAICodex,
  openAICodexConflictMessage,
} from './doctor.ts'
export type {
  OpenAICodexDiagnosticOptions,
  OpenAICodexDiagnosticReport,
} from './doctor.ts'
export {
  assessCompatibility,
  COMPATIBILITY_CONTRACT,
  COMPATIBILITY_PACKAGES,
  COMPATIBILITY_SCHEMA_VERSION,
  detectCompatibility,
  DSH_PLUGIN_API_PACKAGES,
  PI_AI_PACKAGE,
  SUPPORTED_DSH_PLUGIN_API_VERSION,
  SUPPORTED_DSH_PLUGIN_API_VERSIONS,
  SUPPORTED_DSH_PLUGIN_API_RANGE,
  SUPPORTED_NODE_RANGE,
  SUPPORTED_PI_AI_RANGE,
  evaluateCompatibility,
} from './compatibility.ts'
export type {
  CompatibilityDetectionOptions,
  CompatibilityEntry,
  CompatibilityEvaluationInput,
  CompatibilityPackageName,
  CompatibilityReport,
  CompatibilityStatus,
} from './compatibility.ts'
export { OPENAI_CODEX_USAGE_URL, parseOpenAICodexUsage, readOpenAICodexRateLimits } from './usage.ts'
export type {
  OpenAICodexCredits,
  OpenAICodexIndividualLimit,
  OpenAICodexRateLimit,
  OpenAICodexRateLimitWindow,
  OpenAICodexUsage,
} from './usage.ts'
import {
  DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  OpenAICodexSearchProvider,
} from './search.ts'
import type { OpenAICodexSearchContextSize, OpenAICodexSearchMode } from './search.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from './store.ts'
import {
  DEFAULT_OPENAI_CODEX_CONTEXT_WINDOW_MODE,
  DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION,
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  parseOpenAICodexImageModelHint,
  parseOpenAICodexModelCatalogClientVersion,
  OPENAI_CODEX_SETTINGS_NAMESPACE,
  resolveOpenAICodexProxyUrl,
  resolveOpenAICodexSettings,
  parseOpenAICodexContextWindowOverrides,
  parseOpenAICodexMaxTokensOverrides,
} from './settings-contract.ts'
import type { OpenAICodexSettingsInput } from './settings-contract.ts'

export {
  decodeOpenAICodexSettings,
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT,
  DEFAULT_OPENAI_CODEX_SETTINGS,
  isValidOpenAICodexImageModelHint,
  isValidOpenAICodexContextWindowOverrides,
  isValidOpenAICodexMaxTokensOverrides,
  isValidOpenAICodexProxyUrl,
  OPENAI_CODEX_SETTINGS_NAMESPACE,
  resolveOpenAICodexProxyUrl,
  resolveOpenAICodexSettings,
} from './settings-contract.ts'
export type { OpenAICodexSettingsConfig } from './settings-contract.ts'
export {
  DEFAULT_OPENAI_CODEX_CONTEXT_WINDOW_MODE,
  DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION,
  isValidOpenAICodexModelCatalogClientVersion,
} from './settings-contract.ts'
export {
  decodeOpenAICodexModelCatalogStatus,
  openAICodexContextLimit,
  openAICodexModeContextWindow,
  OPENAI_CODEX_MODEL_CATALOG_PATH,
  OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH,
  OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH,
} from './model-contract.ts'
export type {
  OpenAICodexCatalogSource,
  OpenAICodexContextWindowMode,
  OpenAICodexModelCatalogStatus,
  OpenAICodexModelReasoningLevel,
  OpenAICodexModelServiceTier,
} from './model-contract.ts'
export {
  OPENAI_CODEX_MODEL_CATALOG_CACHE_FILENAME,
  OPENAI_CODEX_MODEL_CATALOG_TTL_MS,
  OPENAI_CODEX_MODELS_URL,
  OpenAICodexModelCatalog,
  openAICodexCliModelCachePath,
  parseOpenAICodexModelsPayload,
} from './model-catalog.ts'
export type {
  OpenAICodexCatalogSnapshot,
  OpenAICodexLiveModel,
  OpenAICodexModelCatalogOptions,
} from './model-catalog.ts'

export {
  isOpenAICodexTransportError,
  OPENAI_CODEX_IMAGE_GENERATION_URL,
  OPENAI_CODEX_IMAGE_MAX_COUNT,
  OPENAI_CODEX_IMAGE_MAX_ERROR_BYTES,
  OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES,
  OPENAI_CODEX_IMAGE_PROMPT_MAX_LENGTH,
  OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS,
  OPENAI_CODEX_TRANSPORT_API_VERSION,
  OPENAI_CODEX_TRANSPORT_ERROR_CODES,
  OPENAI_CODEX_TRANSPORT_SERVICE,
  OpenAICodexTransport,
  OpenAICodexTransportError,
} from './transport.ts'

export {
  detectOpenAICodexProxies,
  listOpenAICodexProxyCandidates,
  OPENAI_CODEX_LOCAL_PROXY_CANDIDATES,
  OPENAI_CODEX_PROXY_CANDIDATE_LIMIT,
  OPENAI_CODEX_PROXY_PROBE_TIMEOUT_MS,
  OPENAI_CODEX_PROXY_PROBE_URL,
  OpenAICodexProxyManager,
} from './provider-proxy.ts'
export type {
  OpenAICodexProxyProbeClassification,
  OpenAICodexProxyProbeResult,
} from './provider-proxy.ts'
export {
  OPENAI_CODEX_PROXY_DETECT_PATH,
  OPENAI_CODEX_PROXY_TEST_PATH,
} from './proxy-paths.ts'
export type {
  GeneratedImagePayload,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageRequestContext,
  OpenAICodexTransportErrorCode,
  OpenAICodexTransportV1,
} from './transport.ts'

export { loginOpenAICodex, logoutOpenAICodex, openAICodexAuthStatus } from './auth.ts'
export type { OpenAICodexAuthStatus } from './auth.ts'
export {
  FastModeRegistry,
  OpenAICodexFastModeRegistry,
  isFastModeSessionId,
  OPENAI_CODEX_FAST_MODE_MAX_SESSIONS,
  OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH,
} from './fast-mode.ts'
export { OPENAI_CODEX_FAST_MODE_PATH } from './fast-mode-paths.ts'
export {
  compareOpenAICodexVersions,
  parseOpenAICodexVersion,
} from './update.ts'
export {
  OpenAICodexCredentialStore,
  OPENAI_CODEX_ACCOUNT_LIMIT,
  OPENAI_CODEX_AUTH_DOCUMENT_LIMIT,
  OPENAI_CODEX_AUTH_FILENAME,
  OPENAI_CODEX_AUTH_V1_BACKUP_SUFFIX,
  OPENAI_CODEX_PROVIDER,
  openAICodexAuthPath,
} from './store.ts'
export type { OpenAICodexAccountSummary } from './store.ts'
export {
  DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  mapOpenAICodexSearchResponse,
  OpenAICodexSearchProvider,
  OPENAI_CODEX_BASE_URL,
  OPENAI_CODEX_SEARCH_PROVIDER,
  OPENAI_CODEX_SEARCH_URL,
} from './search.ts'
export type {
  OpenAICodexSearchContextSize,
  OpenAICodexSearchMode,
  OpenAICodexSearchProviderOptions,
  OpenAICodexSearchRequestRecord,
} from './search.ts'
export {
  migrateOpenAICodexSearchHistory,
  OPENAI_CODEX_HISTORY_BACKUP_SUFFIX,
  OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT,
} from './history-migration.ts'
export type {
  OpenAICodexHistoryMigrationFile,
  OpenAICodexHistoryMigrationOptions,
  OpenAICodexHistoryMigrationResult,
} from './history-migration.ts'

/** Stable Cordis plugin name. */
export const name = 'llm-openai-codex'

/** The model registry required before the provider can register. */
export const inject = ['llm']

/** Branded Host settings namespace for Codex Connect capability configuration. */
export const OPENAI_CODEX_SETTINGS_NS = OPENAI_CODEX_SETTINGS_NAMESPACE

/** Composite model and standalone-search configuration. */
export interface Config {
  /** Complete interactive OAuth deadline in milliseconds; applies when the plugin loads. */
  oauthTimeoutMs?: number
  /** Model ids advertised in selectors; omitted to advertise the full catalog. */
  models?: string[] | undefined
  /** Route Codex Connect requests through proxyUrl after explicit activation. */
  enableProxy?: boolean
  /** Credential-free HTTP(S) proxy origin. */
  proxyUrl?: string
  /**
   * Per-model context-window overrides keyed by catalog model id. Each value
   * replaces the advertised `contextWindow` for that model inside the adapter
   * profile for client budgeting. It does not change or verify server capacity,
   * output-token limits, or the deployment's compaction policy.
   * Whole-map or per-model null disables inherited overrides; omitted keys inherit lower layers.
   */
  contextWindowOverrides?: Record<string, number | null> | null | undefined
  /**
   * Per-model maximum output tokens keyed by catalog model id. Each value sets
   * the request default output cap DSH reports for that model and the resolved
   * model record's `maxTokens`. It does not change the context window, the
   * provider's actual capability, or the deployment's compaction policy.
   * Whole-map or per-model null disables inherited overrides; omitted keys inherit lower layers.
   */
  maxTokensOverrides?: Record<string, number | null> | null | undefined
  /**
   * Which server-advertised context window becomes the advertised budget.
   * "default" uses the live catalog's `context_window`; "extended" uses its
   * `max_context_window`. An explicit `contextWindowOverrides` entry still wins.
   */
  contextWindowMode?: OpenAICodexContextWindowMode
  /**
   * Official client version sent as the model catalog's `client_version` gate.
   * The endpoint rejects an omitted value and returns an empty list for one
   * below the client's floor, so this stays a known-good default.
   */
  modelCatalogClientVersion?: string
  /**
   * Log the payload field names of each Codex request. Development-only: it
   * writes field names, never payload content, and is off by default.
   */
  debugLogPayloadFields?: boolean
  /** Register the optional standalone Codex search provider. */
  enableSearch?: boolean
  /** Register the optional image-loading tool. */
  enableImageTool?: boolean
  /** Register the optional prompt-only image generation tool. */
  enableImageGeneration?: boolean
  /** Optional profile-scoped image route model hint; empty uses the default route hint. */
  imageModelHint?: string
  /** Record that this profile accepted the Auto-review data disclosure. */
  autoReviewDisclosureAcknowledged?: boolean
  /** Let the hidden Codex reviewer answer eligible DSH approval requests. */
  enableAutoReview?: boolean
  /** Model used for auxiliary standalone searches. */
  searchModel?: string
  /** Cached, indexed, or live web access. */
  searchMode?: OpenAICodexSearchMode
  /** Amount of search context returned by the provider. */
  searchContextSize?: OpenAICodexSearchContextSize
  /** Maximum generated tokens returned by the standalone search endpoint. */
  searchMaxOutputTokens?: number
}

/** Runtime configuration exposes each editable field through Cordis's public Volatile type. */
export interface VolatileConfig {
  oauthTimeoutMs: number
  models: Volatile<string[] | undefined>
  enableProxy: Volatile<boolean>
  proxyUrl: Volatile<string>
  contextWindowOverrides: Volatile<Readonly<Record<string, number | null>> | null | undefined>
  maxTokensOverrides: Volatile<Readonly<Record<string, number | null>> | null | undefined>
  contextWindowMode: Volatile<OpenAICodexContextWindowMode>
  modelCatalogClientVersion: Volatile<string>
  debugLogPayloadFields: Volatile<boolean>
  enableSearch: Volatile<boolean>
  enableImageTool: Volatile<boolean>
  enableImageGeneration: Volatile<boolean>
  imageModelHint: Volatile<string>
  autoReviewDisclosureAcknowledged: Volatile<boolean>
  enableAutoReview: Volatile<boolean>
  searchModel: Volatile<string>
  searchMode: Volatile<OpenAICodexSearchMode>
  searchContextSize: Volatile<OpenAICodexSearchContextSize>
  searchMaxOutputTokens: Volatile<number>
}

/**
 * Read the current value behind one validated Config reference.
 * @param value - a Volatile reference or an already-plain value.
 * @returns the referenced value, or the plain value itself.
 */
function configValue<T>(value: T | Volatile<T> | undefined): T | undefined {
  return value !== null && typeof value === 'object' && 'get' in value
    ? value.get() as T | undefined
    : value as T | undefined
}

function parseSettingsContextWindowOverrides(
  value: Record<string, number | null> | null | undefined,
): Record<string, number | null> | null | undefined {
  if (value === null) return null
  const parsed = parseOpenAICodexContextWindowOverrides(value)
  if (parsed === undefined) return undefined
  assertOpenAICodexContextWindowOverrides(parsed, openAICodexModelCatalog())
  return parsed
}

function parseSettingsMaxTokensOverrides(
  value: Record<string, number | null> | null | undefined,
): Record<string, number | null> | null | undefined {
  if (value === null) return null
  const parsed = parseOpenAICodexMaxTokensOverrides(value)
  if (parsed === undefined) return undefined
  assertOpenAICodexMaxTokensOverrides(parsed, openAICodexModelCatalog())
  return parsed
}

const configSchema = z.object({
  oauthTimeoutMs: z.number().step(1).min(1_000).max(1_800_000).default(OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS),
  models: z.union([z.const(undefined), z.array(z.string())]).volatile(),
  enableProxy: z.boolean().default(false).volatile(),
  proxyUrl: z.string().default(DEFAULT_OPENAI_CODEX_PROXY_URL).volatile(),
  contextWindowOverrides: z.transform(
    z.union([z.const(undefined), z.const(null), z.dict(z.union([z.const(null), z.number()]))]),
    parseSettingsContextWindowOverrides,
  ).volatile(),
  maxTokensOverrides: z.transform(
    z.union([z.const(undefined), z.const(null), z.dict(z.union([z.const(null), z.number()]))]),
    parseSettingsMaxTokensOverrides,
  ).volatile(),
  contextWindowMode: z.union(['default', 'extended'] as const).default(DEFAULT_OPENAI_CODEX_CONTEXT_WINDOW_MODE).volatile(),
  modelCatalogClientVersion: z.transform(z.string(), parseOpenAICodexModelCatalogClientVersion)
    .default(DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION).volatile(),
  debugLogPayloadFields: z.boolean().default(false).volatile(),
  enableSearch: z.boolean().default(false).volatile(),
  enableImageTool: z.boolean().default(false).volatile(),
  enableImageGeneration: z.boolean().default(false).volatile(),
  imageModelHint: z.transform(z.string(), parseOpenAICodexImageModelHint).default('').volatile(),
  autoReviewDisclosureAcknowledged: z.boolean().default(false).volatile(),
  enableAutoReview: z.boolean().default(false).volatile(),
  searchModel: z.string().default(DEFAULT_OPENAI_CODEX_SEARCH_MODEL).volatile(),
  searchMode: z.union(['cached', 'indexed', 'live'] as const).default(DEFAULT_OPENAI_CODEX_SEARCH_MODE).volatile(),
  searchContextSize: z.union(['low', 'medium', 'high'] as const).default(DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE).volatile(),
  searchMaxOutputTokens: z.number().step(1).min(1).default(DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS).volatile(),
})

export const Config: z<Config, VolatileConfig> = configSchema

/**
 * Register the `openai-codex` LLM route with one provider-native OAuth store.
 * Search and image tooling are added only when their config flags are true.
 * Selecting this route as the Harness default remains a separate profile choice.
 * @param ctx - plugin context carrying the LLM registry plus optional services.
 * @param config - capability gates and standalone-search tuning.
 */
export function apply(ctx: Context, config: Config | VolatileConfig): void {
  const current = (): OpenAICodexSettingsInput => Object.fromEntries(Object.entries({
    models: configValue(config.models), enableProxy: configValue(config.enableProxy),
    proxyUrl: configValue(config.proxyUrl), contextWindowOverrides: configValue(config.contextWindowOverrides),
    maxTokensOverrides: configValue(config.maxTokensOverrides), contextWindowMode: configValue(config.contextWindowMode),
    modelCatalogClientVersion: configValue(config.modelCatalogClientVersion),
    debugLogPayloadFields: configValue(config.debugLogPayloadFields), enableSearch: configValue(config.enableSearch),
    enableImageTool: configValue(config.enableImageTool), enableImageGeneration: configValue(config.enableImageGeneration),
    imageModelHint: configValue(config.imageModelHint),
    autoReviewDisclosureAcknowledged: configValue(config.autoReviewDisclosureAcknowledged),
    enableAutoReview: configValue(config.enableAutoReview), searchModel: configValue(config.searchModel),
    searchMode: configValue(config.searchMode), searchContextSize: configValue(config.searchContextSize),
    searchMaxOutputTokens: configValue(config.searchMaxOutputTokens),
  }).filter(([, value]) => value !== undefined)) as OpenAICodexSettingsInput
  const proxyManager = new OpenAICodexProxyManager()
  const resolveProviderProxyUrl = (): string | undefined => resolveOpenAICodexProxyUrl(resolveOpenAICodexSettings(current()))
  let proxyWasActive = resolveProviderProxyUrl() !== undefined
  const credentials = new OpenAICodexCredentialStore()
  const modelCatalog = new OpenAICodexModelCatalog({
    credentials,
    cachePath: join(dirname(credentials.filename), OPENAI_CODEX_MODEL_CATALOG_CACHE_FILENAME),
    clientVersion: resolveOpenAICodexSettings(current()).modelCatalogClientVersion,
    proxyManager,
    resolveProxyUrl: resolveProviderProxyUrl,
    logError: (message, error) => {
      ctx.logger.error(message)
      if (error !== undefined) ctx.logger.error(error)
    },
  })
  const catalogLayer = (): OpenAICodexCatalogLayer => ({
    live: modelCatalog.models(),
    mode: resolveOpenAICodexSettings(current()).contextWindowMode,
  })
  const effectiveCatalog = () => openAICodexModelCatalogFrom(catalogLayer())
  const catalogStatus = (): OpenAICodexModelCatalogStatus => {
    const updatedAt = modelCatalog.updatedAt()
    return {
      source: modelCatalog.source(),
      clientVersion: resolveOpenAICodexSettings(current()).modelCatalogClientVersion,
      modelCount: effectiveCatalog().length,
      unavailableModels: openAICodexUnavailableModels(modelCatalog.models()),
      ...updatedAt === undefined ? {} : { updatedAt },
    }
  }
  const validateSettings = (value: OpenAICodexSettingsInput): void => {
    const catalog = effectiveCatalog()
    resolveOpenAICodexSettings(value)
    assertOpenAICodexContextWindowOverrides(value.contextWindowOverrides ?? undefined, catalog)
    assertOpenAICodexMaxTokensOverrides(value.maxTokensOverrides ?? undefined, catalog)
  }
  validateSettings(current())
  const imageAssets = new OpenAICodexImageAssetStore()
  const trustedOrigins = new OpenAICodexTrustedOriginsStore(
    join(dirname(credentials.filename), OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME),
  )
  const fastMode = new FastModeRegistry()
  assertNoOpenAICodexProviderConflict(ctx.llm.listProviders().map(provider => provider.id))
  new OpenAICodexTransport(ctx, credentials, proxyManager, resolveProviderProxyUrl, () => resolveOpenAICodexSettings(current()).imageModelHint)
  registerOpenAICodexAutoReview(
    ctx,
    credentials,
    proxyManager,
    resolveProviderProxyUrl,
    () => resolveOpenAICodexSettings(current()).enableAutoReview,
  )
  // The active account keeps the primary route id so existing settings and the
  // settings card keep addressing it; every other stored account gets its own
  // route, reconciled below whenever the account document changes.
  const accountRoutes = new OpenAICodexAccountRouteRegistry()
  let routeBindings: readonly OpenAICodexRouteBinding[] = [OPENAI_CODEX_PRIMARY_ROUTE]
  const registration = ctx.llm.registerAdapter(
    [OPENAI_CODEX_PROVIDER],
    createOpenAICodexAdapter(
      credentials,
      () => ctx.get('attachments'),
      fastMode,
      () => resolveOpenAICodexSettings(current()).models,
      proxyManager,
      resolveProviderProxyUrl,
      () => resolveOpenAICodexSettings(current()).contextWindowOverrides,
      () => resolveOpenAICodexSettings(current()).maxTokensOverrides,
      () => routeBindings,
      {
        catalogLayer,
        resolveOnPayloadFields: () => resolveOpenAICodexSettings(current()).debugLogPayloadFields
          // Payload field names only; never the request or response content.
          ? names => { ctx.logger.info(`dsh-codex-connect: codex payload fields: ${names.join(', ')}`) }
          : undefined,
      },
    ),
  )
  ctx.inject(['webServer'], webCtx => {
    registerOpenAICodexAuthRoutes(webCtx, credentials, trustedOrigins, fastMode, proxyManager, resolveProviderProxyUrl,
      configValue(config.oauthTimeoutMs) ?? OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS)
    registerOpenAICodexProxyRoutes(webCtx, trustedOrigins, proxyManager)
    registerOpenAICodexModelCatalogRoute(webCtx, effectiveCatalog, trustedOrigins)
    registerOpenAICodexModelCatalogStatusRoutes(webCtx, {
      status: catalogStatus,
      refresh: () => modelCatalog.refresh(true),
    }, trustedOrigins)
    registerOpenAICodexOriginalImageRoute(webCtx, trustedOrigins, imageAssets)
    registerOpenAICodexQuotaRoute(webCtx, {
      store: credentials,
      trustedOrigins,
      proxyManager,
      resolveProxyUrl: resolveProviderProxyUrl,
    })
  })

  let stopped = false
  let searchFiber: Fiber | undefined
  let searchRegistration: object | undefined
  let searchTail = Promise.resolve()
  let imageFiber: Fiber | undefined
  let imageTail = Promise.resolve()
  let imageGenerationFiber: Fiber | undefined
  let imageGenerationTail = Promise.resolve()
  let accountRouteTail = Promise.resolve()
  let catalogTail = Promise.resolve()
  let registeredRouteIds: readonly string[] = [OPENAI_CODEX_PROVIDER]

  /** Serialize live catalog reads behind account and settings changes. */
  const scheduleCatalogRefresh = (): void => {
    catalogTail = catalogTail.then(() => modelCatalog.refresh(), () => modelCatalog.refresh())
  }

  const reconcileAccountRoutes = async (): Promise<void> => {
    if (stopped) return
    let next: readonly OpenAICodexAccountRoute[]
    try {
      next = accountRoutes.reconcile(await credentials.accounts())
    } catch (error: unknown) {
      ctx.logger.error('dsh-codex-connect: could not read the stored accounts for the model picker')
      ctx.logger.error(error)
      return
    }
    const nextRouteIds = next.map(route => route.routeId)
    if (deepEqualJson(nextRouteIds, registeredRouteIds)) return
    // The account read is the only suspension point; teardown may have started inside it.
    if (stopped) return
    const previous = routeBindings
    routeBindings = next
    try {
      // One atomic route swap: no request observes the registry between sets.
      registration.replace([...nextRouteIds])
    } catch (error: unknown) {
      routeBindings = previous
      ctx.logger.error('dsh-codex-connect: could not register the per-account Codex model routes')
      ctx.logger.error(error)
      return
    }
    registeredRouteIds = nextRouteIds
  }

  const scheduleAccountRoutes = (): void => {
    accountRouteTail = accountRouteTail.then(reconcileAccountRoutes, reconcileAccountRoutes)
  }

  const reconcileSearch = async (): Promise<void> => {
    if (stopped) return
    const resolved = resolveOpenAICodexSettings(current())
    const nextRegistration = resolved.enableSearch
      ? {
          model: resolved.searchModel,
          mode: resolved.searchMode,
          contextSize: resolved.searchContextSize,
          maxOutputTokens: resolved.searchMaxOutputTokens,
        }
      : undefined
    if (deepEqualJson(nextRegistration, searchRegistration)) return
    const previous = searchFiber
    searchFiber = undefined
    searchRegistration = undefined
    if (previous !== undefined) await previous.dispose()
    if (stopped || nextRegistration === undefined) return
    const fiber = ctx.inject(['web'], (webCtx) => {
      const provider = new OpenAICodexSearchProvider({
        credentials,
        model: nextRegistration.model,
        mode: nextRegistration.mode,
        contextSize: nextRegistration.contextSize,
        maxOutputTokens: nextRegistration.maxOutputTokens,
        resolveRequestId: () => String(webCtx.get('agents')?.currentInitiator()?.session.id ?? randomUUID()),
        proxyManager,
        resolveProxyUrl: resolveProviderProxyUrl,
      })
      const unregister = webCtx.web.registerSearchProvider(provider)
      try {
        const restoreRoute = selectOpenAICodexSearchRoute(webCtx.web, provider.id)
        return () => {
          try {
            restoreRoute()
          } finally {
            unregister()
          }
        }
      } catch (error) {
        unregister()
        throw error
      }
    })
    searchFiber = fiber
    searchRegistration = nextRegistration
    void Promise.resolve(fiber).catch((error: unknown) => {
      if (searchFiber === fiber) {
        searchFiber = undefined
        searchRegistration = undefined
      }
      ctx.logger.error('dsh-codex-connect: optional search provider failed to activate')
      ctx.logger.error(error)
    })
  }

  const reconcileImageTool = async (): Promise<void> => {
    if (stopped) return
    const enabled = resolveOpenAICodexSettings(current()).enableImageTool
    if (enabled === (imageFiber !== undefined)) return
    const previous = imageFiber
    imageFiber = undefined
    if (previous !== undefined) await previous.dispose()
    if (stopped || !enabled) return
    const fiber = ctx.inject(
      ['tools', 'fs', 'attachments'],
      toolCtx => toolCtx.tools.register(viewImageTool(toolCtx)),
    )
    imageFiber = fiber
    void Promise.resolve(fiber).catch((error: unknown) => {
      if (imageFiber === fiber) imageFiber = undefined
      ctx.logger.error('dsh-codex-connect: optional view_image tool failed to activate')
      ctx.logger.error(error)
    })
  }

  const reconcileImageGeneration = async (): Promise<void> => {
    if (stopped) return
    const enabled = resolveOpenAICodexSettings(current()).enableImageGeneration
    if (enabled === (imageGenerationFiber !== undefined)) return
    const previous = imageGenerationFiber
    imageGenerationFiber = undefined
    if (previous !== undefined) await previous.dispose()
    if (stopped || !enabled) return
    const fiber = ctx.inject(
      ['tools', 'attachments'],
      toolCtx => toolCtx.tools.register(imageGenerateTool(toolCtx, imageAssets)),
    )
    imageGenerationFiber = fiber
    void Promise.resolve(fiber).catch((error: unknown) => {
      if (imageGenerationFiber === fiber) imageGenerationFiber = undefined
      ctx.logger.error('dsh-codex-connect: optional image generation tool failed to activate')
      ctx.logger.error(error)
    })
  }

  const scheduleCapabilities = (): void => {
    searchTail = searchTail.then(reconcileSearch, reconcileSearch).catch((error: unknown) => {
      ctx.logger.error('dsh-codex-connect: could not apply the updated search configuration')
      ctx.logger.error(error)
    })
    imageTail = imageTail.then(reconcileImageTool, reconcileImageTool).catch((error: unknown) => {
      ctx.logger.error('dsh-codex-connect: could not apply the updated image-tool configuration')
      ctx.logger.error(error)
    })
    imageGenerationTail = imageGenerationTail.then(reconcileImageGeneration, reconcileImageGeneration).catch((error: unknown) => {
      ctx.logger.error('dsh-codex-connect: could not apply the updated image-generation configuration')
      ctx.logger.error(error)
    })
  }

  ctx.effect(() => credentials.onDidChange(() => {
    modelCatalog.setClientVersion(resolveOpenAICodexSettings(current()).modelCatalogClientVersion)
    scheduleAccountRoutes()
    scheduleCatalogRefresh()
  }), 'dsh-codex-connect: account route reconciliation')

  ctx.effect(() => async () => {
    stopped = true
    modelCatalog.dispose()
    await Promise.all([searchTail, imageTail, imageGenerationTail, accountRouteTail, catalogTail])
    const search = searchFiber
    const image = imageFiber
    const imageGeneration = imageGenerationFiber
    searchFiber = undefined
    imageFiber = undefined
    imageGenerationFiber = undefined
    await Promise.allSettled([
      search?.dispose() ?? Promise.resolve(),
      image?.dispose() ?? Promise.resolve(),
      imageGeneration?.dispose() ?? Promise.resolve(),
    ])
    await proxyManager.dispose()
  }, 'dsh-codex-connect: optional capability lifecycle')

  ctx.on('loader/volatile-update', () => {
    const proxyIsActive = resolveProviderProxyUrl() !== undefined
    if (proxyWasActive && !proxyIsActive) {
      void proxyManager.deactivate().catch((error: unknown) => {
        ctx.logger.error('dsh-codex-connect: could not deactivate the provider proxy')
        ctx.logger.error(error)
      })
    }
    proxyWasActive = proxyIsActive
    modelCatalog.setClientVersion(resolveOpenAICodexSettings(current()).modelCatalogClientVersion)
    scheduleCatalogRefresh()
    scheduleCapabilities()
  })
  ctx.inject(['settings'], settingsCtx => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      'dsh-codex-connect: custom settings page policy')
  })
  scheduleCapabilities()
  scheduleAccountRoutes()
  void modelCatalog.initialize().catch((error: unknown) => {
    ctx.logger.error('dsh-codex-connect: model catalog initialization failed')
    ctx.logger.error(error)
  })
}
