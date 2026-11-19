import { routeContext } from './route-context.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  OPENAI_CODEX_MODEL_CATALOG_PATH,
  OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH,
  OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH,
} from '../src/model-contract.ts'
import type { OpenAICodexModelCatalogEntry, OpenAICodexModelCatalogStatus } from '../src/model-contract.ts'
import { registerOpenAICodexModelCatalogRoute, registerOpenAICodexModelCatalogStatusRoutes } from '../src/model-routes.ts'
import type { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'

interface CapturedRoute {
  path: string
  handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void
}

function capture(
  resolveCatalog: (accountKey?: string) => readonly OpenAICodexModelCatalogEntry[],
  accountKeys?: () => readonly string[],
  trust: () => Promise<boolean> = async () => false,
): CapturedRoute {
  let captured: CapturedRoute | undefined
  const ctx = routeContext((route) => {
    captured = route
    return () => undefined
  })
  registerOpenAICodexModelCatalogRoute(
    ctx,
    resolveCatalog,
    { has: trust } as unknown as OpenAICodexTrustedOriginsStore,
    accountKeys,
  )
  if (captured === undefined) throw new Error('model catalog route was not registered')
  return captured
}

function request(method = 'GET', remoteAddress = '127.0.0.1', url = '/'): IncomingMessage {
  return {
    once() { return this }, off() { return this }, destroy() { return this },
    method,
    url,
    socket: { remoteAddress },
    headers: { host: '127.0.0.1:3081' },
  } as unknown as IncomingMessage
}

function response(): ServerResponse & { observed: { status?: number; body?: string } } {
  const observed: { status?: number; body?: string } = {}
  return {
    once() { return this }, off() { return this }, destroy() { return this },
    observed,
    writeHead(status: number) {
      observed.status = status
      return this
    },
    end(body?: string) {
      if (body !== undefined) observed.body = body
      return this
    },
  } as unknown as ServerResponse & { observed: { status?: number; body?: string } }
}

describe('Codex Connect model catalog route', () => {
  it('serves the detached provider catalog to a trusted loopback GET', async () => {
    const catalog: OpenAICodexModelCatalogEntry[] = [{ id: 'gpt-test', name: 'GPT Test', contextWindow: 128_000, maxTokens: 128_000, maxContextWindow: 128_000, contextLimitSource: 'catalog-default' }]
    const resolveCatalog = vi.fn(() => catalog)
    const res = response()

    await capture(resolveCatalog).handler(request(), res)

    expect(res.observed.status).toBe(200)
    expect(JSON.parse(res.observed.body ?? 'null')).toEqual(catalog)
    expect(resolveCatalog).toHaveBeenCalledOnce()
  })

  it('rejects mutations and untrusted peers before reading the catalog', async () => {
    const resolveCatalog = vi.fn(() => [])
    const route = capture(resolveCatalog)
    const mutation = response()
    await route.handler(request('POST'), mutation)
    expect(mutation.observed.status).toBe(405)

    const remote = response()
    await route.handler(request('GET', '192.168.1.9'), remote)
    expect(remote.observed.status).toBe(403)
    expect(resolveCatalog).not.toHaveBeenCalled()
  })
})

describe('account-scoped model previews', () => {
  it('keeps explicit account catalogs separate and preserves the default reader', async () => {
    const entry: OpenAICodexModelCatalogEntry = { id: 'gpt-test', name: 'GPT Test', contextWindow: 128_000, maxTokens: 128_000, maxContextWindow: 128_000, contextLimitSource: 'catalog-default' }
    const resolveCatalog = vi.fn((key?: string) => [{ ...entry, name: key ?? 'active', available: key !== 'account-b' }])
    const route = capture(resolveCatalog, () => ['account-a', 'account-b'])
    for (const key of ['account-a', 'account-b', undefined]) {
      const res = response()
      await route.handler(request('GET', '127.0.0.1', key === undefined ? '/' : '/?accountKey=' + encodeURIComponent(key)), res)
      expect(res.observed.status).toBe(200)
      expect(JSON.parse(res.observed.body ?? 'null')).toEqual([{ ...entry, name: key ?? 'active', available: key !== 'account-b' }])
      expect(resolveCatalog).toHaveBeenLastCalledWith(key)
    }
  })

  it.each(['accountKey=', 'accountKey=removed', 'accountKey=account-a&accountKey=account-a', 'accountKey=account-a&accountKey=account-b'])(
    'rejects invalid catalog query %s before reading', async query => {
      const resolveCatalog = vi.fn(() => [])
      const res = response()
      await capture(resolveCatalog, () => ['account-a', 'account-b']).handler(request('GET', '127.0.0.1', '/?' + query), res)
      expect(res.observed.status).toBe(404)
      expect(resolveCatalog).not.toHaveBeenCalled()
    },
  )

  it('rejects an explicit query when the legacy registrar supplies no account keys', async () => {
    const resolveCatalog = vi.fn(() => [])
    const res = response()
    await capture(resolveCatalog).handler(request('GET', '127.0.0.1', '/?accountKey=account-a'), res)
    expect(res.observed.status).toBe(404)
    expect(resolveCatalog).not.toHaveBeenCalled()
  })

  it('checks account membership after an asynchronous trust decision settles', async () => {
    const trust = Promise.withResolvers<boolean>()
    const entered = Promise.withResolvers<void>()
    const resolveCatalog = vi.fn(() => [])
    let keys = ['account-a']
    const route = capture(resolveCatalog, () => keys, () => { entered.resolve(); return trust.promise })
    const res = response()
    const pending = route.handler(request('GET', '192.168.1.9', '/?accountKey=account-a'), res)
    await entered.promise
    keys = []
    trust.resolve(true)
    await pending
    expect(res.observed.status).toBe(404)
    expect(resolveCatalog).not.toHaveBeenCalled()
  })

  it.each([true, false])('rejects untrusted catalog access before account lookup (known=%s)', async known => {
    const keys = vi.fn(() => known ? ['account-a'] : [])
    const resolveCatalog = vi.fn(() => [])
    const res = response()
    await capture(resolveCatalog, keys).handler(request('GET', '192.168.1.9', '/?accountKey=account-a'), res)
    expect(res.observed.status).toBe(403)
    expect(keys).not.toHaveBeenCalled()
    expect(resolveCatalog).not.toHaveBeenCalled()
  })

  it('reads account-specific status without refreshing and keeps the legacy default', async () => {
    const status = vi.fn((key?: string) => ({ ...catalogStatus, modelCount: key === 'account-a' ? 1 : key === 'account-b' ? 2 : 3 }))
    const refresh = vi.fn(async () => undefined)
    const routes = captureStatusRoutes({ status, refresh, accountKeys: () => ['account-a', 'account-b'] })
    const route = routes.find(item => item.path === OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH)!
    for (const [key, count] of [['account-a', 1], ['account-b', 2], [undefined, 3]] as const) {
      const res = response()
      await route.handler(request('GET', '127.0.0.1', key === undefined ? '/' : '/?accountKey=' + key), res)
      expect(res.observed.status).toBe(200)
      expect(JSON.parse(res.observed.body ?? 'null')).toEqual({ ...catalogStatus, modelCount: count })
      expect(status).toHaveBeenLastCalledWith(key)
    }
    expect(refresh).not.toHaveBeenCalled()
  })

  it.each(['accountKey=', 'accountKey=removed', 'accountKey=account-a&accountKey=account-a', 'accountKey=account-a&accountKey=account-b'])(
    'rejects invalid status and refresh query %s before reads or refresh', async query => {
      const status = vi.fn(() => catalogStatus)
      const refresh = vi.fn(async () => undefined)
      const routes = captureStatusRoutes({ status, refresh, accountKeys: () => ['account-a', 'account-b'] })
      for (const route of routes) {
        const res = response()
        await route.handler(request(route.path === OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH ? 'GET' : 'POST', '127.0.0.1', '/?' + query), res)
        expect(res.observed.status).toBe(404)
      }
      expect(status).not.toHaveBeenCalled()
      expect(refresh).not.toHaveBeenCalled()
    },
  )

  it('refuses a removed account after an in-flight refresh before reading status', async () => {
    const entered = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    let keys = ['account-a']
    const status = vi.fn(() => catalogStatus)
    const refresh = vi.fn(() => { entered.resolve(); return finish.promise })
    const routes = captureStatusRoutes({ status, refresh, accountKeys: () => keys })
    const route = routes.find(item => item.path === OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH)!
    const res = response()
    const pending = route.handler(request('POST', '127.0.0.1', '/?accountKey=account-a'), res)
    try {
      await entered.promise
      keys = []
    } finally {
      finish.resolve()
      await pending
    }
    expect(res.observed.status).toBe(404)
    expect(status).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('rejects both untrusted status routes before account lookup or data access', async () => {
    const status = vi.fn(() => catalogStatus)
    const refresh = vi.fn(async () => undefined)
    const keys = vi.fn(() => ['account-a'])
    const routes = captureStatusRoutes({ status, refresh, accountKeys: keys }, false)
    for (const route of routes) {
      const res = response()
      await route.handler(request(route.path === OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH ? 'GET' : 'POST', '192.168.1.9', '/?accountKey=account-a'), res)
      expect(res.observed.status).toBe(403)
    }
    expect(keys).not.toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})

const catalogStatus: OpenAICodexModelCatalogStatus = {
  source: 'cache',
  updatedAt: 1_700_000_000_000,
  clientVersion: '0.155.0',
  modelCount: 7,
  unavailableModels: ['gpt-reserve'],
}

function captureStatusRoutes(options: {
  status: (accountKey?: string) => OpenAICodexModelCatalogStatus
  accountKeys?: () => readonly string[]
  refresh: () => Promise<void>
}, trusted = true): CapturedRoute[] {
  const routes: CapturedRoute[] = []
  const ctx = routeContext((route) => {
    routes.push(route)
    return () => undefined
  })
  registerOpenAICodexModelCatalogStatusRoutes(
    ctx,
    options,
    { has: async () => trusted } as unknown as OpenAICodexTrustedOriginsStore,
  )
  return routes
}

describe('Codex Connect model catalog status routes', () => {
  it('serves provenance to a trusted GET and returns the refreshed status from POST', async () => {
    const refresh = vi.fn(async () => undefined)
    const routes = captureStatusRoutes({ status: () => catalogStatus, refresh })
    const statusRoute = routes.find(route => route.path === OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH)!
    const refreshRoute = routes.find(route => route.path === OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH)!

    const status = response()
    await statusRoute.handler(request(), status)
    expect(status.observed.status).toBe(200)
    expect(JSON.parse(status.observed.body ?? 'null')).toEqual(catalogStatus)

    const refreshed = response()
    await refreshRoute.handler(request('POST'), refreshed)
    expect(refresh).toHaveBeenCalledOnce()
    expect(refreshed.observed.status).toBe(200)
    expect(JSON.parse(refreshed.observed.body ?? 'null')).toEqual(catalogStatus)
  })

  it('rejects wrong methods and untrusted peers before reading or refreshing', async () => {
    const refresh = vi.fn(async () => undefined)
    const routes = captureStatusRoutes({ status: () => catalogStatus, refresh })
    const statusRoute = routes.find(route => route.path === OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH)!
    const refreshRoute = routes.find(route => route.path === OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH)!

    const statusWrongMethod = response()
    await statusRoute.handler(request('POST'), statusWrongMethod)
    expect(statusWrongMethod.observed.status).toBe(405)
    const wrongMethod = response()
    await refreshRoute.handler(request('GET'), wrongMethod)
    expect(wrongMethod.observed.status).toBe(405)

    const untrusted = captureStatusRoutes({ status: () => catalogStatus, refresh }, false)
    const blocked = response()
    await untrusted.find(route => route.path === OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH)!.handler(request('POST', '192.168.1.9'), blocked)
    expect(blocked.observed.status).toBe(403)
    expect(refresh).not.toHaveBeenCalled()
  })
})
