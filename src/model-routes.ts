import { harnessHttpRejection, HttpRouteScope } from './http-auth.ts'
/** Same-origin route exposing the complete Codex model catalog. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import type { OpenAICodexModelCatalogEntry, OpenAICodexModelCatalogStatus } from './model-contract.ts'
import {
  OPENAI_CODEX_MODEL_CATALOG_PATH,
  OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH,
  OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH,
} from './model-contract.ts'
import { trustedRequestDecision } from './auth-routes.ts'

function json(res: ServerResponse, status: number, value: unknown): void {
  if (res.destroyed) return
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

/** Return an optional known account query; null rejects invalid or stale account selections. */
async function accountQuery(req: IncomingMessage, keys?: () => readonly string[] | Promise<readonly string[]>): Promise<string | undefined | null> {
  const values = new URL(req.url ?? '/', 'http://localhost').searchParams.getAll('accountKey')
  if (values.length === 0) return undefined
  const key = values[0]
  return values.length === 1 && key !== undefined && (await keys?.())?.includes(key) ? key : null
}

/** Register the read-only catalog route consumed by Plugin configuration. */
export function registerOpenAICodexModelCatalogRoute(
  ctx: Context,
  resolveCatalog: (accountKey?: string) => readonly OpenAICodexModelCatalogEntry[],
  trustedOrigins: OpenAICodexTrustedOriginsStore,
  accountKeys?: () => readonly string[] | Promise<readonly string[]>,
): void {
  ctx.effect(function* () {
    const scope = new HttpRouteScope(ctx)
    yield () => scope.dispose()
    yield scope.register({
    kind: 'exact',
    path: OPENAI_CODEX_MODEL_CATALOG_PATH,
    handler: async (req, res, signal) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
      const rejection = harnessHttpRejection(ctx, req)
      if (rejection !== undefined) { json(res, rejection.status, { error: rejection.error }); return }
      const decision = await trustedRequestDecision(req, trustedOrigins)
      if (!decision.trusted) return json(res, 403, { error: decision.error })
      if (signal.aborted) return
      const accountKey = await accountQuery(req, accountKeys)
      if (accountKey === null) return json(res, 404, { error: 'unknown account' })
      return json(res, 200, resolveCatalog(accountKey))
    },
    })
  }, 'dsh-codex-connect: model catalog route')
}

/** Host dependencies of the catalog provenance and refresh affordance. */
export interface OpenAICodexModelCatalogStatusOptions {
  /** Effective catalog provenance the settings card displays. */
  status: (accountKey?: string) => OpenAICodexModelCatalogStatus
  /** Signed-in account keys accepted by the read-only preview query. */
  accountKeys?: () => readonly string[] | Promise<readonly string[]>
  /** Refresh stored account catalogs; resolves after their attempts settle. */
  refresh: (signal?: AbortSignal) => Promise<void>
}

/**
 * Register the catalog provenance route and the manual refresh action. Both
 * read only the Host's own snapshot, so a refused or failed live read still
 * answers with the last known source instead of an error.
 * @param ctx - Host context carrying the web server.
 * @param options - provenance reader and refresh action.
 * @param trustedOrigins - loopback defaults plus the remote-browser allowlist.
 */
export function registerOpenAICodexModelCatalogStatusRoutes(
  ctx: Context,
  options: OpenAICodexModelCatalogStatusOptions,
  trustedOrigins: OpenAICodexTrustedOriginsStore,
): void {
  ctx.effect(function* () {
    const scope = new HttpRouteScope(ctx)
    yield () => scope.dispose()
    yield scope.register({
    kind: 'exact',
    path: OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH,
    handler: async (req, res, signal) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
      const rejection = harnessHttpRejection(ctx, req)
      if (rejection !== undefined) { json(res, rejection.status, { error: rejection.error }); return }
      const decision = await trustedRequestDecision(req, trustedOrigins)
      if (!decision.trusted) return json(res, 403, { error: decision.error })
      if (signal.aborted) return
      const accountKey = await accountQuery(req, options.accountKeys)
      if (accountKey === null) return json(res, 404, { error: 'unknown account' })
      return json(res, 200, options.status(accountKey))
    },
    })
    yield scope.register({
    kind: 'exact',
    path: OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH,
    handler: async (req, res, signal) => {
      if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
      const rejection = harnessHttpRejection(ctx, req)
      if (rejection !== undefined) { json(res, rejection.status, { error: rejection.error }); return }
      const decision = await trustedRequestDecision(req, trustedOrigins)
      if (!decision.trusted) return json(res, 403, { error: decision.error })
      if (signal.aborted) return
      const accountKey = await accountQuery(req, options.accountKeys)
      if (accountKey === null) return json(res, 404, { error: 'unknown account' })
      await options.refresh(signal)
      if (accountKey !== undefined && await accountQuery(req, options.accountKeys) === null) return json(res, 404, { error: 'unknown account' })
      return json(res, 200, options.status(accountKey))
    },
    })
  }, 'dsh-codex-connect: model catalog status routes')
}
