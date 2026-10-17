/** Fixed, bounded OAuth transport shared with optional Codex image capabilities. */

import { randomUUID } from 'node:crypto'
import { IMAGE_EDIT_MAX_REQUEST_BYTES, snapshotImageEditRequest } from './image-edit-request.ts'
import type { ImageEditRequest, InlineEditImage } from './image-edit-request.ts'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { readOpenAICodexRequestAuth } from './auth.ts'
import {
  OPENAI_CODEX_REAUTH_REQUIRED_CODE,
} from './usage.ts'
import type { OpenAICodexCredentialStore } from './store.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import type { OpenAICodexProxyManager } from './provider-proxy.ts'
import { DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT, parseOpenAICodexImageModelHint } from './settings-contract.ts'

/** Cordis service name owned by the core plugin fiber. */
export const OPENAI_CODEX_TRANSPORT_SERVICE = 'openaiCodexTransport'

/** Structured contract version used across the core and companion packages. */
export const OPENAI_CODEX_TRANSPORT_API_VERSION = 1 as const

/** Stage-zero verified image-generation endpoint. */
export const OPENAI_CODEX_IMAGE_GENERATION_URL = 'https://chatgpt.com/backend-api/codex/images/generations'

/** Fixed image edit endpoint; unsupported edits never use the generation route. */
export const OPENAI_CODEX_IMAGE_EDIT_URL = 'https://chatgpt.com/backend-api/codex/images/edits'

/** Network deadline covering the request and bounded response read. */
export const OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS = 120_000

/** Maximum accepted success-body size: 48 MiB. */
export const OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES = 48 * 1024 * 1024

/** Maximum error-body size read and discarded: 64 KiB. */
export const OPENAI_CODEX_IMAGE_MAX_ERROR_BYTES = 64 * 1024

/** Defensive upper bound for unexpected multi-image responses. */
export const OPENAI_CODEX_IMAGE_MAX_COUNT = 4

/** Local prompt limit enforced before any credential or network work. */
export const OPENAI_CODEX_IMAGE_PROMPT_MAX_LENGTH = 32_000

/** Internal, unverified route hint. It is intentionally not exported. */
const IMAGE_ROUTE_HINT_MODEL = 'gpt-image-2'

/** Stable, secret-free transport errors consumed structurally by companion packages. */
export const OPENAI_CODEX_TRANSPORT_ERROR_CODES = {
  invalidRequest: 'OPENAI_CODEX_INVALID_REQUEST',
  signedOut: 'OPENAI_CODEX_SIGNED_OUT',
  reauthRequired: OPENAI_CODEX_REAUTH_REQUIRED_CODE,
  rateLimited: 'OPENAI_CODEX_RATE_LIMITED',
  upstreamRejected: 'OPENAI_CODEX_UPSTREAM_REJECTED',
  upstreamUnavailable: 'OPENAI_CODEX_UPSTREAM_UNAVAILABLE',
  redirectRejected: 'OPENAI_CODEX_REDIRECT_REJECTED',
  timeout: 'OPENAI_CODEX_TIMEOUT',
  canceled: 'OPENAI_CODEX_CANCELED',
  networkError: 'OPENAI_CODEX_NETWORK_ERROR',
  responseTooLarge: 'OPENAI_CODEX_RESPONSE_TOO_LARGE',
  malformedResponse: 'OPENAI_CODEX_MALFORMED_RESPONSE',
} as const

/** Union of the stable transport error codes. */
export type OpenAICodexTransportErrorCode =
  (typeof OPENAI_CODEX_TRANSPORT_ERROR_CODES)[keyof typeof OPENAI_CODEX_TRANSPORT_ERROR_CODES]

const TRANSPORT_ERROR_CODES = new Set<string>(Object.values(OPENAI_CODEX_TRANSPORT_ERROR_CODES))

