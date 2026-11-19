import { createServer, request } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { afterEach, expect, it, vi } from 'vitest'
import { pathToFileURL } from 'node:url'
const builtEntry = process.env['CODEX_TEST_BUILT_ENTRY']
const Codex: typeof import('../src/index.ts') = builtEntry ? await import(/* @vite-ignore */ pathToFileURL(builtEntry).href) : await import('../src/index.ts')
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { OpenAICodexAccountRouteRegistry } from '../src/account-routes.ts'
import { decodeOpenAICodexModelCatalog, OPENAI_CODEX_MODEL_CATALOG_PATH, OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH, OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH } from '../src/model-contract.ts'
import { OPENAI_CODEX_AUTH_ACCOUNTS_PATH } from '../src/auth-paths.ts'
import { OPENAI_CODEX_QUOTA_PATH } from '../src/quota-contract.ts'
import { OPENAI_CODEX_USAGE_URL } from '../src/usage.ts'
import type { TestRoute } from './route-context.ts'
import { loadSettingsPlugin } from './support/settings-loader-fixture.ts'

const disposers: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const dispose of disposers.reverse()) await dispose()
  disposers.length = 0
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals()
})

it('loads real account registry and index wiring into authenticated HTTP previews, including the keyless primary route', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-loader-http-'))
  disposers.push(() => rm(root, { recursive: true, force: true }))
  vi.stubEnv('DSH_HOME', root)
  // No provider request reaches the network; all credentials and caches belong to this test.
  const quotaAccounts: string[] = []
  const upstream = vi.fn<typeof fetch>(async (input, init) => {
    if (String(input) === OPENAI_CODEX_USAGE_URL) {
      const accountId = new Headers(init?.headers).get('chatgpt-account-id') ?? ''
      quotaAccounts.push(accountId)
      return Response.json({rate_limit:{primary_window:{used_percent:accountId==='first'?59:8,limit_window_seconds:18_000}}})
    }
    return Response.json({ models: [{ slug: 'gpt-5.6-sol', display_name: 'Fixture model', context_window: 272000, max_context_window: 872000 }] })
  })
  vi.stubGlobal('fetch', upstream)
  const store = new OpenAICodexCredentialStore()
  for (const accountId of ['first', 'second']) await store.modify(Codex.OPENAI_CODEX_PROVIDER, async () => ({
    type: 'oauth', access: 'fixture-access-' + accountId, refresh: 'fixture-refresh-' + accountId, accountId, expires: Date.now() + 3_600_000,
  }))
  const summaries = await store.accounts()
  const primary = summaries.find(account => account.active)!
  const secondary = summaries.find(account => !account.active)!
  const bindings = new OpenAICodexAccountRouteRegistry().reconcile(summaries)
  expect(bindings.find(route => route.routeId === Codex.OPENAI_CODEX_PROVIDER)).not.toHaveProperty('accountKey')
  expect(bindings.flatMap(route => route.accountKey === undefined ? [] : [route.accountKey])).not.toContain(primary.accountKey)

  const routes = new Map<string, TestRoute>()
  const server = createServer((req, res) => {
    const route = routes.get(new URL(req.url ?? '/', 'http://localhost').pathname)
    if (!route) { res.writeHead(404); res.end(); return }
    void Promise.resolve(route.handler(req, res)).catch(() => { res.writeHead(500); res.end() })
  })
  disposers.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected allocated TCP address')
  const http = (path: string, method = 'GET', headers: IncomingHttpHeaders = { cookie: 'fixture-auth=1' }): Promise<{ status: number; value: unknown }> => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: address.port, path, method, headers }, res => {
      let text = ''
      res.setEncoding('utf8'); res.on('data', chunk => { text += chunk }); res.on('error', reject)
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, value: text ? JSON.parse(text) : undefined }) })
    })
    req.on('error', reject); req.end()
  })
  const ctx = new Context()
  disposers.push(() => ctx.fiber.dispose())
  ctx.provide('webServer', { register: (route: TestRoute) => {
    if (routes.has(route.path)) throw new Error('Duplicate route: ' + route.path)
    routes.set(route.path, route); return () => { routes.delete(route.path) }
  } })
  let allowed = true
  const rejection = vi.fn((req: import('node:http').IncomingMessage) => allowed && req.headers.cookie === 'fixture-auth=1' ? undefined : 401)
  ctx.provide('connection', { requestRejection: rejection })
  await ctx.plugin(LlmRuntime)
  const formerRecords = join(root, 'former-request-records')
  await mkdir(formerRecords)
  await writeFile(join(formerRecords, 'retained.jsonl'), 'existing local record\n')
  const { entry } = await loadSettingsPlugin(ctx, root, 'dsh-codex-connect', Codex, {
    requestMetricsDirectory: formerRecords, requestMetricsMaxBytes: 4096,
  })
  await vi.waitFor(() => expect(routes.has(OPENAI_CODEX_MODEL_CATALOG_PATH)).toBe(true))
  for (const method of ['GET', 'DELETE']) expect((await http('/plugins/dsh-codex-connect/requests', method)).status).toBe(404)
  expect(Codex.resolveOpenAICodexSettings({})).not.toHaveProperty('requestMetricsDirectory')
  expect(Codex.resolveOpenAICodexSettings({})).not.toHaveProperty('requestMetricsMaxBytes')
  const before = await readFile(store.filename, 'utf8')
  const secondaryQuota = await http(OPENAI_CODEX_QUOTA_PATH)
  expect(secondaryQuota.status).toBe(200)
  expect(secondaryQuota.value).toMatchObject({accounts:[{accountKey:secondary.accountKey,usage:{rateLimits:[{windows:[{remainingPercent:41}]}]}}]})
  expect(quotaAccounts).toEqual(['first'])
  expect((await store.accounts()).find(a=>a.active)?.accountKey).toBe(primary.accountKey)
  for (const key of [undefined, primary.accountKey, secondary.accountKey]) {
    const query = key === undefined ? '' : '?accountKey=' + encodeURIComponent(key)
    const catalog = await http(OPENAI_CODEX_MODEL_CATALOG_PATH + query)
    expect(catalog.status).toBe(200)
    expect(decodeOpenAICodexModelCatalog(catalog.value)?.length).toBeGreaterThan(0)
    expect((await http(OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH + query)).status).toBe(200)
  }
  expect(await readFile(store.filename, 'utf8')).toBe(before)
  for (const path of [OPENAI_CODEX_MODEL_CATALOG_PATH, OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH, OPENAI_CODEX_AUTH_ACCOUNTS_PATH, OPENAI_CODEX_QUOTA_PATH]) {
    expect((await http(path, 'GET', {})).status).toBe(401)
    expect((await http(path, 'GET', { cookie: 'fixture-auth=1', origin: 'https://attacker.invalid' })).status).toBe(403)
  }
  allowed = false
  expect((await http(OPENAI_CODEX_MODEL_CATALOG_PATH)).status).toBe(401)
  allowed = true
  // Explicit user selection, not automatic switching: both account previews remain addressable.
  await store.activate(secondary.accountKey)
  for (const key of [primary.accountKey, secondary.accountKey]) expect((await http(OPENAI_CODEX_MODEL_CATALOG_PATH + '?accountKey=' + key)).status).toBe(200)
  await store.removeAccount(primary.accountKey)
  for (const [path, method] of [[OPENAI_CODEX_MODEL_CATALOG_PATH, 'GET'], [OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH, 'GET'], [OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH, 'POST']]) {
    expect((await http(path + '?accountKey=' + primary.accountKey, method)).status).toBe(404)
  }
  expect(await readdir(formerRecords)).toEqual(['retained.jsonl'])
  expect(await readFile(join(formerRecords, 'retained.jsonl'), 'utf8')).toBe('existing local record\n')
  await entry.fiber!.dispose()
  expect(routes.size).toBe(0)
  expect((await http(OPENAI_CODEX_MODEL_CATALOG_PATH)).status).toBe(404)
  expect(rejection).toHaveBeenCalled()
})
