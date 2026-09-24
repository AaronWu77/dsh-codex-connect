/** Live ChatGPT Codex rate-limit usage for the browser account page. */

import { readOpenAICodexRequestAuth } from './auth.ts'
import { OpenAICodexRequestAuthError } from './auth-error.ts'
import type { OpenAICodexCredentialStore } from './store.ts'

/** Fixed endpoint used by the official Codex client for ChatGPT rate limits. */
export const OPENAI_CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'

/** Per-card reset-credit details; the usage read carries only their count. */
export const OPENAI_CODEX_RESET_CREDITS_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits'

const USAGE_REQUEST_TIMEOUT_MS = 15_000

/** Release a discarded response without replacing the HTTP failure with a cancellation error. */
async function cancelDiscardedResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // Body cancellation is best effort; the response status remains the useful error.
  }
}

/** Stable public discriminant for an expired or revoked Codex OAuth session. */
export const OPENAI_CODEX_REAUTH_REQUIRED_CODE = 'OPENAI_CODEX_REAUTH_REQUIRED' as const

/** Fixed, secret-free message for a browser-facing reauthorization prompt. */
export const OPENAI_CODEX_REAUTH_REQUIRED_MESSAGE = 'OpenAI Codex authorization must be renewed'

/**
 * Raised when the usage endpoint rejects the current OAuth session.
 *
 * The error intentionally carries no response, credential, or account data so
 * callers can safely pass its fixed message across the Web boundary.
 */
export class OpenAICodexReauthRequiredError extends Error {
  readonly code = OPENAI_CODEX_REAUTH_REQUIRED_CODE

  constructor() {
    super(OPENAI_CODEX_REAUTH_REQUIRED_MESSAGE)
    this.name = 'OpenAICodexReauthRequiredError'
  }
}

/** Identify the dedicated reauthorization failure without comparing messages. */
export function isOpenAICodexReauthRequiredError(error: unknown): error is OpenAICodexReauthRequiredError {
  return error instanceof OpenAICodexReauthRequiredError
}

/** One quota window expressed as remaining capacity for direct UI rendering. */
export interface OpenAICodexRateLimitWindow {
  /** Percent still available in this window. */
  readonly remainingPercent: number
  /** Server-declared rolling-window length in seconds. */
  readonly windowSeconds: number
  /** Server-declared reset time as Unix seconds, when supplied and valid. */
  readonly resetAt?: number
}

/** One separately metered Codex quota bucket. */
export interface OpenAICodexRateLimit {
  /** Stable server feature id. */
  readonly id: string
  /** Optional server-provided display name. */
  readonly name?: string
  /** Available rolling windows for this bucket. */
  readonly windows: readonly OpenAICodexRateLimitWindow[]
}

/** Optional exact prepaid-credit balance returned by ChatGPT. */
export interface OpenAICodexCredits {
  /** Whether the balance is unmetered. */
  readonly unlimited: boolean
  /** Exact provider-formatted balance when finite and disclosed. */
  readonly balance?: string
}

/** One ChatGPT rate-limit reset card reported for an account. */
export interface OpenAICodexResetCredit {
  /** Server-supplied card id. */
  readonly id: string
  /** Server reset category, for example `codex_rate_limits`. */
  readonly resetType: string
  /** Server card status, for example `available`. */
  readonly status: string
  /** Server grant time as Unix seconds. */
  readonly grantedAt: number
  /** Server expiry time as Unix seconds; absent when the card does not expire. */
  readonly expiresAt?: number
  /** Optional server-provided display title. */
  readonly title?: string
}

/** Reset cards reported for one account. */
export interface OpenAICodexResetCredits {
  /** Count the server reports as available. */
  readonly availableCount: number
  /** Reported cards, when the server lists them. */
  readonly credits?: readonly OpenAICodexResetCredit[]
}

/** Optional exact workspace member spend limit returned by ChatGPT. */
export interface OpenAICodexIndividualLimit {
  /** Exact configured limit. */
  readonly limit: string
  /** Exact amount consumed. */
  readonly used: string
  /** Exact amount still available. */
  readonly remaining: string
  /** Percent still available for progress rendering. */
  readonly remainingPercent: number
}

