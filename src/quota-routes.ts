/**
 * Same-origin route exposing every stored account's rolling quota windows.
 *
 * The browser can authenticate only as the store's active account, so this
 * route reads the other stored accounts on the Host through the plugin's
 * request-scoped credential capture. Each account's failure is contained: the
 * route still answers with the accounts it could read and marks the rest
 * unavailable, and the browser keeps that account's last real figures.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import type { OpenAICodexProxyManager } from './provider-proxy.ts'
import type { OpenAICodexCredentialStore } from './store.ts'
import { OPENAI_CODEX_QUOTA_PATH } from './quota-contract.ts'
import type { OpenAICodexQuotaAccount, OpenAICodexQuotaPayload } from './quota-contract.ts'
import { readOpenAICodexRateLimits } from './usage.ts'
import { trustedRequestDecision } from './auth-routes.ts'

/** Host dependencies the quota route reads stored accounts through. */
export interface OpenAICodexQuotaRouteOptions {
  /** Owns the stored accounts and request-scoped credential capture. */
  store: OpenAICodexCredentialStore
  /** Loopback defaults plus the remote-browser allowlist used by every plugin route. */
  trustedOrigins: OpenAICodexTrustedOriginsStore
  /** Owns Codex-only proxy dispatch; absent uses the direct connection. */
  proxyManager?: OpenAICodexProxyManager | undefined
  /** Resolve the explicitly activated proxy for each read. */
  resolveProxyUrl?: (() => string | undefined) | undefined
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

/**
 * Read one stored account's usage as that exact account, never as the current
 * selection, so a concurrent switch cannot attribute another account's figures.
 * @param options - Host dependencies shared by every account read.
 * @param accountKey - browser-safe key from the store's account list.
 * @returns the account's secret-free figures, or its unavailable marker.
 */
async function readAccount(
  options: OpenAICodexQuotaRouteOptions,
  accountKey: string,
): Promise<OpenAICodexQuotaAccount> {
  try {
    const credentials = await options.store.captureAccount(accountKey)
    const readUsage = (): ReturnType<typeof readOpenAICodexRateLimits> => readOpenAICodexRateLimits(credentials)
    const usage = await (options.proxyManager?.run(options.resolveProxyUrl?.(), readUsage) ?? readUsage())
    return { accountKey, usage }
  } catch {
    // One account's failure must not blank the others; the client holds its last figures.
    return { accountKey, unavailable: true }
  }
}

/** Register the read-only per-account quota route consumed by the client service. */
export function registerOpenAICodexQuotaRoute(ctx: Context, options: OpenAICodexQuotaRouteOptions): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: OPENAI_CODEX_QUOTA_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
      const decision = await trustedRequestDecision(req, options.trustedOrigins)
      if (!decision.trusted) return json(res, 403, { error: decision.error })
      try {
        const summaries = await options.store.accounts()
        const activeAccountKey = summaries.find(summary => summary.active)?.accountKey
        // The active account stays on the account store's own polled snapshot,
        // so this route neither re-reads it nor duplicates that race.
        const accounts = await Promise.all(summaries
          .filter(summary => summary.accountKey !== activeAccountKey)
          .map(summary => readAccount(options, summary.accountKey)))
        const payload: OpenAICodexQuotaPayload = { accounts }
        return json(res, 200, payload)
      } catch {
        // An unreadable credential document still answers, so the client keeps its figures.
        return json(res, 200, { accounts: [] } satisfies OpenAICodexQuotaPayload)
      }
    },
  }), 'dsh-codex-connect: quota route')
}