const ERROR_MESSAGES: Record<OpenAICodexTransportErrorCode, string> = {
  OPENAI_CODEX_INVALID_REQUEST: 'The Codex image request is invalid',
  OPENAI_CODEX_SIGNED_OUT: 'OpenAI Codex is signed out',
  OPENAI_CODEX_REAUTH_REQUIRED: 'OpenAI Codex authorization must be renewed',
  OPENAI_CODEX_RATE_LIMITED: 'The Codex image endpoint is rate limited',
  OPENAI_CODEX_UPSTREAM_REJECTED: 'The Codex image endpoint rejected the request',
  OPENAI_CODEX_UPSTREAM_UNAVAILABLE: 'The Codex image endpoint is unavailable',
  OPENAI_CODEX_REDIRECT_REJECTED: 'The Codex image endpoint returned a redirect',
  OPENAI_CODEX_TIMEOUT: 'The Codex image request timed out and may still be processing',
  OPENAI_CODEX_CANCELED: 'The Codex image request was canceled and may still be processing',
  OPENAI_CODEX_NETWORK_ERROR: 'The Codex image request failed before a response was received',
  OPENAI_CODEX_RESPONSE_TOO_LARGE: 'The Codex image response exceeded the safe size limit',
  OPENAI_CODEX_MALFORMED_RESPONSE: 'The Codex image endpoint returned an unreadable response',
}

/** Fixed, secret-free transport failure. */
export class OpenAICodexTransportError extends Error {
  readonly code: OpenAICodexTransportErrorCode
  readonly status?: number
  readonly retryAfterSeconds?: number

  constructor(
    code: OpenAICodexTransportErrorCode,
    options: { status?: number; retryAfterSeconds?: number } = {},
  ) {
    super(ERROR_MESSAGES[code])
    this.name = 'OpenAICodexTransportError'
    this.code = code
    if (options.status !== undefined) this.status = options.status
    if (options.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds
  }
}

/** Identify transport failures structurally without relying on cross-package class identity. */
export function isOpenAICodexTransportError(error: unknown): error is OpenAICodexTransportError {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) return false
  const code = (error as Record<string, unknown>)['code']
  return typeof code === 'string' && TRANSPORT_ERROR_CODES.has(code)
}

/** Only caller-controlled field accepted by the Host transport. */
export interface ImageGenerationRequest {
  readonly prompt: string
}

/** Request lifecycle supplied by the Host tool in PR-3. */
export interface ImageRequestContext {
  /** Captured route account; absence retains the active image-account behavior. */
  readonly accountKey?: string
  readonly signal?: AbortSignal | undefined
}

/** One encoded image awaiting PR-3 signature and attachment validation. */
export interface GeneratedImagePayload {
  readonly b64Json: string
}

/** Bounded, structured success projection returned to the companion package. */
export interface ImageGenerationResponse {
  readonly apiVersion: 1
  readonly traceId: string
  readonly elapsedMs: number
  readonly responseBytes: number
  readonly images: readonly GeneratedImagePayload[]
}

/** Versioned Host-only API provided by the core plugin. */
export interface OpenAICodexTransportV1 {
  readonly apiVersion: 1
  /** Optional increment: callers reject edits when absent, without generating. */
  editImages?(input: ImageEditRequest, context: ImageRequestContext): Promise<ImageGenerationResponse>
  generateImages(
    input: ImageGenerationRequest,
    context: ImageRequestContext,
  ): Promise<ImageGenerationResponse>
}

function responseTooLarge(): OpenAICodexTransportError {
  return new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.responseTooLarge)
}

/** Read a response body without ever retaining more than `maxBytes`. */
export async function readOpenAICodexBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new TypeError('maxBytes must be a non-negative safe integer')
  const declared = response.headers.get('content-length')
  if (declared !== null && /^\d+$/u.test(declared) && Number(declared) > maxBytes) {
    try { await response.body?.cancel() } catch (_error) { /* The size rejection remains authoritative after cleanup. */ }
    throw responseTooLarge()
  }
  if (response.body === null) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel()
        throw responseTooLarge()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get('retry-after')
  if (value === null || !/^\d+$/u.test(value)) return undefined
  const seconds = Number(value)
  return Number.isSafeInteger(seconds) ? seconds : undefined
}

