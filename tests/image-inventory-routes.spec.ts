import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerImageInventoryRoute } from '../src/image-inventory-routes.ts'
import { decodeImageInventory, IMAGE_INVENTORY_PATH } from '../src/image-input-contract.ts'
import { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'

interface Route { path: string; handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void }
const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
  vi.restoreAllMocks()
})
async function setup(auth: number | undefined = undefined) {
  const root = await mkdtemp(join(tmpdir(), 'codex-image-inventory-')); roots.push(root)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(Sessions)
  let route: Route | undefined
  const dispose = vi.fn()
  ctx.provide('connection', { requestRejection: () => auth } as never)
  ctx.provide('webServer', { register(value: Route) { route = value; return dispose } } as never)
  const trusted = new OpenAICodexTrustedOriginsStore(join(root, 'trust.json'))
  await ctx.plugin(scope => { registerImageInventoryRoute(scope, trusted) })
  if (route === undefined) throw new Error('inventory route missing')
  return { ctx, route, dispose }
}
async function request(route: Route, query: string, method = 'GET', origin?: string) {
  const socket = new Socket()
  Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1' })
  const req = new IncomingMessage(socket)
  req.method = method; req.url = IMAGE_INVENTORY_PATH + query
  req.headers = { host: '127.0.0.1:3081', ...(origin === undefined ? {} : { origin }) }
  const res = new ServerResponse(req)
  const head = vi.spyOn(res, 'writeHead')
  let body = ''
  vi.spyOn(res, 'end').mockImplementation((value?: unknown) => { body = String(value ?? ''); return res })
  try { await route.handler(req, res); return { status: res.statusCode, value: JSON.parse(body), headers: head.mock.calls[0]?.[1] } }
  finally { socket.destroy() }
}
describe('authenticated session image inventory', () => {
  it.each([401, 403])('denies host authentication %s before reading any session', async status => {
    const { ctx, route } = await setup(status)
    const read = vi.spyOn(ctx.sessions, 'get')
    expect((await request(route, '?sessionId=owner')).status).toBe(status)
    expect(read).not.toHaveBeenCalled()
  })
  it('fails closed when the current connection is removed', async () => {
    const { ctx, route } = await setup()
    vi.spyOn(ctx, 'get').mockReturnValue(undefined)
    expect((await request(route, '?sessionId=owner')).status).toBe(503)
  })
  it('rejects cross-origin requests before session access', async () => {
    const { ctx, route } = await setup()
    const read = vi.spyOn(ctx.sessions, 'get')
    expect((await request(route, '?sessionId=owner', 'GET', 'https://untrusted.invalid')).status).toBe(403)
    expect(read).not.toHaveBeenCalled()
  })
  it.each(['', '?sessionId=', '?sessionId=a&sessionId=b', '?sessionId=' + 'a'.repeat(513), '?sessionId=owner&path=private'])('rejects malformed query %s', async query => {
    const { ctx, route } = await setup()
    const read = vi.spyOn(ctx.sessions, 'get')
    expect((await request(route, query)).status).toBe(400)
    expect(read).not.toHaveBeenCalled()
  })
  it('returns only recorded image occurrences from the selected session and unregisters on disposal', async () => {
    const { ctx, route, dispose } = await setup()
    const session = ctx.sessions.create(SessionId('owner'))
    const foreign = ctx.sessions.create(SessionId('foreign'))
    const image = { attachmentId: AttachmentId('sha256:recorded'), mediaType: 'image/png' as const, width: 10, height: 20, bytes: 100, name: 'same.png' }
    session.append('user/message', createUserMessage({ content: [{ type: 'image', attachment: image }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    foreign.append('user/message', createUserMessage({ content: [{ type: 'image', attachment: { ...image, attachmentId: AttachmentId('sha256:foreign') } }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    const result = await request(route, '?sessionId=owner')
    expect(result.status).toBe(200)
    expect(decodeImageInventory(result.value)).toEqual([{ input: { attachment: image }, source: 'attachment', name: 'same.png', width: 10, height: 20 }])
    expect(JSON.stringify(result.value)).not.toContain('sha256:foreign')
    expect(result.headers).toMatchObject({ 'cache-control': 'private, no-store' })
    expect((await request(route, '?sessionId=missing')).status).toBe(404)
    expect((await request(route, '?sessionId=owner', 'POST')).status).toBe(405)
    await ctx.fiber.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
