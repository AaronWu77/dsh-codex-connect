/** OpenAI Codex adapter assembled from public dsh-llm-pi-ai extension points. */

import { createHash } from 'node:crypto'
import { defaultProviderAuthContext, InMemoryCredentialStore } from '@earendil-works/pi-ai'
import type { Context as PiContext, Model, Provider, SimpleStreamOptions } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { OpenAICodexCredentialStore } from './store.ts'
import { readOpenAICodexAccountRequestAuth, readOpenAICodexRequestAuth } from './auth.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import { isOpenAICodexRouteId, OPENAI_CODEX_PRIMARY_DISPLAY_NAME } from './account-routes.ts'
import type { FastModeRegistry } from './fast-mode.ts'
import type {
  OpenAICodexContextWindowMode,
  OpenAICodexModelCatalogEntry,
} from './model-contract.ts'
import {
  isValidOpenAICodexContextBudget,
  openAICodexContextLimit,
  openAICodexModeContextWindow,
} from './model-contract.ts'
import type { OpenAICodexLiveModel } from './model-catalog.ts'
import type { OpenAICodexProxyManager } from './provider-proxy.ts'

/** Official Codex id supplied when the installed pi-ai catalog predates Astra. */
export const OPENAI_CODEX_ASTRA_MODEL_ID = 'gpt-6-astra'

/** Optional adapter collaborators beyond the positional profile inputs. */
export interface OpenAICodexAdapterExtras {
  /** Live catalog layer and context-window mode feeding the effective picker. */
  catalogLayer?: () => OpenAICodexCatalogLayer
  /** Resolve the payload field-name logger for each request; undefined disables logging. */
  resolveOnPayloadFields?: () => ((names: readonly string[]) => void) | undefined
}

/** One LLM route this adapter registers and the store account it authenticates as. */
export interface OpenAICodexRouteBinding {
  /** Harness route id; the store's active account keeps `openai-codex`. */
  routeId: string
  /** Selector label; only the primary route carries the bare product name. */
  displayName: string
  /** Account key this route is bound to; absent binds whatever is active per request. */
  accountKey?: string
}

/** Profile carrying the route's account binding so auth freezes with the request. */
export type OpenAICodexRouteProfile = ResolvedPiAiProviderProfile & {
  /** Account key this route authenticates as; absent binds the store's active account. */
  openaiCodexAccountKey?: string
}

/** Single-route binding retained when no account enumeration is supplied. */
export const OPENAI_CODEX_PRIMARY_ROUTE: OpenAICodexRouteBinding = Object.freeze({
  routeId: OPENAI_CODEX_PROVIDER,
  displayName: OPENAI_CODEX_PRIMARY_DISPLAY_NAME,
})

const OPENAI_CODEX_ASTRA_MODEL: Model<'openai-codex-responses'> = {
  id: OPENAI_CODEX_ASTRA_MODEL_ID,
  name: 'GPT-6-Astra',
  api: 'openai-codex-responses',
  provider: OPENAI_CODEX_PROVIDER,
  baseUrl: 'https://chatgpt.com/backend-api',
  reasoning: true,
  input: ['text', 'image'],
  // ChatGPT OAuth usage is read from the server; no authoritative token-price schedule is available here.
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 272_000,
  maxTokens: 128_000,
  thinkingLevelMap: { off: null, minimal: null, xhigh: 'xhigh', max: 'max' },
  compat: {
    supportsOpenAIGrammarTools: true,
    supportsAdditionalTools: true,
    supportsToolSearch: true,
  },
}

/** Preserve native Astra metadata with calibrated effort choices, or add the fallback. */
export function withOpenAICodexAstra(
  provider: Provider<'openai-codex-responses'>,
): Provider<'openai-codex-responses'> {
  const baseline = provider.getModels()
  const models = baseline.some(model => model.id === OPENAI_CODEX_ASTRA_MODEL_ID)
    ? baseline.map(model => model.id === OPENAI_CODEX_ASTRA_MODEL_ID
      ? { ...model, thinkingLevelMap: { ...model.thinkingLevelMap, ...OPENAI_CODEX_ASTRA_MODEL.thinkingLevelMap } }
      : model)
    : [OPENAI_CODEX_ASTRA_MODEL, ...baseline]
  return { ...provider, getModels: () => models }
}

