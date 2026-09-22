import type { Context } from '@deepseek-ai/cordis'
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

function capture(resolveCatalog: () => readonly OpenAICodexModelCatalogEntry[]): CapturedRoute {
  let captured: CapturedRoute | undefined
  const ctx = {
    webServer: {
      register(route: CapturedRoute) {
        captured = route
        return () => undefined
      },
    },
    effect(factory: () => void | (() => void | Promise<void>)) {
      return factory()
    },
  } as unknown as Context
  registerOpenAICodexModelCatalogRoute(
    ctx,
    resolveCatalog,
    { has: async () => false } as unknown as OpenAICodexTrustedOriginsStore,
  )
  if (captured === undefined) throw new Error('model catalog route was not registered')
  return captured
}

function request(method = 'GET', remoteAddress = '127.0.0.1'): IncomingMessage {
  return {
    method,
    socket: { remoteAddress },
    headers: { host: '127.0.0.1:3081' },
  } as unknown as IncomingMessage
}

function response(): ServerResponse & { observed: { status?: number; body?: string } } {
  const observed: { status?: number; body?: string } = {}
  return {
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

const catalogStatus: OpenAICodexModelCatalogStatus = {
  source: 'cache',
  updatedAt: 1_700_000_000_000,
  clientVersion: '0.155.0',
  modelCount: 7,
  unavailableModels: ['gpt-reserve'],
}

function captureStatusRoutes(options: {
  status: () => OpenAICodexModelCatalogStatus
  refresh: () => Promise<void>
}, trusted = true): CapturedRoute[] {
  const routes: CapturedRoute[] = []
  const ctx = {
    webServer: {
      register(route: CapturedRoute) {
        routes.push(route)
        return () => undefined
      },
    },
    effect(factory: () => void | (() => void | Promise<void>)) {
      return factory()
    },
  } as unknown as Context
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
