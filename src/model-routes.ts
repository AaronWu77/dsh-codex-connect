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
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

/** Register the read-only catalog route consumed by Plugin configuration. */
export function registerOpenAICodexModelCatalogRoute(
  ctx: Context,
  resolveCatalog: () => readonly OpenAICodexModelCatalogEntry[],
  trustedOrigins: OpenAICodexTrustedOriginsStore,
): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: OPENAI_CODEX_MODEL_CATALOG_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
      const decision = await trustedRequestDecision(req, trustedOrigins)
      if (!decision.trusted) return json(res, 403, { error: decision.error })
      return json(res, 200, resolveCatalog())
    },
  }), 'dsh-codex-connect: model catalog route')
}

/** Host dependencies of the catalog provenance and refresh affordance. */
export interface OpenAICodexModelCatalogStatusOptions {
  /** Effective catalog provenance the settings card displays. */
  status: () => OpenAICodexModelCatalogStatus
  /** Force one live read through the active account; resolves after the attempt settles. */
  refresh: () => Promise<void>
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
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
      const decision = await trustedRequestDecision(req, trustedOrigins)
      if (!decision.trusted) return json(res, 403, { error: decision.error })
      return json(res, 200, options.status())
    },
  }), 'dsh-codex-connect: model catalog status route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
      const decision = await trustedRequestDecision(req, trustedOrigins)
      if (!decision.trusted) return json(res, 403, { error: decision.error })
      await options.refresh()
      return json(res, 200, options.status())
    },
  }), 'dsh-codex-connect: model catalog refresh route')
}