/** One live-catalog layer plus the selected context-window mode. */
export interface OpenAICodexCatalogLayer {
  /** Server-advertised models; empty means the bundled catalog answers. */
  live: readonly OpenAICodexLiveModel[]
  /** Which server window becomes the advertised budget. */
  mode: OpenAICodexContextWindowMode
}

/**
 * Resolve a slug's family: the id through its last dash-separated segment that
 * contains a digit. `gpt-5.6-next` is family `gpt-5.6`; `gpt-reserve` and
 * `codex-auto-review` carry no version segment and have no family.
 * @param slug - server model slug.
 * @returns the family prefix, or undefined when the slug has no version segment.
 */
export function openAICodexModelFamily(slug: string): string | undefined {
  const parts = slug.split('-')
  let end = -1
  for (let index = 0; index < parts.length; index += 1) {
    if (/[0-9]/u.test(parts[index] ?? '')) end = index
  }
  return end <= 0 ? undefined : parts.slice(0, end + 1).join('-')
}

/**
 * Whether the installed catalog already knows a slug's family. A live model is
 * added to the picker only when a bundled id equals the family or extends it,
 * so an unrecognized family is reported instead of guessed into the selector.
 * @param slug - server model slug.
 * @param knownIds - ids the installed pi-ai catalog advertises.
 * @returns true when the family is present in the installed catalog.
 */
export function isOpenAICodexKnownModelFamily(slug: string, knownIds: readonly string[]): boolean {
  const family = openAICodexModelFamily(slug)
  if (family === undefined) return false
  const prefix = `${family}-`
  return knownIds.some(id => id === family || id.startsWith(prefix))
}

/**
 * Overlay the live catalog on the installed one. Known slugs keep their
 * bundled record with the selected mode's window and the server output cap;
 * only family-known new slugs are synthesized from a sibling record. Unknown
 * slugs are returned so the Host can report them without enabling them.
 * @param provider - installed provider catalog.
 * @param live - server-advertised models.
 * @param mode - selected context-window mode.
 * @returns a detached provider plus the slugs kept out of the picker.
 */
export function applyOpenAICodexLiveCatalog(
  provider: Provider,
  live: readonly OpenAICodexLiveModel[],
  mode: OpenAICodexContextWindowMode,
): { provider: Provider; unavailableModels: readonly string[] } {
  const baseline = provider.getModels()
  const bySlug = new Map(live.map(entry => [entry.slug, entry]))
  const knownIds = baseline.map(model => model.id)
  const models = baseline.map(model => {
    const entry = bySlug.get(model.id)
    if (entry === undefined) return model
    const contextWindow = openAICodexModeContextWindow(entry.contextWindow, entry.maxContextWindow, mode)
    const maxTokens = entry.maxOutputTokens ?? model.maxTokens
    return contextWindow === model.contextWindow && maxTokens === model.maxTokens
      ? model
      : { ...model, contextWindow, maxTokens }
  })
  const unavailableModels: string[] = []
  for (const entry of live) {
    if (baseline.some(model => model.id === entry.slug)) continue
    const family = openAICodexModelFamily(entry.slug)
    if (family === undefined || !isOpenAICodexKnownModelFamily(entry.slug, knownIds)) {
      unavailableModels.push(entry.slug)
      continue
    }
    // These two new slugs share their respective 5.6 variants' Codex tool and
    // thinking-level mappings. The Astra sibling instead maps Minimal to off.
    const predecessor = entry.slug === 'gpt-6-sol' || entry.slug === 'gpt-6-luna'
      ? baseline.find(model => model.id === `gpt-5.6-${entry.slug.slice('gpt-6-'.length)}`)
      : undefined
    const template = predecessor ?? baseline.find(model => model.id === family || model.id.startsWith(`${family}-`))
    if (template === undefined) {
      unavailableModels.push(entry.slug)
      continue
    }
    models.push({
      ...template,
      id: entry.slug,
      name: entry.displayName ?? entry.slug,
      contextWindow: openAICodexModeContextWindow(entry.contextWindow, entry.maxContextWindow, mode),
      maxTokens: entry.maxOutputTokens ?? template.maxTokens,
    })
  }
  return { provider: { ...provider, getModels: () => models }, unavailableModels }
}

