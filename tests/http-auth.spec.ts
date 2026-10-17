import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { harnessHttpRejection } from '../src/http-auth.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
function context(): Context { const ctx = new Context(); contexts.push(ctx); return ctx }
function request(): IncomingMessage { return new IncomingMessage(new Socket()) }

it('fails closed while the Host connection is unavailable', () => {
  expect(harnessHttpRejection(context(), request())).toEqual({ status: 503, error: 'DSH_CONNECTION_UNAVAILABLE' })
})
it.each([401, 403] as const)('preserves Host rejection %s', status => {
  const ctx = context()
  const reject = vi.fn(() => status)
  ctx.provide('connection', { requestRejection: reject })
  const req = request()
  expect(harnessHttpRejection(ctx, req)).toEqual({ status, error: status === 401 ? 'DSH_BROWSER_AUTH_REQUIRED' : 'forbidden' })
  expect(reject).toHaveBeenCalledWith(req)
})
it('reads the current Host policy on every request and fails closed on authentication errors', () => {
  const ctx = context()
  const reject = vi.fn<() => 401 | 403 | undefined>(() => undefined)
  ctx.provide('connection', { requestRejection: reject })
  expect(harnessHttpRejection(ctx, request())).toBeUndefined()
  reject.mockReturnValue(401)
  expect(harnessHttpRejection(ctx, request())?.status).toBe(401)
  reject.mockImplementation(() => { throw new Error('connection is unloading') })
  expect(harnessHttpRejection(ctx, request())?.status).toBe(503)
})
