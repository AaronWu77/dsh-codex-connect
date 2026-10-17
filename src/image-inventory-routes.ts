/** Authenticated, session-scoped image choices; this endpoint exposes no image bytes or paths. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SessionId } from '@deepseek-ai/dsh-session'
import { harnessHttpRejection } from './http-auth.ts'
import { trustedRequestDecision } from './auth-routes.ts'
import type { OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import { IMAGE_INVENTORY_PATH } from './image-input-contract.ts'
import { sessionImageSelections } from './image-history.ts'

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}

/** Register current-session choices. Unloaded or removed sessions require opening the session again. */
export function registerImageInventoryRoute(ctx: Context, trustedOrigins: OpenAICodexTrustedOriginsStore): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: IMAGE_INVENTORY_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const rejection = harnessHttpRejection(ctx, req)
      if (rejection !== undefined) return json(res, rejection.status, { error: rejection.error })
      const trust = await trustedRequestDecision(req, trustedOrigins)
      if (!trust.trusted) return json(res, 403, { error: trust.error })
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
      const query = new URL(req.url ?? '/', 'http://dsh.invalid').searchParams
      const ids = query.getAll('sessionId')
      const id = ids[0]
      if (ids.length !== 1 || id === undefined || id.length < 1 || id.length > 512
        || [...query.keys()].some(key => key !== 'sessionId')) return json(res, 400, { error: 'invalid input' })
      const session = ctx.get('sessions')?.get(SessionId(id))
      if (session === undefined) return json(res, 404, { error: 'session unavailable' })
      return json(res, 200, { version: 1, items: sessionImageSelections(session) })
    },
  }), 'dsh-codex-connect: session image selections')
}
