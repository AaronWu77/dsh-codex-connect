import { harnessHttpRejection, HttpRouteScope } from './http-auth.ts'
/** Same-origin proxy detection routes for the OpenAI Codex settings card. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import { trustedRequestDecision } from './auth-routes.ts'
import {
  detectOpenAICodexProxies,
  OpenAICodexProxyManager,
} from './provider-proxy.ts'
import {
  OPENAI_CODEX_PROXY_DETECT_PATH,
  OPENAI_CODEX_PROXY_TEST_PATH,
} from './proxy-paths.ts'

function json(res: ServerResponse, status: number, value: unknown): void {
  if (res.destroyed) return
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

function proxyUrlFromQuery(req: IncomingMessage): string | undefined {
  if (typeof req.url !== 'string') return undefined
  try {
    const parsed = new URL(req.url, 'http://dsh.invalid')
    const values = parsed.searchParams.getAll('proxyUrl')
    return values.length === 1 && values[0]!.length <= 2_000 ? values[0] : undefined
  } catch {
    return undefined
  }
}

/** Register bounded detection and draft-probe routes; neither route mutates settings. */
export function registerOpenAICodexProxyRoutes(
  ctx: Context,
  trustedOrigins: OpenAICodexTrustedOriginsStore,
  manager: OpenAICodexProxyManager,
): void {
  ctx.effect(function* () {
    const scope = new HttpRouteScope(ctx)
    yield () => scope.dispose()
    const authorize = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
      const rejection = harnessHttpRejection(ctx, req)
      if (rejection !== undefined) { json(res, rejection.status, { error: rejection.error }); return false }
      const decision = await trustedRequestDecision(req, trustedOrigins)
      if (decision.trusted) return true
      json(res, 403, { error: decision.error })
      return false
    }
    yield scope.register({
        kind: 'exact',
        path: OPENAI_CODEX_PROXY_DETECT_PATH,
        handler: async (req, res, signal) => {
          if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
          if (!await authorize(req, res) || signal.aborted) return
          const results = await detectOpenAICodexProxies(manager, signal)
          return json(res, 200, {
            candidates: results.filter(result => result.reachable),
            results,
          })
        },
    })
    yield scope.register({
        kind: 'exact',
        path: OPENAI_CODEX_PROXY_TEST_PATH,
        handler: async (req, res, signal) => {
          if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
          if (!await authorize(req, res) || signal.aborted) return
          const proxyUrl = proxyUrlFromQuery(req)
          if (proxyUrl === undefined) return json(res, 400, { error: 'invalid proxy URL' })
          return json(res, 200, await manager.probe(proxyUrl, signal))
        },
    })
  }, 'dsh-codex-connect: proxy detection routes')
}

export { OPENAI_CODEX_PROXY_DETECT_PATH, OPENAI_CODEX_PROXY_TEST_PATH } from './proxy-paths.ts'
