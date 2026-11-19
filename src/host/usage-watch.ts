/** Arming for Codex Connect's own-session usage unit.
 *
 * Three independent seams, all optional by contract so an older Host leaves the
 * plugin fully functional rather than PENDING forever:
 *
 * 1. The `codexConnectUsage` projection registers on `sessionProjections`. It folds
 *    the durable event log into per-day tokens and requests for one Session, and
 *    the harness streams the finished value to the browser.
 * 2. The two owner-only Fetch routes drive and report the warm-up
 *    (`usage-backfill.ts`), which gives stored Sessions their row on demand.
 *
 * The browser reads those per-Session values straight off the Session list, so
 * this file computes no aggregate and persists no second ledger.
 */

import type { Context, Fiber } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-projection'
import { createCodexConnectUsageDefinition } from './usage-projection.ts'
import { USAGE_BACKFILL_PATH, USAGE_BACKFILL_STATUS_PATH, watchUsageBackfill } from './usage-backfill.ts'
import type { UsageBackfillOptions, UsageBackfillState } from './usage-backfill.ts'

/** Deployment settings for the usage unit and its warm-up. */
export interface LocalUsageOptions extends UsageBackfillOptions {
  /** IANA calendar the daily buckets are keyed in. */
  timeZone: string
  /** Populated days retained per Session. */
  retainedDays: number
}

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
  // Bind at extraction: an unbound hand-off loses `this` on the real face.
  return { register: register.bind(fetch) as FetchRegistrarLike['register'] }
}

/**
 * Register the usage projection and arm its on-demand warm-up.
 * Both seams are deferred injections: the plugin stays fully functional when a
 * Host lacks the projection registry or the cold-path services.
 * @param ctx - Plugin context; each deferred fiber rides this context.
 * @returns A disposer that releases both seams and awaits the running pass.
 */
export function watchLocalUsage(ctx: Context, options: LocalUsageOptions): () => Promise<void> {
  let state: UsageBackfillState = 'idle'
  let trigger: (() => void) | undefined
  let stop: (() => Promise<void>) | undefined

  const projection: Fiber = ctx.inject(['sessionProjections'], (scope) => {
    // The registry may hand back a callable for older generations; awaiting
    // settles either form before the handle is used.
    void Promise.resolve(scope.sessionProjections.register(createCodexConnectUsageDefinition({
      timeZone: options.timeZone,
      retainedDays: options.retainedDays,
    }))).catch((error: unknown) => {
      scope.logger.warn(`dsh-codex-connect: local usage projection not registered (${String(error)})`)
    })
  })

  // The routes own the trigger, so they arm as soon as the carrier exists. The
  // cold-path services gate only the pass itself, never the route bodies.
  const routes: Fiber = ctx.inject(['connection'], (scope) => {
    const register = registrarOf(scope.get('connection'))
    if (register === undefined) return
    scope.effect(() => register.register({
      path: USAGE_BACKFILL_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (): Response => {
        trigger?.()
        return Response.json({ state }, { headers: { 'cache-control': 'no-store' } })
      },
    }), 'dsh-codex-connect: local usage backfill route')
    scope.effect(() => register.register({
      path: USAGE_BACKFILL_STATUS_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (): Response => Response.json({ state, pollMs: options.pollMs }, { headers: { 'cache-control': 'no-store' } }),
    }), 'dsh-codex-connect: local usage status route')
  })

  const warmup: Fiber = ctx.inject(
    ['sessionQuery', 'sessionProjectionCache', 'sessionPersistence', 'sessions'],
    async (scope) => {
      const owned = watchUsageBackfill(scope, options, (next) => { state = next })
      trigger = owned.trigger
      stop = owned.stop
      return async () => { trigger = undefined; stop = undefined; await owned.stop() }
    },
  )

  return async () => {
    await Promise.all([projection, routes, warmup].map(async (fiber) => {
      const handle = fiber as { dispose?: () => unknown } | undefined
      await handle?.dispose?.()
    }))
  }
}