function statusError(response: Response): OpenAICodexTransportError {
  const options: { status?: number; retryAfterSeconds?: number } = { status: response.status }
  const retryAfter = response.status === 429 ? retryAfterSeconds(response) : undefined
  if (retryAfter !== undefined) options.retryAfterSeconds = retryAfter
  if (response.type === 'opaqueredirect' || response.status === 0
    || (response.status >= 300 && response.status < 400)) {
    return new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.redirectRejected, options)
  }
  if (response.status === 401 || response.status === 403) {
    return new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.reauthRequired, options)
  }
  if (response.status === 429) {
    return new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.rateLimited, options)
  }
  if (response.status >= 400 && response.status < 500) {
    return new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.upstreamRejected, options)
  }
  return new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.upstreamUnavailable, options)
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

function parseSuccess(bytes: Uint8Array): readonly GeneratedImagePayload[] {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse)
  }
  const data = (value as Record<string, unknown>)['data']
  if (!Array.isArray(data) || data.length === 0 || data.length > OPENAI_CODEX_IMAGE_MAX_COUNT) {
    throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse)
  }
  const images: GeneratedImagePayload[] = []
  for (const item of data) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse)
    }
    const b64Json = (item as Record<string, unknown>)['b64_json']
    if (typeof b64Json !== 'string' || b64Json.length === 0) {
      throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse)
    }
    images.push({ b64Json })
  }
  return images
}

/** Core-owned Cordis service for the optional image package. */
export class OpenAICodexTransport extends Service implements OpenAICodexTransportV1 {
  readonly apiVersion = OPENAI_CODEX_TRANSPORT_API_VERSION
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<ImageGenerationResponse>>()

  constructor(
    ctx: Context,
    private readonly credentials: OpenAICodexCredentialStore,
    private readonly proxyManager?: OpenAICodexProxyManager,
    private readonly resolveProxyUrl: () => string | undefined = () => undefined,
    private readonly resolveImageModelHint: () => string = () => DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT,
  ) {
    super(ctx, OPENAI_CODEX_TRANSPORT_SERVICE)
    ctx.effect(() => async () => {
      this.lifetime.abort()
      await Promise.allSettled([...this.pending])
    })
  }

  private requestImages(input: ImageGenerationRequest, context: ImageRequestContext, images?: readonly InlineEditImage[]): Promise<ImageGenerationResponse> {
    const signal = context.signal === undefined ? this.lifetime.signal : AbortSignal.any([context.signal, this.lifetime.signal])
    const captured = { signal, ...(context.accountKey === undefined ? {} : { accountKey: context.accountKey }) }
    const operation = () => this.generateImagesWithoutProxy(input, captured, images)
    const request = this.proxyManager?.run(this.resolveProxyUrl(), operation) ?? operation()
    this.pending.add(request)
    void request.then(() => { this.pending.delete(request) }, () => { this.pending.delete(request) })
    return request
  }

  async generateImages(
    input: ImageGenerationRequest,
    context: ImageRequestContext,
  ): Promise<ImageGenerationResponse> {
    return this.requestImages(input, context)
  }

