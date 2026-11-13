/** Same-origin read route for the sidebar's recent-request list. */
import type { Context } from '@deepseek-ai/cordis'
import type { RecentRequestLog } from '../recent-requests.ts'

/** Browser route returning the process-local recent request summaries. */
export const RECENT_REQUESTS_PATH = '/api/dsh-codex-connect/recent-requests'

/** One exact Fetch-route registrar, as consumed. */
interface FetchRegistrarLike {
  register(route: {
    path: string
    methods: readonly string[]
    requestBody: 'buffered'
    fetch: (request: Request) => Response | Promise<Response>
  }): () => void | Promise<void>
}

/** @param value - an unknown service face. @returns its `fetch` registrar when usable. */
function registrarOf(value: unknown): FetchRegistrarLike | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const fetch = (value as { fetch?: unknown }).fetch
  if (fetch === null || typeof fetch !== 'object') return undefined
  const register = (fetch as { register?: unknown }).register
  if (typeof register !== 'function') return undefined
  return { register: register.bind(fetch) as FetchRegistrarLike['register'] }
}

/**
 * Register the read-only recent-request route while the connection carrier exists.
 * @param ctx - plugin context carrying the optional connection service.
 * @param log - the plugin instance's bounded recent-request log.
 */
export function watchRecentRequests(ctx: Context, log: RecentRequestLog): void {
  ctx.inject(['connection'], (scope) => {
    const register = registrarOf(scope.get('connection'))
    if (register === undefined) return
    scope.effect(() => register.register({
      path: RECENT_REQUESTS_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (): Response => Response.json(
        { requests: log.snapshot() },
        { headers: { 'cache-control': 'no-store' } },
      ),
    }), 'dsh-codex-connect: recent request route')
  })
}