/** Return a detached copy of the effective Codex model catalog. */
export function openAICodexModelCatalog(): readonly OpenAICodexModelCatalogEntry[] {
  return openAICodexModelCatalogFrom()
}

/**
 * List live slugs whose family the installed catalog does not know. They stay
 * out of the picker and are reported through the catalog status instead.
 * @param live - server-advertised models.
 * @returns slugs held back from the selector.
 */
export function openAICodexUnavailableModels(live: readonly OpenAICodexLiveModel[]): readonly string[] {
  return applyOpenAICodexLiveCatalog(withOpenAICodexAstra(openaiCodexProvider()), live, 'default').unavailableModels
}

/**
 * Build the catalog the settings card reads from the selected live layer.
 * @param layer - live models and context-window mode; omitted uses the bundled catalog.
 * @returns detached entries carrying server tiers and reasoning levels when known.
 */
export function openAICodexModelCatalogFrom(
  layer: OpenAICodexCatalogLayer = { live: [], mode: 'default' },
): readonly OpenAICodexModelCatalogEntry[] {
  const merged = applyOpenAICodexLiveCatalog(withOpenAICodexAstra(openaiCodexProvider()), layer.live, layer.mode).provider
  const bySlug = new Map(layer.live.map(entry => [entry.slug, entry]))
  return merged.getModels().map(model => {
    const entry = bySlug.get(model.id)
    return {
      id: model.id,
      name: model.name,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      ...entry === undefined
        ? openAICodexContextLimit(model.id, model.contextWindow)
        : openAICodexContextLimit(model.id, entry.contextWindow, entry.maxContextWindow),
      ...entry === undefined || entry.serviceTiers.length === 0 ? {} : { serviceTiers: entry.serviceTiers },
      ...entry === undefined || entry.reasoningLevels.length === 0 ? {} : { reasoningLevels: entry.reasoningLevels },
    }
  })
}

/** Provider idle ceiling used by the composite route. */
export const OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS = 300_000

/** rc.2 default maximum base64 image payload retained in one request. */
export const OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
/** rc.2 default total-pixel budget for one deterministic inline image version. */
export const OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
/** rc.2 default raw encoded-byte cap for one deterministic inline image version. */
export const OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024

/**
 * Use the finite SSE response path for Codex requests. The automatic
 * WebSocket path keeps a session connection for prompt-cache reuse, which
 * can leave one-shot Headless processes alive after their final answer.
 */
export const OPENAI_CODEX_TRANSPORT = 'sse' as const

/**
 * Give the generic dsh adapter a request-scoped bearer-token entry without
 * changing the provider's user-facing OAuth flow. The resolver accepts only
 * the explicit override supplied by this plugin; it never discovers an API
 * key from the environment or persistent api-key credentials.
 */
function isPayloadRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Maximum prompt-cache key length accepted by the Codex Responses API. */
export const OPENAI_CODEX_PROMPT_CACHE_KEY_MAX_LENGTH = 64

/** Bound one prompt-cache key exactly as the vendored provider does. */
function clampOpenAICodexPromptCacheKey(value: string): string {
  const characters = Array.from(value)
  return characters.length <= OPENAI_CODEX_PROMPT_CACHE_KEY_MAX_LENGTH
    ? value
    : characters.slice(0, OPENAI_CODEX_PROMPT_CACHE_KEY_MAX_LENGTH).join('')
}

