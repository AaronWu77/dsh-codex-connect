/** Browser-safe explicit speed hints, not confirmation of backend entitlement or service. */
import { isOpenAICodexRouteId } from './account-route-id.ts'

/** Same-origin endpoint for revisioned conversation speed commands. */
export const OPENAI_CODEX_SPEED_MODE_PATH = '/plugins/dsh-openai-codex/speed-mode'
/** Mutually exclusive requested service hints. */
export type OpenAICodexSpeedMode = 'standard' | 'fast' | 'ultrafast'
/** A readback bound to the Host route, model, account and selection incarnation. */
export interface ConversationSpeedState {
  readonly generation: string
  readonly revision: number
  readonly mode: OpenAICodexSpeedMode
  readonly provider: string
  readonly model: string
  readonly modelSupported: boolean
  readonly eligibility: 'unknown'
  readonly hasAccount: boolean
  readonly selectionAvailable: boolean
  readonly selectionExpired: boolean
}

/** Stable speed failures; no failure permits an automatic downgrade or command replay. */
export type OpenAICodexSpeedErrorCode = 'SPEED_SELECTION_STALE' | 'SPEED_STATE_CAPACITY' | 'ULTRAFAST_MODEL_UNSUPPORTED'
  | 'ULTRAFAST_SIGN_IN_REQUIRED' | 'ULTRAFAST_SELECTION_UNAVAILABLE' | 'ULTRAFAST_SELECTION_EXPIRED'
  | 'ULTRAFAST_PAYLOAD_MODEL_MISMATCH' | 'ULTRAFAST_PAYLOAD_INVALID'

/** A failed selection or request whose caller must visibly stop dependent work. */
export class OpenAICodexSpeedError extends Error {
  constructor(readonly code: OpenAICodexSpeedErrorCode) {
    super(code + ': Codex speed selection could not be applied. Reopen the speed control and explicitly choose a mode; the request was not downgraded or replayed.')
    this.name = 'OpenAICodexSpeedError'
  }
}

/** Accept only the three public mode ids. */
export function isOpenAICodexSpeedMode(value: unknown): value is OpenAICodexSpeedMode {
  return value === 'standard' || value === 'fast' || value === 'ultrafast'
}

/** Preserve an optional startup preference until settings layers have merged. */
export function parseOpenAICodexSpeedDefault(value: unknown): OpenAICodexSpeedMode | null | undefined {
  if (value === undefined || value === null || isOpenAICodexSpeedMode(value)) return value
  throw new TypeError('OpenAI Codex new-session speed must be standard, fast, ultrafast, null or omitted')
}

/** Exact alpha10 model support, on every locally owned account route; account entitlement stays unknown. */
export function supportsOpenAICodexUltrafast(provider: string, model: string): boolean {
  return isOpenAICodexRouteId(provider) && (model === 'gpt-6-astra' || model === 'gpt-6.1-sol')
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate a Host readback before publishing it to the Composer. */
export function readConversationSpeed(value: unknown, provider: string, model: string): ConversationSpeedState | undefined {
  if (!record(value) || typeof value.generation !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/u.test(value.generation)
    || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !isOpenAICodexSpeedMode(value.mode) || value.provider !== provider || value.model !== model
    || typeof value.modelSupported !== 'boolean' || value.eligibility !== 'unknown'
    || typeof value.hasAccount !== 'boolean' || typeof value.selectionAvailable !== 'boolean'
    || typeof value.selectionExpired !== 'boolean') return undefined
  return { generation: value.generation, revision: value.revision, mode: value.mode, provider, model,
    modelSupported: value.modelSupported, eligibility: 'unknown', hasAccount: value.hasAccount,
    selectionAvailable: value.selectionAvailable, selectionExpired: value.selectionExpired }
}

/** Apply the owned hint after a preceding payload replacement, leaving reasoning and output limits untouched. */
export function projectOpenAICodexSpeedPayload(payload: unknown, provider: string, model: string, mode: OpenAICodexSpeedMode): unknown {
  if (mode === 'ultrafast' && !supportsOpenAICodexUltrafast(provider, model)) throw new OpenAICodexSpeedError('ULTRAFAST_MODEL_UNSUPPORTED')
  if (!isOpenAICodexRouteId(provider)) return payload
  if (!record(payload)) {
    if (mode === 'ultrafast') throw new OpenAICodexSpeedError('ULTRAFAST_PAYLOAD_INVALID')
    return payload
  }
  if (mode === 'ultrafast') {
    if (payload.model !== model) throw new OpenAICodexSpeedError('ULTRAFAST_PAYLOAD_MODEL_MISMATCH')
    return { ...payload, service_tier: 'ultrafast' }
  }
  if (mode === 'fast') return { ...payload, service_tier: 'priority' }
  if (payload.service_tier !== 'priority' && payload.service_tier !== 'ultrafast') return payload
  const standard = { ...payload }
  delete standard.service_tier
  return standard
}
