import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { ConversationSpeedRegistry } from '../src/speed-mode-registry.ts'
import { OPENAI_CODEX_SPEED_MODE_PATH } from '../src/speed-mode-contract.ts'
import { registerOpenAICodexSpeedModeRoutes } from '../src/speed-mode-routes.ts'
import { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose(); vi.restoreAllMocks() })
async function fixture() {
  const ctx = new Context(); contexts.push(ctx)
  const routes = new Map<string, { handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }>()
  ctx.provide('webServer', { register: (route: { path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }) => {
    routes.set(route.path, route); return () => { routes.delete(route.path) }
  } })
  let rejection: 401 | 403 | undefined
  ctx.provide('connection', { requestRejection: () => rejection })
  const registry = new ConversationSpeedRegistry()
  const resolve = vi.fn(async (provider: string, _signal: AbortSignal): Promise<string | undefined> => {
    if (provider !== 'openai-codex' && provider !== 'openai-codex-16') throw new TypeError('unknown route')
    return 'acct_' + (provider === 'openai-codex' ? 'a' : 'b').repeat(43)
  })
  const origins = new OpenAICodexTrustedOriginsStore()
  vi.spyOn(origins, 'has').mockResolvedValue(false)
  registerOpenAICodexSpeedModeRoutes(ctx, { registry, trustedOrigins: origins, resolveRouteAccountKey: resolve })
  const call = async (method = 'GET', value?: unknown, query = '?sessionId=session&provider=openai-codex-16&model=gpt-6.1-sol', headers: Record<string, string> = {}) => {
    const socket = new Socket(); Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1' })
    const req = new IncomingMessage(socket)
    req.method = method; req.url = OPENAI_CODEX_SPEED_MODE_PATH + query
    req.headers = { host: '127.0.0.1:3080', 'content-type': 'application/json', ...headers }
    req.push(value === undefined ? null : typeof value === 'string' ? value : JSON.stringify(value)); if (value !== undefined) req.push(null)
    req.complete = true
    const res = new ServerResponse(req), end = vi.spyOn(res, 'end')
    try {
      await routes.get(OPENAI_CODEX_SPEED_MODE_PATH)!.handler(req, res)
      const text = end.mock.calls[0]?.[0]
      return { status: res.statusCode, value: text === undefined ? undefined : JSON.parse(String(text)) as Record<string, unknown> }
    } finally { req.destroy(); res.destroy(); socket.destroy() }
  }
  return { ctx, registry, routes, resolve, call, reject: (code: 401 | 403) => { rejection = code } }
}
it('derives the selected route account and rejects duplicate or stale POST replay', async () => {
  const f = await fixture(), before = await f.call()
  expect(before.value).toMatchObject({ provider: 'openai-codex-16', mode: 'standard', eligibility: 'unknown' })
  const command = { sessionId: 'session', provider: 'openai-codex-16', model: 'gpt-6.1-sol', generation: before.value!.generation, revision: before.value!.revision, mode: 'ultrafast' }
  expect((await f.call('POST', command)).value).toMatchObject({ mode: 'ultrafast', eligibility: 'unknown' })
  expect((await f.call('POST', command)).status).toBe(409)
  const other = await f.call('GET', undefined, '?sessionId=session&provider=openai-codex&model=gpt-6.1-sol')
  expect(other.value).toMatchObject({ mode: 'ultrafast', selectionExpired: true })
  expect((await f.call('POST', command)).status).toBe(409)
  expect(f.resolve.mock.calls.map(args => args[0])).toContain('openai-codex-16')
})
it('rejects Host authentication and foreign origin before account access', async () => {
  const f = await fixture(); f.reject(401)
  expect((await f.call()).status).toBe(401); expect(f.resolve).not.toHaveBeenCalled()
  const g = await fixture()
  expect((await g.call('POST', {}, '', { origin: 'https://untrusted.invalid' })).status).toBe(403)
  expect(g.resolve).not.toHaveBeenCalled()
})
it('validates exact query/body fields and bounded UTF-8 bytes before account access', async () => {
  const f = await fixture()
  expect((await f.call('GET', undefined, '?sessionId=session&provider=openai-codex-16&provider=openai-codex&model=gpt-6.1-sol')).status).toBe(400)
  expect((await f.call('POST', { sessionId: 'session', provider: 'openai-codex-16', model: 'gpt-6.1-sol', generation: 'x', revision: 0, mode: 'ultrafast', accountKey: 'spoof' })).status).toBe(400)
  expect((await f.call('POST', 'x'.repeat(4097))).status).toBe(413)
  expect((await f.call('POST', '中'.repeat(1366))).status).toBe(413)
  expect((await f.call('POST', '{}', '', { 'content-type': 'text/plain' })).status).toBe(415)
  expect(f.resolve).not.toHaveBeenCalled()
})
it('removes registered routes and clears no session choice merely because a view disconnects', async () => {
  const f = await fixture(), before = await f.call()
  await f.call('POST', { sessionId: 'session', provider: 'openai-codex-16', model: 'gpt-6.1-sol', generation: before.value!.generation, revision: before.value!.revision, mode: 'ultrafast' })
  expect(f.registry.captureSpeed('session').mode).toBe('ultrafast')
  await f.ctx.fiber.dispose()
  expect(f.routes.size).toBe(0)
})