  /** Snapshot authorized image bytes before queueing; one request, no automatic retry. */
  async editImages(input: ImageEditRequest, context: ImageRequestContext): Promise<ImageGenerationResponse> {
    if (isAborted(context.signal)) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.canceled)
    let snapshot: ReturnType<typeof snapshotImageEditRequest>
    try {
      snapshot = snapshotImageEditRequest(input)
    } catch {
      throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.invalidRequest)
    }
    return this.requestImages({ prompt: snapshot.prompt }, context, snapshot.images)
  }

  private async generateImagesWithoutProxy(
    input: ImageGenerationRequest,
    context: ImageRequestContext,
    images?: readonly InlineEditImage[],
  ): Promise<ImageGenerationResponse> {
    if (typeof input?.prompt !== 'string' || input.prompt.trim().length === 0
      || input.prompt.length > OPENAI_CODEX_IMAGE_PROMPT_MAX_LENGTH) {
      throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.invalidRequest)
    }
    if (isAborted(context.signal)) {
      throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.canceled)
    }
    let imageModelHint: string
    try {
      imageModelHint = parseOpenAICodexImageModelHint(this.resolveImageModelHint()) || IMAGE_ROUTE_HINT_MODEL
    } catch {
      throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.invalidRequest)
    }

    const body = JSON.stringify({ model: imageModelHint, prompt: input.prompt, ...(images === undefined ? {} : { images }) })
    if (images !== undefined && Buffer.byteLength(body, 'utf8') > IMAGE_EDIT_MAX_REQUEST_BYTES) {
      throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.invalidRequest)
    }
    const credentials = context.accountKey === undefined
      ? await this.credentials.captureActiveAccount()
      : await this.credentials.captureAccount(context.accountKey)
    const stored = await credentials.read(OPENAI_CODEX_PROVIDER)
    if (stored?.type !== 'oauth') {
      throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.signedOut)
    }

    let auth: Awaited<ReturnType<typeof readOpenAICodexRequestAuth>>
    try {
      auth = await readOpenAICodexRequestAuth(credentials, context.signal)
    } catch {
      if (isAborted(context.signal)) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.canceled)
      throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.reauthRequired)
    }
    const access = auth?.access
    const accountId = auth?.accountId
    if (typeof access !== 'string' || access.length === 0
      || typeof accountId !== 'string' || accountId.length === 0) {
      throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.reauthRequired)
    }
    if (isAborted(context.signal)) {
      throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.canceled)
    }

    const traceId = randomUUID()
    const startedAt = Date.now()
    const controller = new AbortController()
    let timedOut = false
    const onCallerAbort = (): void => controller.abort()
    context.signal?.addEventListener('abort', onCallerAbort, { once: true })
    if (isAborted(context.signal)) controller.abort()
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS)

    try {
      const response = await globalThis.fetch(images === undefined ? OPENAI_CODEX_IMAGE_GENERATION_URL : OPENAI_CODEX_IMAGE_EDIT_URL, {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${access}`,
          'chatgpt-account-id': accountId,
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': 'dsh-codex-connect',
        },
        body,
      })
      if (!response.ok) {
        try {
          await readOpenAICodexBoundedBody(response, OPENAI_CODEX_IMAGE_MAX_ERROR_BYTES)
        } catch {
          // Error bodies are deliberately discarded; status remains authoritative.
        }
        throw statusError(response)
      }
      if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        try { await response.body?.cancel() } catch (_error) { /* Preserve the malformed-response classification after cleanup. */ }
        throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse)
      }
      const bytes = await readOpenAICodexBoundedBody(response, OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES)
      const responseImages = parseSuccess(bytes)
      if (isAborted(context.signal)) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.canceled)
      if (timedOut) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.timeout)
      return {
        apiVersion: OPENAI_CODEX_TRANSPORT_API_VERSION,
        traceId,
        elapsedMs: Date.now() - startedAt,
        responseBytes: bytes.byteLength,
        images: responseImages,
      }
    } catch (error: unknown) {
      if (isOpenAICodexTransportError(error)) throw error
      if (isAborted(context.signal)) {
        throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.canceled)
      }
      if (timedOut) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.timeout)
      throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.networkError)
    } finally {
      controller.abort()
      clearTimeout(timer)
      context.signal?.removeEventListener('abort', onCallerAbort)
    }
  }
}
