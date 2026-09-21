import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OPENAI_CODEX_QUOTA_PATH } from '../src/quota-contract.ts'
import { registerOpenAICodexQuotaRoute } from '../src/quota-routes.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import type { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'

interface CapturedRoute {
  path: string
  handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void
}

function access(account: string): string {
  return `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: account } })).toString('base64')}.fixture`
}

function capture(store: OpenAICodexCredentialStore): CapturedRoute {
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
  registerOpenAICodexQuotaRoute(ctx, {
    store,
    trustedOrigins: { has: async () => false } as unknown as OpenAICodexTrustedOriginsStore,
  })
  if (captured === undefined) throw new Error('quota route was not registered')
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

/** One ChatGPT usage response with a single 5h window at the given remaining percent. */
function usageResponse(remainingPercent: number): Response {
  return Response.json({
    rate_limit: {
      primary_window: { used_percent: 100 - remainingPercent, limit_window_seconds: 18_000, reset_at: 1_790_000_000 },
    },
  })
}

let root: string | undefined

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Create a temp credential store holding one credential per supplied account id. */
async function storeWith(accountIds: readonly string[]): Promise<OpenAICodexCredentialStore> {
  root = await mkdtemp(join(tmpdir(), 'codex-quota-route-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  for (const accountId of accountIds) {
    await store.modify(OPENAI_CODEX_PROVIDER, async () => ({
      type: 'oauth',
      accountId,
      access: access(accountId),
      refresh: `fixture-refresh-${accountId}`,
      expires: Date.now() + 3_600_000,
    }))
  }
  return store
}

describe('Codex Connect quota route', () => {
  it('serves every stored account except the active one to a trusted loopback GET', async () => {
    // Document order is c, b, a; the last added account is the active selection.
    const store = await storeWith(['c', 'b', 'a'])
    const summaries = await store.accounts()
    const active = summaries.find(summary => summary.active)!
    expect(active.accountKey).toMatch(/^acct_/u)
    const sent: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      const accountId = headers.get('chatgpt-account-id') ?? ''
      sent.push(accountId)
      return accountId === 'b' ? usageResponse(41) : new Response('', { status: 503 })
    }))

    const res = response()
    await capture(store).handler(request(), res)

    expect(res.observed.status).toBe(200)
    const body = JSON.parse(res.observed.body ?? 'null') as {
      accounts: { accountKey: string; usage?: { rateLimits: { windows: { remainingPercent: number }[] }[] }; unavailable?: true }[]
    }
    expect(body.accounts).toHaveLength(2)
    expect(body.accounts.map(entry => entry.accountKey)).toEqual(
      summaries.filter(summary => !summary.active).map(summary => summary.accountKey),
    )
    expect(body.accounts[0]!.unavailable).toBe(true)
    expect(body.accounts[1]!.usage?.rateLimits[0]!.windows[0]!.remainingPercent).toBe(41)
    // The active account stays on the account store's own polled snapshot.
    expect(sent.sort()).toEqual(['b', 'c'])
  })

  it('never reads an account when the active one is the only stored account', async () => {
    const store = await storeWith(['a'])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = response()
    await capture(store).handler(request(), res)

    expect(res.observed.status).toBe(200)
    expect(JSON.parse(res.observed.body ?? 'null')).toEqual({ accounts: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects mutations and untrusted peers before reading credentials', async () => {
    const store = await storeWith(['b', 'a'])
    const accounts = vi.spyOn(store, 'accounts')
    const route = capture(store)

    const mutation = response()
    await route.handler(request('POST'), mutation)
    expect(mutation.observed.status).toBe(405)

    const remote = response()
    await route.handler(request('GET', '192.168.1.9'), remote)
    expect(remote.observed.status).toBe(403)
    expect(accounts).not.toHaveBeenCalled()
  })

  it('answers with no accounts when the credential document cannot be read', async () => {
    const store = await storeWith(['b', 'a'])
    vi.spyOn(store, 'accounts').mockRejectedValue(new Error('malformed credential document'))

    const res = response()
    await capture(store).handler(request(), res)

    expect(res.observed.status).toBe(200)
    expect(JSON.parse(res.observed.body ?? 'null')).toEqual({ accounts: [] })
  })
})