/** Concatenate the text parts of one pi-ai message content value. */
function openAICodexContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => isPayloadRecord(part) && typeof part['text'] === 'string' ? part['text'] : '')
    .join('')
}

/**
 * Derive the prompt-cache key for one request. The Harness session id is the
 * stable per-session identity, so it is used whenever the request supplies one.
 * Without it, a hash of the system prompt and the first user message keeps
 * requests from the same conversation together. A different key only causes a
 * prompt-cache miss; it never changes the model's answer.
 * @param context - exact pi-ai request context.
 * @param sessionId - Harness session id from the request options, when present.
 * @returns the key to send, or undefined when no stable key can be derived.
 */
export function deriveOpenAICodexPromptCacheKey(
  context: PiContext,
  sessionId: string | undefined,
): string | undefined {
  if (sessionId !== undefined && sessionId.trim().length > 0) return clampOpenAICodexPromptCacheKey(sessionId.trim())
  const system = typeof context.systemPrompt === 'string' ? context.systemPrompt : ''
  const firstUser = (context.messages ?? [])
    .filter(message => message.role === 'user')
    .map(message => openAICodexContentText(message.content))
    .find(text => text.length > 0)
  if (system.length === 0 && firstUser === undefined) return undefined
  const digest = createHash('sha1')
    .update(system)
    .update('\u0000')
    .update((firstUser ?? '').slice(0, 4096))
    .digest('hex')
  return `codex-${digest}`
}

/** Request-scoped payload additions applied by one provider wrapper. */
export interface OpenAICodexPayloadPolicy {
  /** Fast Mode registry; absent never adds the priority tier. */
  fastMode?: FastModeRegistry | undefined
  /** Derive the prompt-cache key; absent never adds one. */
  derivePromptCacheKey?: ((context: PiContext, sessionId: string | undefined) => string | undefined) | undefined
  /** Resolve the field-name logger for each request; undefined disables logging. */
  onPayloadFields?: (() => ((names: readonly string[]) => void) | undefined) | undefined
}

/**
 * Apply the Codex request payload policy in one transform: the Fast Mode
 * priority tier, the prompt-cache key, and optional field-name logging. A
 * request that adds nothing and logs nothing keeps the caller's options object.
 * @param provider - provider whose streamSimple is wrapped.
 * @param policy - request-scoped additions; each is skipped when absent.
 * @returns a detached provider applying the policy.
 */
export function withOpenAICodexPayloadPolicy(provider: Provider, policy: OpenAICodexPayloadPolicy): Provider {
  const streamSimple = provider.streamSimple
  return {
    ...provider,
    streamSimple(model, context: PiContext, options?: SimpleStreamOptions) {
      const sessionId = options?.sessionId
      const codexRoute = provider.id === model.provider && isOpenAICodexRouteId(provider.id)
      const fastEnabled = codexRoute && policy.fastMode?.isEnabled(sessionId) === true
      const cacheKey = codexRoute && options?.cacheRetention !== 'none'
        ? policy.derivePromptCacheKey?.(context, sessionId)
        : undefined
      const logFields = codexRoute ? policy.onPayloadFields?.() : undefined
      if (!fastEnabled && cacheKey === undefined && logFields === undefined) {
        return streamSimple.call(provider, model, context, options)
      }
      const previousOnPayload = options?.onPayload
      const nextOptions: SimpleStreamOptions = {
        ...options,
        async onPayload(payload, payloadModel) {
          const replaced = await previousOnPayload?.(payload, payloadModel)
          const nextPayload = replaced === undefined ? payload : replaced
          if (!isPayloadRecord(nextPayload)) return nextPayload
          const additions: Record<string, unknown> = {}
          if (fastEnabled) additions['service_tier'] = 'priority'
          if (cacheKey !== undefined) additions['prompt_cache_key'] = cacheKey
          const result = { ...nextPayload, ...additions }
          logFields?.(Object.keys(result))
          return result
        },
      }
      return streamSimple.call(provider, model, context, nextOptions)
    },
  }
}

