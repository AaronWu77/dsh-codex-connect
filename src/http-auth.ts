/** Host-owned authentication for plugin HTTP routes; origin trust is an additional restriction. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'

export interface HarnessHttpRejection {
  status: 401 | 403 | 503
  error: 'DSH_BROWSER_AUTH_REQUIRED' | 'forbidden' | 'DSH_CONNECTION_UNAVAILABLE'
}

/** Resolve the current Connection on each request; never retain a stale authentication service. */
export function harnessHttpRejection(ctx: Context, request: IncomingMessage): HarnessHttpRejection | undefined {
  try {
    const connection = ctx.get('connection')
    if (connection !== undefined) {
      const rejected = connection.requestRejection(request)
      if (rejected === undefined) return undefined
      if (rejected === 401 || rejected === 403) {
        return { status: rejected, error: rejected === 401 ? 'DSH_BROWSER_AUTH_REQUIRED' : 'forbidden' }
      }
    }
  } catch (_error) {
    // Inactive dependencies and authentication failures must not become an unauthenticated fallback.
  }
  return { status: 503, error: 'DSH_CONNECTION_UNAVAILABLE' }
}

/** Owns exact-route requests until both transport and handler work have settled. */
export class HttpRouteScope {
  private stopped = false
  private readonly pending = new Map<AbortController, Promise<void>>()
  constructor(private readonly ctx: Context) {}

  /** Register one route; yield the returned remover before disposing this owner. */
  register(route: { kind: 'exact'; path: string; handler(req: IncomingMessage, res: ServerResponse, signal: AbortSignal): void | Promise<void> }): () => void {
    return this.ctx.webServer.register({ ...route, handler: (req, res) => {
      if (this.stopped) { res.writeHead(503); res.end(); return }
      const controller = new AbortController()
      const cancel = (): void => { if (!res.writableEnded) controller.abort() }
      const close = (): void => { res.destroy() }
      req.once('aborted', cancel)
      res.once('close', cancel)
      controller.signal.addEventListener('abort', close, { once: true })
      const operation = Promise.resolve().then(async () => {
        if (!controller.signal.aborted) await route.handler(req, res, controller.signal)
      }).finally(() => {
        req.off('aborted', cancel)
        res.off('close', cancel)
        controller.signal.removeEventListener('abort', close)
        this.pending.delete(controller)
      })
      this.pending.set(controller, operation)
      return operation
    } })
  }

  /** Stop admission and abort all handlers before joining dependent owners. */
  abort(): void {
    this.stopped = true
    for (const controller of this.pending.keys()) controller.abort()
  }

  /** Abort owned requests and wait for their handlers to release resources. */
  async dispose(): Promise<void> {
    this.abort()
    await Promise.allSettled(this.pending.values())
  }
}