/** Secret-free quota projection returned to the browser. */
export interface OpenAICodexUsage {
  /** Rolling Codex rate-limit buckets. */
  readonly rateLimits: readonly OpenAICodexRateLimit[]
  /** Exact prepaid-credit balance when supported for this account. */
  readonly credits?: OpenAICodexCredits
  /** Exact workspace member limit when supported for this account. */
  readonly individualLimit?: OpenAICodexIndividualLimit
  /** Rate-limit reset cards when the endpoint reports them. */
  readonly resetCredits?: OpenAICodexResetCredits
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** JavaScript Date's maximum representable instant, expressed in Unix seconds. */
const MAX_DATE_UNIX_SECONDS = Math.floor(8_640_000_000_000_000 / 1_000)

function parseResetAt(record: Record<string, unknown>): number | undefined {
  if (!Object.hasOwn(record, 'reset_at')) return undefined
  const value = record['reset_at']
  if (value === null) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > MAX_DATE_UNIX_SECONDS) {
    throw new Error('OpenAI Codex returned an invalid rate-limit reset time')
  }
  // Keep the projection bounded by Date's actual range rather than allowing an
  // integer that would overflow when a browser formats it as milliseconds.
  if (!Number.isFinite(new Date(value * 1_000).getTime())) {
    throw new Error('OpenAI Codex returned an invalid rate-limit reset time')
  }
  return value
}

function parseWindow(value: unknown): OpenAICodexRateLimitWindow | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) throw new Error('OpenAI Codex returned a malformed rate-limit window')
  const usedPercent = value['used_percent']
  const windowSeconds = value['limit_window_seconds']
  if (typeof usedPercent !== 'number' || !Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100) {
    throw new Error('OpenAI Codex returned an invalid used percentage')
  }
  if (typeof windowSeconds !== 'number' || !Number.isInteger(windowSeconds) || windowSeconds <= 0) {
    throw new Error('OpenAI Codex returned an invalid rate-limit window duration')
  }
  const resetAt = parseResetAt(value)
  return {
    remainingPercent: 100 - usedPercent,
    windowSeconds,
    ...resetAt === undefined ? {} : { resetAt },
  }
}

function parseLimit(id: string, name: string | undefined, value: unknown): OpenAICodexRateLimit | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) throw new Error('OpenAI Codex returned malformed rate-limit details')
  const windows = [parseWindow(value['primary_window']), parseWindow(value['secondary_window'])]
    .filter(window => window !== undefined)
  return windows.length === 0 ? undefined : { id, ...name === undefined ? {} : { name }, windows }
}

function exactAmount(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0 || value.length > 64 || !/^-?\d+(?:\.\d+)?$/u.test(value)) {
    throw new Error(`OpenAI Codex returned an invalid ${key} amount`)
  }
  return value
}

function parseCredits(value: unknown): OpenAICodexCredits | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value) || typeof value['has_credits'] !== 'boolean' || typeof value['unlimited'] !== 'boolean') {
    throw new Error('OpenAI Codex returned malformed credit details')
  }
  if (!value['has_credits']) return undefined
  const balance = value['balance']
  if (balance !== undefined && balance !== null
    && (typeof balance !== 'string' || balance.length === 0 || balance.length > 64 || !/^-?\d+(?:\.\d+)?$/u.test(balance))) {
    throw new Error('OpenAI Codex returned an invalid credit balance')
  }
  return {
    unlimited: value['unlimited'],
    ...typeof balance === 'string' ? { balance } : {},
  }
}

/**
 * RFC 3339 date-time with an explicit zone. ChatGPT encodes reset-credit
 * timestamps as Unix seconds in production but as ISO-8601 strings in its own
 * fixtures, so both encodings are accepted.
 */
const RESET_CREDIT_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u

/** Parse one reset-credit timestamp as Unix seconds, rejecting malformed values. */
function parseResetCreditTimestamp(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`OpenAI Codex returned an invalid reset-credit ${field}`)
    }
    return value
  }
  if (typeof value === 'string' && RESET_CREDIT_TIMESTAMP.test(value)) {
    const milliseconds = Date.parse(value)
    if (Number.isFinite(milliseconds) && milliseconds >= 0) return Math.floor(milliseconds / 1_000)
  }
  throw new Error(`OpenAI Codex returned an invalid reset-credit ${field}`)
}