/** Add the request-scoped Fast Mode hint without changing auth or other options. */
export function withOpenAICodexFastMode(
  provider: Provider,
  fastMode: FastModeRegistry | undefined,
): Provider {
  return withOpenAICodexPayloadPolicy(provider, { fastMode })
}

function requestProvider(
  provider: Provider,
  fastMode?: FastModeRegistry,
  proxyManager?: OpenAICodexProxyManager,
  resolveProxyUrl?: () => string | undefined,
  resolveOnPayloadFields?: () => ((names: readonly string[]) => void) | undefined,
): Provider {
  const configured = withOpenAICodexPayloadPolicy(provider, {
    fastMode,
    derivePromptCacheKey: deriveOpenAICodexPromptCacheKey,
    ...resolveOnPayloadFields === undefined ? {} : { onPayloadFields: resolveOnPayloadFields },
  })
  const streamSimple = configured.streamSimple
  return {
    ...configured,
    streamSimple(model, context: PiContext, options?: SimpleStreamOptions) {
      const proxyUrl = resolveProxyUrl?.()
      const operation = () => streamSimple.call(configured, model, context, options)
      return proxyManager?.runStream(proxyUrl, operation) ?? operation()
    },
    auth: {
      ...provider.auth,
      apiKey: {
        name: 'OpenAI Codex OAuth bearer token',
        async resolve({ credential }) {
          const apiKey = credential?.key
          return apiKey === undefined || apiKey.length === 0
            ? undefined
            : { auth: { apiKey }, source: 'OAuth' }
        },
      },
    },
  }
}

/** Build the pi-ai profile with the model-error index required by DSH 0.1.5-rc.1. */
export function createOpenAICodexProfile(
  provider: Provider,
  fastMode?: FastModeRegistry,
  proxyManager?: OpenAICodexProxyManager,
  resolveProxyUrl?: () => string | undefined,
  contextWindowOverrides?: Readonly<Record<string, number>> | undefined,
  maxTokensOverrides?: Readonly<Record<string, number>> | undefined,
  route: OpenAICodexRouteBinding = OPENAI_CODEX_PRIMARY_ROUTE,
  layer?: OpenAICodexCatalogLayer | undefined,
  resolveOnPayloadFields?: () => ((names: readonly string[]) => void) | undefined,
): OpenAICodexRouteProfile & { piProvider: Provider } {
  const layeredProvider = layer === undefined
    ? provider
    : applyOpenAICodexLiveCatalog(provider, layer.live, layer.mode).provider
  const effectiveProvider = applyOpenAICodexOverrides(layeredProvider, contextWindowOverrides, maxTokensOverrides, layer?.live)
  const routedProvider = withOpenAICodexRouteId(effectiveProvider, route.routeId)
  const profile = {
    provider: route.routeId,
    displayName: route.displayName,
    transport: OPENAI_CODEX_TRANSPORT,
    streamIdleTimeoutMs: OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES,
    retryPolicy: resolveRetryPolicy(undefined, 'dsh-codex-connect retryPolicy'),
    configuredMaxTokens: new Map(Object.entries(maxTokensOverrides ?? {})),
    modelErrors: new Map<string, string>(),
    piProvider: requestProvider(routedProvider, fastMode, proxyManager, resolveProxyUrl, resolveOnPayloadFields),
    ...route.accountKey === undefined ? {} : { openaiCodexAccountKey: route.accountKey },
  }
  return profile
}

/**
 * Present one provider under a distinct LLM route id. Model records take the
 * route id too, because pi-ai resolves the provider that serves a model from
 * `model.provider`; the catalog implementation, auth, and streaming behavior
 * are the same provider's. The wrapped providers never read `this`, so the
 * spread keeps their behavior.
 */
export function withOpenAICodexRouteId(provider: Provider, routeId: string): Provider {
  if (routeId === provider.id) return provider
  const models = provider.getModels().map(model => ({ ...model, provider: routeId }))
  return { ...provider, id: routeId, getModels: () => models }
}

