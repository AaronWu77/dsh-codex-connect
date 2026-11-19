/** Same-origin, revisioned speed commands with Host-derived account attribution. */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import { trustedRequestDecision } from './auth-routes.ts'
import { harnessHttpRejection, HttpRouteScope } from './http-auth.ts'
import { isFastModeSessionId } from './fast-mode.ts'
import { isOpenAICodexRouteId } from './account-route-id.ts'
import { ConversationSpeedRegistry } from './speed-mode-registry.ts'
import { OPENAI_CODEX_SPEED_MODE_PATH, OpenAICodexSpeedError, isOpenAICodexSpeedMode } from './speed-mode-contract.ts'

/** Independent speed route collaborators; no browser-supplied account key is trusted. */
export interface OpenAICodexSpeedRouteOptions {
  readonly trustedOrigins: OpenAICodexTrustedOriginsStore
  readonly registry: ConversationSpeedRegistry
  /** Return the currently bound route's account, or reject a route no longer registered. */
  readonly resolveRouteAccountKey: (provider: string, signal: AbortSignal) => Promise<string | undefined>
}

const BODY_LIMIT = 4096
function json(res: ServerResponse, status: number, value: unknown): void {
  if (res.destroyed) return
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function modelId(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value }
function providerId(value: unknown): value is string { return typeof value === 'string' && value.length <= 128 && isOpenAICodexRouteId(value) }
function generationId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/u.test(value) }

async function body(req: IncomingMessage, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted()
  const declared = req.headers['content-length']
  if (declared !== undefined && (typeof declared !== 'string' || !/^[0-9]+$/u.test(declared))) throw new TypeError('Invalid speed body length')
  if (declared !== undefined && Number(declared) > BODY_LIMIT) throw new RangeError('Speed body too large')
  const chunks: Uint8Array[] = []
  let length = 0
  const abort = (): void => { req.destroy() }
  signal.addEventListener('abort', abort, { once: true })
  try {
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      signal.throwIfAborted()
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : new Uint8Array(chunk)
      length += bytes.byteLength
      if (length > BODY_LIMIT) throw new RangeError('Speed body too large')
      chunks.push(bytes)
    }
    signal.throwIfAborted()
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
    return value
  } finally { signal.removeEventListener('abort', abort) }
}

/** Register a reversible authenticated route; failed or stale POSTs are never retried. */
export function registerOpenAICodexSpeedModeRoutes(ctx: Context, options: OpenAICodexSpeedRouteOptions): void {
  const { registry, trustedOrigins, resolveRouteAccountKey } = options
  ctx.effect(function* () {
    const owner = new HttpRouteScope(ctx)
    yield () => owner.dispose()
    yield owner.register({ kind: 'exact', path: OPENAI_CODEX_SPEED_MODE_PATH, handler: async (req, res, signal) => {
      if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
      const rejection = harnessHttpRejection(ctx, req)
      if (rejection !== undefined) return json(res, rejection.status, { error: rejection.error })
      const trusted = await trustedRequestDecision(req, trustedOrigins)
      if (!trusted.trusted) return json(res, 403, { error: trusted.error })
      if (signal.aborted) return
      try {
        let sessionId: unknown, provider: unknown, model: unknown, generation: unknown, revision: unknown, mode: unknown
        if (req.method === 'GET') {
          const query = new URL(req.url ?? '', 'http://dsh.invalid').searchParams
          const one = (key: string): string | undefined => { const values = query.getAll(key); return values.length === 1 ? values[0] : undefined }
          sessionId = one('sessionId'); provider = one('provider'); model = one('model')
        } else {
          const type = req.headers['content-type']
          if (typeof type !== 'string' || !/^application\/json(?:\s*;|$)/iu.test(type.trim())) return json(res, 415, { error: 'unsupported content type' })
          const value = await body(req, signal)
          if (!record(value) || Object.keys(value).sort().join(',') !== 'generation,mode,model,provider,revision,sessionId') return json(res, 400, { error: 'invalid input' })
          ;({ sessionId, provider, model, generation, revision, mode } = value)
          if (!generationId(generation) || typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0 || !isOpenAICodexSpeedMode(mode)) {
            return json(res, 400, { error: 'invalid input' })
          }
        }
        if (!isFastModeSessionId(sessionId) || !providerId(provider) || !modelId(model)) return json(res, 400, { error: 'invalid input' })
        const workspace = registry.workspaceFor(sessionId)
        const accountKey = await resolveRouteAccountKey(provider, signal)
        signal.throwIfAborted()
        if (workspace !== registry.workspaceFor(sessionId)) throw new OpenAICodexSpeedError('SPEED_SELECTION_STALE')
        const scope = { workspace, accountKey, provider, model }
        if (req.method === 'GET') return json(res, 200, registry.readSpeed(sessionId, scope))
        if (!generationId(generation) || typeof revision !== 'number' || !isOpenAICodexSpeedMode(mode)) return json(res, 400, { error: 'invalid input' })
        return json(res, 200, registry.selectSpeed(sessionId, scope, generation, revision, mode))
      } catch (error) {
        if (signal.aborted) return
        if (error instanceof OpenAICodexSpeedError) return json(res, error.code === 'ULTRAFAST_MODEL_UNSUPPORTED' ? 400 : 409, { error: error.code })
        if (error instanceof RangeError) {
          res.setHeader('connection', 'close')
          res.once('finish', () => { req.destroy() })
          return json(res, 413, { error: 'request body too large' })
        }
        if (error instanceof TypeError || error instanceof SyntaxError) return json(res, 400, { error: 'invalid input' })
        return json(res, 503, { error: 'speed selection unavailable' })
      }
    } })
  }, 'dsh-codex-connect: conversation speed route')
}
