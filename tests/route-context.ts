/** Authenticated Host fixture using real Cordis generator-effect ownership. */
import { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach } from 'vitest'

export interface TestRoute {
  path: string
  handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void
}
const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

/** Registers the supplied HTTP sink and an explicit authenticated Host connection. */
export function routeContext(register: (route: TestRoute) => () => void): Context {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('webServer', { register })
  ctx.provide('connection', { requestRejection: () => undefined })
  return ctx
}