/**
 * Detach one provider and replace the advertised model metadata for the
 * configured ids. Request streaming itself is unaffected: pi-ai streams the
 * caller-supplied model, so only the metadata Harness reads for context
 * budgeting, per-request default output caps, and compaction changes.
 */
function applyOpenAICodexOverrides(
  provider: Provider,
  contextWindowOverrides: Readonly<Record<string, number>> | undefined,
  maxTokensOverrides: Readonly<Record<string, number>> | undefined,
  live?: readonly OpenAICodexLiveModel[],
): Provider {
  if (contextWindowOverrides === undefined && maxTokensOverrides === undefined) return provider
  const baselineModels = provider.getModels()
  const liveMaximums = new Map(live?.map(model => [model.slug, model.maxContextWindow]))
  const validationModels = baselineModels.map(model => ({
    id: model.id, contextWindow: model.contextWindow,
    maxContextWindow: liveMaximums.get(model.id)
      ?? openAICodexContextLimit(model.id, model.contextWindow).maxContextWindow,
  }))
  assertOpenAICodexContextWindowOverrides(contextWindowOverrides, validationModels)
  assertOpenAICodexMaxTokensOverrides(maxTokensOverrides, validationModels)
  const replaced = baselineModels.map(model => {
    const contextWindow = contextWindowOverrides?.[model.id]
    const maxTokens = maxTokensOverrides?.[model.id]
    return contextWindow === undefined && maxTokens === undefined
      ? model
      : {
          ...model,
          ...contextWindow === undefined ? {} : { contextWindow },
          ...maxTokens === undefined ? {} : { maxTokens },
        }
  })
  return { ...provider, getModels: () => replaced }
}

/** Detach one provider and replace the advertised context window for the configured model ids. */
export function withOpenAICodexContextWindowOverrides(
  provider: Provider,
  overrides: Readonly<Record<string, number>>,
): Provider {
  return applyOpenAICodexOverrides(provider, overrides, undefined)
}

/** Detach one provider and replace the advertised maximum output tokens for the configured model ids. */
export function withOpenAICodexMaxTokensOverrides(
  provider: Provider,
  overrides: Readonly<Record<string, number>>,
): Provider {
  return applyOpenAICodexOverrides(provider, undefined, overrides)
}

/** Reject unknown ids and out-of-range context budgets before accepting settings or requests. */
export function assertOpenAICodexContextWindowOverrides(
  overrides: Readonly<Record<string, number | null>> | undefined,
  catalog: readonly (Pick<OpenAICodexModelCatalogEntry, 'id' | 'contextWindow'>
    & Partial<Pick<OpenAICodexModelCatalogEntry, 'maxContextWindow'>>)[],
): void {
  const models = new Map(catalog.map(model => [model.id, model]))
  for (const [id, budget] of Object.entries(overrides ?? {})) {
    const model = models.get(id)
    if (model === undefined) throw new TypeError(`OpenAI Codex contextWindowOverrides contains unknown model id "${id}"`)
    const maxContextWindow = model.maxContextWindow ?? openAICodexContextLimit(id, model.contextWindow).maxContextWindow
    if (budget !== null && !isValidOpenAICodexContextBudget(budget, maxContextWindow)) {
      throw new TypeError(`OpenAI Codex contextWindowOverrides for "${id}" must be an integer from 1 to ${maxContextWindow} tokens; use null to restore the catalog default`)
    }
  }
}

/**
 * Reject unknown model ids and output budgets outside the model's configuration
 * range before accepting settings or requests. The ceiling is the same
 * per-model configuration limit the context budget uses.
 */
