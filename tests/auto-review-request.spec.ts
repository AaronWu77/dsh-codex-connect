import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { Response as UndiciResponse } from 'undici'
import { OpenAICodexAutoReviewBackend } from '../src/auto-review-backend.ts'
import type { AutoReviewBackendInput } from '../src/auto-review-backend.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { OpenAICodexProxyManager } from '../src/provider-proxy.ts'
import { fetch as reviewFetch } from '../src/undici-runtime.ts'

vi.mock('../src/undici-runtime.ts', async original => ({
  ...await original<typeof import('../src/undici-runtime.ts')>(), fetch: vi.fn(),
}))

it('keeps refresh and the full reviewer stream inside one proxy operation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-review-request-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const proxy = new OpenAICodexProxyManager()
  let inScope = false
  const phases: Array<[string, boolean]> = []
  const sentAccounts: string[] = []
  const token = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'a' } })).toString('base64')}.fixture`
  try {
    await store.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: 'b', access: 'fixture-b', refresh: 'fixture-b-refresh', expires: Date.now() + 3_600_000 }))
    await store.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: 'a', access: token, refresh: 'fixture-refresh', expires: 1 }))
    const b = (await store.accounts()).find(account => !account.active)!.accountKey
    const capture = store.captureActiveAccount.bind(store)
    vi.spyOn(store, 'captureActiveAccount').mockImplementation(async () => {
      const snapshot = await capture()
      await store.activate(b)
      return snapshot
    })
    vi.spyOn(proxy, 'run').mockImplementation((_url, operation) => {
      inScope = true
      const result = operation()
      if (result instanceof Promise) void result.then(() => { inScope = false }, () => { inScope = false })
      else inScope = false
      return result
    })
    vi.stubGlobal('fetch', vi.fn(async () => {
      phases.push(['refresh', inScope])
      return Response.json({ access_token: token, refresh_token: 'fixture-refreshed', expires_in: 3600 })
    }))
    vi.mocked(reviewFetch).mockImplementation(async (_url, init) => {
      sentAccounts.push(new Headers(init?.headers as HeadersInit).get('chatgpt-account-id') ?? '')
      phases.push(['headers', inScope])
      const response = new UndiciResponse('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
      const getReader = response.body!.getReader.bind(response.body!)
      vi.spyOn(response.body!, 'getReader').mockImplementation(() => {
        phases.push(['body', inScope])
        return getReader()
      })
      return response
    })
    const input: AutoReviewBackendInput = {
      action: { toolName: 'fixture', callId: 'fixture' as AutoReviewBackendInput['action']['callId'], turn: 1, arguments: {}, fingerprint: 'fixture' },
      context: { transcript: '', tools: '', transcriptEntriesOmitted: 0, toolEntriesOmitted: 0, entriesTruncated: 0 },
    }
    await expect(new OpenAICodexAutoReviewBackend(store, proxy, () => 'http://127.0.0.1:8899').review(input)).resolves.toEqual({ status: 'unavailable' })
    expect(phases).toEqual([['refresh', true], ['headers', true], ['body', true]])
    expect(sentAccounts).toEqual(['a'])
    expect(await store.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'b' })
    expect(inScope).toBe(false)
  } finally {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await proxy.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

it('redacts the complete outgoing review evidence without mutating exact action arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-review-redaction-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const proxy = new OpenAICodexProxyManager()
  let captured = ''
  try {
    await store.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: 'fixture', access: 'fixture-access', refresh: 'fixture-refresh', expires: Date.now() + 3_600_000 }))
    vi.mocked(reviewFetch).mockImplementation(async (_url, init) => {
      captured = String(init?.body)
      return new UndiciResponse('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
    })
    const arguments_ = { nested: { password: 'private-argument-value' }, ordinary: 'retained' }
    const input: AutoReviewBackendInput = {
      action: { toolName: 'write', callId: 'fixture' as AutoReviewBackendInput['action']['callId'], turn: 1, arguments: arguments_, fingerprint: 'fixture', reason: 'Cookie: opaque-reason-cookie' },
      context: { transcript: 'Bearer private-transcript-token', tools: 'api_key=private-tool-key', transcriptEntriesOmitted: 0, toolEntriesOmitted: 0, entriesTruncated: 0 },
    }
    await expect(new OpenAICodexAutoReviewBackend(store, proxy, () => undefined).review(input)).resolves.toEqual({ status: 'unavailable' })
    expect(captured).not.toMatch(/private-argument-value|opaque-reason-cookie|private-transcript-token|private-tool-key/u)
    expect(captured).toContain('retained')
    expect(captured).toContain('sensitive_values_redacted')
    expect(arguments_.nested.password).toBe('private-argument-value')
  } finally {
    vi.restoreAllMocks()
    await proxy.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

it('authenticates a secondary-route review as its frozen account and never falls back to the active account', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-review-bound-account-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const proxy = new OpenAICodexProxyManager()
  const sent: string[] = []
  try {
    await store.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: 'secondary', access: 'fixture-secondary', refresh: 'fixture-refresh-b', expires: Date.now() + 3_600_000 }))
    await store.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: 'primary', access: 'fixture-primary', refresh: 'fixture-refresh-a', expires: Date.now() + 3_600_000 }))
    const secondary = (await store.accounts()).find(account => !account.active)!.accountKey
    const active = vi.spyOn(store, 'captureActiveAccount')
    vi.mocked(reviewFetch).mockImplementation(async (_url, init) => {
      sent.push(new Headers(init?.headers as HeadersInit).get('chatgpt-account-id') ?? '')
      return new UndiciResponse('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
    })
    const backend = new OpenAICodexAutoReviewBackend(store, proxy, () => undefined)
    const input: AutoReviewBackendInput = { accountKey: secondary,
      action: { provider: 'openai-codex-16', toolName: 'read', callId: 'fixture' as AutoReviewBackendInput['action']['callId'], turn: 1, arguments: {}, fingerprint: 'fixture' },
      context: { transcript: '', tools: '', transcriptEntriesOmitted: 0, toolEntriesOmitted: 0, entriesTruncated: 0 } }
    await expect(backend.review(input)).resolves.toEqual({ status: 'unavailable' })
    expect(sent).toEqual(['secondary'])
    expect(active).not.toHaveBeenCalled()
    await expect(backend.review({ ...input, accountKey: 'missing-account' })).resolves.toEqual({ status: 'unavailable' })
    expect(sent).toEqual(['secondary'])
  } finally { vi.restoreAllMocks(); await proxy.dispose(); await rm(root, { recursive: true, force: true }) }
})