function parseResetCredit(value: unknown): OpenAICodexResetCredit {
  if (!isRecord(value)) throw new Error('OpenAI Codex returned a malformed reset credit')
  const id = value['id']
  if (typeof id !== 'string' || id.length === 0 || id.length > 256) {
    throw new Error('OpenAI Codex returned an invalid reset-credit id')
  }
  const resetType = value['reset_type']
  if (typeof resetType !== 'string' || resetType.length === 0 || resetType.length > 128) {
    throw new Error('OpenAI Codex returned an invalid reset-credit type')
  }
  const status = value['status']
  if (typeof status !== 'string' || status.length === 0 || status.length > 128) {
    throw new Error('OpenAI Codex returned an invalid reset-credit status')
  }
  const grantedAt = parseResetCreditTimestamp(value['granted_at'], 'grant time')
  if (grantedAt === undefined) throw new Error('OpenAI Codex returned a reset credit without a grant time')
  const expiresAt = parseResetCreditTimestamp(value['expires_at'], 'expiry time')
  const title = value['title']
  if (title !== undefined && title !== null && (typeof title !== 'string' || title.length === 0 || title.length > 256)) {
    throw new Error('OpenAI Codex returned an invalid reset-credit title')
  }
  return {
    id,
    resetType,
    status,
    grantedAt,
    ...expiresAt === undefined ? {} : { expiresAt },
    ...typeof title === 'string' ? { title } : {},
  }
}

/**
 * Parse the optional reset-credit block. Throws on malformed values so the
 * caller can decide; the usage projection treats the whole block as optional.
 */
function parseResetCredits(value: unknown): OpenAICodexResetCredits | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) throw new Error('OpenAI Codex returned malformed reset-credit details')
  const availableCount = value['available_count']
  if (typeof availableCount !== 'number' || !Number.isSafeInteger(availableCount) || availableCount < 0) {
    throw new Error('OpenAI Codex returned an invalid reset-credit count')
  }
  const entries = value['credits']
  if (entries !== undefined && entries !== null && !Array.isArray(entries)) {
    throw new Error('OpenAI Codex returned malformed reset-credit entries')
  }
  const credits = entries === undefined || entries === null ? undefined : entries.map(parseResetCredit)
  return {
    availableCount,
    ...credits === undefined ? {} : { credits },
  }
}

/**
 * Read one account's per-card reset-credit details as that account. The usage
 * summary carries only a count, so titles and grant/expiry times come from this
 * second read.
 * @param access - bearer token already resolved for the target account.
 * @param accountId - provider account id sent as the routing header.
 * @param signal - shared request deadline.
 * @returns the parsed details block.
 * @throws When the response is not OK or unreadable.
 */