export function assertOpenAICodexMaxTokensOverrides(
  overrides: Readonly<Record<string, number | null>> | undefined,
  catalog: readonly (Pick<OpenAICodexModelCatalogEntry, 'id' | 'contextWindow'>
    & Partial<Pick<OpenAICodexModelCatalogEntry, 'maxContextWindow'>>)[],
): void {
  const models = new Map(catalog.map(model => [model.id, model]))
  for (const [id, budget] of Object.entries(overrides ?? {})) {
    const model = models.get(id)
    if (model === undefined) throw new TypeError(`OpenAI Codex maxTokensOverrides contains unknown model id "${id}"`)
    const maxContextWindow = model.maxContextWindow ?? openAICodexContextLimit(id, model.contextWindow).maxContextWindow
    if (budget !== null && !isValidOpenAICodexContextBudget(budget, maxContextWindow)) {
      throw new TypeError(`OpenAI Codex maxTokensOverrides for "${id}" must be an integer from 1 to ${maxContextWindow} tokens; use null to restore the catalog default`)
    }
  }
}

/**
 * Create the Codex subscription adapter without requiring a dsh fork. The
 * public pi-ai adapter owns Harness message conversion, image attachment
 * resolution, streaming, reasoning metadata, and compaction behavior; this
 * plugin supplies its provider-native OAuth token for each request.
 */
export function createOpenAICodexAdapter(
  credentials: OpenAICodexCredentialStore,
  resolveAttachments: () => AttachmentStore | undefined,
  fastMode?: FastModeRegistry,
  visibleModelIds?: () => readonly string[] | undefined,
  proxyManager?: OpenAICodexProxyManager,
  resolveProxyUrl?: () => string | undefined,
  contextWindowOverrides?: () => Readonly<Record<string, number>> | undefined,
  maxTokensOverrides?: () => Readonly<Record<string, number>> | undefined,
  routeBindings?: () => readonly OpenAICodexRouteBinding[],
  extras?: OpenAICodexAdapterExtras,
): PiAiAdapter {
  const provider = withOpenAICodexAstra(openaiCodexProvider())
  let profiles: Map<string, ResolvedPiAiProviderProfile> | undefined
  let previousKey: unknown
  const currentProfiles = (): Map<string, ResolvedPiAiProviderProfile> => {
    const windowOverrides = contextWindowOverrides?.()
    const tokenOverrides = maxTokensOverrides?.()
    const bindings = routeBindings?.() ?? [OPENAI_CODEX_PRIMARY_ROUTE]
    const layer = extras?.catalogLayer?.()
    const key = {
      window: windowOverrides === undefined ? null : { ...windowOverrides },
      tokens: tokenOverrides === undefined ? null : { ...tokenOverrides },
      routes: bindings.map(route => [route.routeId, route.displayName, route.accountKey ?? null]),
      catalog: layer === undefined ? null : { mode: layer.mode, live: layer.live },
    }
    if (profiles === undefined || !deepEqualJson(previousKey, key)) {
      previousKey = key
      // PiAiAdapter keys snapshots by map identity; captured calls keep the old map.
      profiles = new Map(bindings.map(route => [
        route.routeId,
        createOpenAICodexProfile(provider, fastMode, proxyManager, resolveProxyUrl, windowOverrides, tokenOverrides, route, layer, extras?.resolveOnPayloadFields),
      ] as const))
    }
    return profiles
  }
  class OpenAICodexAdapter extends PiAiAdapter {
    override async listModels(providerId: string) {
      const catalog = await super.listModels(providerId)
      const configured = visibleModelIds?.()
      if (configured === undefined) return catalog
      const visible = new Set(configured)
      return catalog.filter(model => visible.has(model.id))
    }
  }
  return new OpenAICodexAdapter({
    profiles: currentProfiles,
    resolveApiKey: async (_provider, profile) => {
      const accountKey = (profile as OpenAICodexRouteProfile).openaiCodexAccountKey
      const operation = async () => (accountKey === undefined
        ? await readOpenAICodexRequestAuth(credentials)
        : await readOpenAICodexAccountRequestAuth(credentials, accountKey)).access
      return proxyManager?.run(resolveProxyUrl?.(), operation) ?? operation()
    },
    // Host-side auth accepts only the explicit bearer token resolved above.
    auth: { credentials: new InMemoryCredentialStore(), authContext: defaultProviderAuthContext() },
    resolveAttachments,
  })
}
