import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { HttpRouteScope } from '../src/http-auth.ts'
import { registerOpenAICodexAuthRoutes } from '../src/auth-routes.ts'
import { registerOpenAICodexProxyRoutes } from '../src/proxy-routes.ts'
import { registerOpenAICodexModelCatalogRoute, registerOpenAICodexModelCatalogStatusRoutes } from '../src/model-routes.ts'
import { registerOpenAICodexQuotaRoute } from '../src/quota-routes.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'
import { OpenAICodexProxyManager } from '../src/provider-proxy.ts'
import type { TestRoute } from './route-context.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose(); vi.restoreAllMocks() })
function fixture() {
  const ctx = new Context(); contexts.push(ctx)
  const routes = new Map<string, TestRoute>()
  ctx.provide('webServer', { register: (route: TestRoute) => { routes.set(route.path, route); return () => { routes.delete(route.path) } } })
  return { ctx, routes }
}
function exchange(path = '/', method = 'GET') {
  const socket = new Socket()
  Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1' })
  const req = new IncomingMessage(socket)
  req.url = path; req.method = method; req.headers = { host: 'localhost:3080' }
  const res = new ServerResponse(req)
  return { req, res }
}

it.each([401, 403, 503] as const)('all private routes reject Host status %s before data reads or provider work', async status => {
  const { ctx, routes } = fixture()
  ctx.provide('connection', { requestRejection: () => { if (status === 503) throw new Error('service unloaded'); return status } })
  const store = new OpenAICodexCredentialStore('fixture-never-read-auth.json')
  const accounts = vi.spyOn(store, 'accounts')
  const capture = vi.spyOn(store, 'captureActiveAccount')
  const trust = new OpenAICodexTrustedOriginsStore('fixture-never-read-trust.json')
  const has = vi.spyOn(trust, 'has')
  const manager = new OpenAICodexProxyManager()
  const probe = vi.spyOn(manager, 'probe')
  const catalog = vi.fn(() => [])
  const keys = vi.fn(async () => [])
  const refresh = vi.fn(async () => {})
  registerOpenAICodexAuthRoutes(ctx, store, trust)
  registerOpenAICodexProxyRoutes(ctx, trust, manager)
  registerOpenAICodexModelCatalogRoute(ctx, catalog, trust, keys)
  registerOpenAICodexModelCatalogStatusRoutes(ctx, { status: () => ({ source: 'bundled', clientVersion: 'fixture', modelCount: 0, unavailableModels: [] }), refresh, accountKeys: keys }, trust)
  registerOpenAICodexQuotaRoute(ctx, { store, trustedOrigins: trust })
  expect(routes.size).toBe(13)
  for (const route of routes.values()) {
    const method = /login|logout|cancel|callback|refresh|detect|test$/u.test(route.path) ? 'POST' : 'GET'
    const { req, res } = exchange(route.path, method)
    await route.handler(req, res)
    expect(res.statusCode, route.path).toBe(status)
  }
  for (const read of [accounts, capture, has, probe, catalog, keys, refresh]) expect(read).not.toHaveBeenCalled()
  await manager.dispose()
})

it('cancels response-disconnected work and joins handler cleanup on disposal', async () => {
  const { ctx, routes } = fixture()
  const entered = Promise.withResolvers<void>()
  const cancelled = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let signal: AbortSignal | undefined
  ctx.effect(function* () {
    const scope = new HttpRouteScope(ctx)
    yield () => scope.dispose()
    yield scope.register({ kind: 'exact', path: '/pending', handler: async (_req, _res, value) => {
      signal = value; entered.resolve()
      await new Promise<void>(resolve => value.addEventListener('abort', () => { cancelled.resolve(); resolve() }, { once: true }))
      await release.promise
    } })
  })
  const { req, res } = exchange('/pending')
  const pending = routes.get('/pending')!.handler(req, res)
  await entered.promise
  res.emit('close')
  await cancelled.promise
  expect(signal?.aborted).toBe(true)
  let disposed = false
  const disposing = ctx.fiber.dispose().then(() => { disposed = true })
  try {
    await Promise.resolve()
    expect(disposed).toBe(false)
  } finally { release.resolve(); await pending; await disposing }
  expect(routes.size).toBe(0)
  expect(req.listenerCount('aborted')).toBe(0)
  expect(res.listenerCount('close')).toBe(0)
})

it.each(['auth', 'proxy', 'catalog'] as const)('rolls back partial %s registration using real generator effects', async kind => {
  const { ctx, routes } = fixture()
  const register = ctx.webServer.register.bind(ctx.webServer)
  let calls = 0
  vi.spyOn(ctx.webServer, 'register').mockImplementation(route => {
    if (++calls === 2) throw new Error('route collision')
    return register(route)
  })
  const trust = new OpenAICodexTrustedOriginsStore('fixture-never-read-trust.json')
  const store = new OpenAICodexCredentialStore('fixture-never-read-auth.json')
  const install = () => {
    if (kind === 'auth') registerOpenAICodexAuthRoutes(ctx, store, trust)
    else if (kind === 'proxy') registerOpenAICodexProxyRoutes(ctx, trust, new OpenAICodexProxyManager())
    else registerOpenAICodexModelCatalogStatusRoutes(ctx, { status: () => ({ source: 'bundled', clientVersion: 'fixture', modelCount: 0, unavailableModels: [] }), refresh: async () => {} }, trust)
  }
  expect(install).toThrow('route collision')
  expect(routes.size).toBe(0)
  await ctx.fiber.dispose()
  expect(routes.size).toBe(0)
})