async function readResetCreditDetails(
  access: string,
  accountId: string,
  signal: AbortSignal,
): Promise<OpenAICodexResetCredits> {
  const response = await fetch(OPENAI_CODEX_RESET_CREDITS_URL, {
    method: 'GET',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${access}`,
      'chatgpt-account-id': accountId,
      accept: 'application/json',
      'cache-control': 'no-store',
      'user-agent': 'dsh-codex-connect',
    },
    signal,
  })
  if (!response.ok) {
    await cancelDiscardedResponseBody(response)
    throw new Error(`OpenAI Codex reset-credit request failed with HTTP ${response.status}`)
  }
  const parsed = parseResetCredits(await response.json())
  if (parsed === undefined) throw new Error('OpenAI Codex returned no reset-credit details')
  return parsed
}

function parseIndividualLimit(value: unknown): OpenAICodexIndividualLimit | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) throw new Error('OpenAI Codex returned malformed spend-control details')
  const individual = value['individual_limit']
  if (individual === undefined || individual === null) return undefined
  if (!isRecord(individual)) throw new Error('OpenAI Codex returned a malformed individual limit')
  const remainingPercent = individual['remaining_percent']
  if (typeof remainingPercent !== 'number' || !Number.isFinite(remainingPercent)
    || remainingPercent < 0 || remainingPercent > 100) {
    throw new Error('OpenAI Codex returned an invalid individual-limit percentage')
  }
  return {
    limit: exactAmount(individual, 'limit'),
    used: exactAmount(individual, 'used'),
    remaining: exactAmount(individual, 'remaining'),
    remainingPercent,
  }
}

/**
 * Convert the provider response into the small secret-free object sent to the browser.
 * @param value - opaque JSON returned by the ChatGPT usage endpoint.
 * @returns core and additionally metered quota buckets with remaining percentages,
 *   plus the optional reset-credit block.
 */
export function parseOpenAICodexUsage(value: unknown): OpenAICodexUsage {
  if (!isRecord(value)) throw new Error('OpenAI Codex returned a malformed usage response')
  const limits: OpenAICodexRateLimit[] = []
  const primary = parseLimit('codex', 'Codex', value['rate_limit'])
  if (primary !== undefined) limits.push(primary)

  const additional = value['additional_rate_limits']
  if (additional !== undefined && additional !== null && !Array.isArray(additional)) {
    throw new Error('OpenAI Codex returned malformed additional rate limits')
  }
  for (const item of additional ?? []) {
    if (!isRecord(item)) throw new Error('OpenAI Codex returned a malformed additional rate limit')
    const id = item['metered_feature']
    const name = item['limit_name']
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('OpenAI Codex returned an additional rate limit without an id')
    }
    if (name !== undefined && name !== null && typeof name !== 'string') {
      throw new Error('OpenAI Codex returned an invalid additional rate-limit name')
    }
    const limit = parseLimit(id, typeof name === 'string' && name.length > 0 ? name : undefined, item['rate_limit'])
    if (limit !== undefined) limits.push(limit)
  }
  const credits = parseCredits(value['credits'])
  const individualLimit = parseIndividualLimit(value['spend_control'])
  // Reset credits are optional metadata: a malformed block is omitted so the
  // quota windows it accompanies keep working.
  let resetCredits: OpenAICodexResetCredits | undefined
  try {
    resetCredits = parseResetCredits(value['rate_limit_reset_credits'])
  } catch {
    resetCredits = undefined
  }
  return {
    rateLimits: limits,
    ...credits === undefined ? {} : { credits },
    ...individualLimit === undefined ? {} : { individualLimit },
    ...resetCredits === undefined ? {} : { resetCredits },
  }
}

/**
 * Read current quota without issuing a model request. OAuth is refreshed through
 * the same provider-native credential lifecycle used by normal Codex turns.
 * @param store - plugin-owned OAuth credential store.
 * @returns current rate-limit buckets safe to expose to the local browser page.
 */
export async function readOpenAICodexRateLimits(
  store: Pick<OpenAICodexCredentialStore, 'captureActiveAccount'>,
): Promise<OpenAICodexUsage> {
  const signal = AbortSignal.timeout(USAGE_REQUEST_TIMEOUT_MS)
  const auth = await readOpenAICodexRequestAuth(store, signal).catch((error: unknown) => {
    if (error instanceof OpenAICodexRequestAuthError && error.code === 'REAUTH_REQUIRED') {
      throw new OpenAICodexReauthRequiredError()
    }
    throw error
  })
  const access = auth?.access
  const accountId = auth?.accountId
  if (access === undefined || access.length === 0 || typeof accountId !== 'string' || accountId.length === 0) {
    throw new Error('OpenAI Codex is signed out')
  }
  const response = await fetch(OPENAI_CODEX_USAGE_URL, {
    method: 'GET',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${access}`,
      'chatgpt-account-id': accountId,
      accept: 'application/json',
      'cache-control': 'no-store',
      'user-agent': 'dsh-codex-connect',
    },
    signal,
  })
  if (!response.ok) {
    await cancelDiscardedResponseBody(response)
    if (response.status === 401 || response.status === 403) {
      throw new OpenAICodexReauthRequiredError()
    }
    throw new Error(`OpenAI Codex usage request failed with HTTP ${response.status}`)
  }
  let value: unknown
  try {
    value = await response.json()
  } catch (error: unknown) {
    throw new Error('OpenAI Codex returned an unreadable usage response', { cause: error })
  }
  const usage = parseOpenAICodexUsage(value)
  const summary = usage.resetCredits
  // Only a reported card justifies the second read, and only the summaries that
  // cannot name their cards need it.
  if (summary === undefined || summary.credits !== undefined || summary.availableCount === 0) return usage
  try {
    const details = await readResetCreditDetails(access, accountId, signal)
    return details.credits === undefined
      ? usage
      : { ...usage, resetCredits: { ...summary, credits: details.credits } }
  } catch {
    // The count alone still serves the panel; per-card times are a display nicety.
    return usage
  }
}
