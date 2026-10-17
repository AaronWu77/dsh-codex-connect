// @vitest-environment jsdom
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { routeContext } from './route-context.ts'
import { Socket } from 'node:net'
import { IncomingMessage, ServerResponse } from 'node:http'
import { expect, it, vi } from 'vitest'
import { OpenAICodexAccountStore } from '../src/client/account-store.ts'
import { registerOpenAICodexAuthRoutes } from '../src/auth-routes.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'

it.each(['switch', 'login-commit'])('keeps cancel quota and labels together after another view performs %s', async transition => {
  const root = await mkdtemp(join(tmpdir(), 'codex-cancel-snapshot-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const disposers: Array<() => void | Promise<void>> = []
  const views = [new OpenAICodexAccountStore(), new OpenAICodexAccountStore()]
  const makeCredential = (id: string) => ({ type: 'oauth' as const, accountId: id, access: `fixture-${id}`, refresh: `fixture-refresh-${id}`, expires: Date.now() + 3_600_000 })
  try {
    for (const id of ['b', 'a']) await store.modify(OPENAI_CODEX_PROVIDER, async () => makeCredential(id))
    const routes: Array<{ path: string; handler(req: IncomingMessage, res: ServerResponse): void | Promise<void> }> = []
    const context = routeContext(route => {routes.push(route);return () => {routes.splice(routes.indexOf(route),1)}})
    disposers.push(() => context.fiber.dispose())
    registerOpenAICodexAuthRoutes(context, store)
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      const route = routes.find(candidate => candidate.path === String(path))
      if (route === undefined) {
        const account = new Headers(init?.headers).get('chatgpt-account-id')
        return Response.json({ rate_limit: { primary_window: { used_percent: account === 'a' ? 17 : 73, limit_window_seconds: 18_000 } } })
      }
      let code = 200
      let body = ''
      const socket = new Socket(); Object.defineProperty(socket,'remoteAddress',{value:'127.0.0.1'})
      const request = new IncomingMessage(socket); request.method=init?.method??'GET'; request.headers={host:'127.0.0.1:3081'}
      const response = new ServerResponse(request)
      vi.spyOn(response,'writeHead').mockImplementation(status=>{code=status;return response})
      vi.spyOn(response,'end').mockImplementation(value=>{body=String(value);return response})
      await route.handler(request, response)
      return new Response(body, { status: code })
    })
    const [first, second] = views as [OpenAICodexAccountStore, OpenAICodexAccountStore]
    first.subscribe(() => {})
    await vi.waitFor(() => expect(first.getSnapshot().status.status).toBe('signed-in'))
    const oldKey = first.getSnapshot().accounts.find(account => account.active)!.accountKey
    if (transition === 'switch') {
      await store.activate((await store.accounts()).find(account => !account.active)!.accountKey)
    } else await store.modify(OPENAI_CODEX_PROVIDER, async () => makeCredential('c'))
    second.subscribe(() => {})
    await vi.waitFor(() => expect(second.getSnapshot().status.status).toBe('signed-in'))
    const expected = second.getSnapshot()
    expect(expected.accounts.find(account => account.active)?.accountKey).not.toBe(oldKey)
    await first.cancel()
    expect(first.getSnapshot().status).toEqual(expected.status)
    expect(first.getSnapshot().accounts).toEqual(expected.accounts)
  } finally {
    for (const view of views) view.dispose()
    for (const dispose of disposers) await dispose()
    vi.unstubAllGlobals()
    await rm(root, { recursive: true, force: true })
  }
})
