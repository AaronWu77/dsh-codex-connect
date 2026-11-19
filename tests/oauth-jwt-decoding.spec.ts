import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { loginOpenAICodex, readOpenAICodexAccountRequestAuth, readOpenAICodexRequestAuth } from '../src/auth.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'

let root: string | undefined
afterEach(async () => {
  vi.unstubAllGlobals()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

const jwt = (payload: string) => `eyJhbGciOiJub25lIn0.${Buffer.from(payload).toString('base64url')}.fixture`
const claims = (id: unknown = 'fixture-account', extra = '') => JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: id }, extra })

async function exercise(flow: 'login' | 'refresh', token: string, id: string) {
  root = await mkdtemp(join(tmpdir(), 'codex-jwt-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const saved = { type: 'oauth' as const, accountId: id, access: 'fixture-old-access', refresh: 'fixture-old-refresh', expires: 1 }
  await store.modify(OPENAI_CODEX_PROVIDER, async () => saved)
  const fetchMock = vi.fn(async (input: string) => {
    const url = String(input)
    if (url.endsWith('/oauth/token')) return Response.json({ access_token: token, refresh_token: 'fixture-new-refresh', expires_in: 3600 })
    if (flow === 'login' && url.endsWith('/deviceauth/usercode')) return Response.json({ device_auth_id: 'fixture-device', user_code: 'fixture-code', interval: 0 })
    if (flow === 'login' && url.endsWith('/deviceauth/token')) return Response.json({ authorization_code: 'fixture-code', code_verifier: 'fixture-verifier' })
    throw new Error('Unexpected network request in fixture OAuth flow')
  })
  vi.stubGlobal('fetch', fetchMock)
  const operation = flow === 'login'
    ? loginOpenAICodex({ signal: new AbortController().signal, notify: () => {}, prompt: async () => 'device_code' }, store)
    : readOpenAICodexRequestAuth(store)
  const result = await operation.then(() => ({ ok: true }), (error: unknown) => ({ ok: false, error }))
  expect(fetchMock).toHaveBeenCalledTimes(flow === 'login' ? 3 : 1)
  return { result, store, saved }
}

for (const flow of ['login', 'refresh'] as const) {
  it.each([
    ['hyphen', 'fixture-account', '~~~', '-'],
    ['underscore', 'fixture-account', '???', '_'],
    ['both characters', 'fixture-account', '࿿', '-'],
    ['UTF-8 identity and claims', 'fixture-账户', '汉字', undefined],
    ['unpadded ASCII', 'fixture-account', '', undefined],
  ] as const)(`${flow} accepts %s without changing the account identity`, async (_label, id, extra, marker) => {
    const token = jwt(claims(id, extra))
    if (marker !== undefined) expect(token.split('.')[1]).toContain(marker)
    expect(token).not.toContain('=')
    const { result, store } = await exercise(flow, token, id)
    expect(result).toEqual({ ok: true })
    expect(await store.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: id, access: token, refresh: 'fixture-new-refresh' })
    expect(await store.accounts()).toHaveLength(1)
  })

  it.each([
    ['malformed JSON', jwt('{')],
    ['missing identity', jwt('{}')],
    ['empty identity', jwt(claims(''))],
    ['non-string identity', jwt(claims(42))],
    ['invalid alphabet', 'eyJhbGciOiJub25lIn0.!a.fixture'],
    ['wrong segment count', 'fixture.payload'],
    ['invalid UTF-8', `eyJhbGciOiJub25lIn0.${Buffer.concat([Buffer.from('{"https://api.openai.com/auth":{"chatgpt_account_id":"fixture-account"},"extra":"'), Buffer.from([0x80]), Buffer.from('"}')]).toString('base64url')}.fixture`],
  ])(`${flow} rejects %s without replacing stored credentials`, async (_label, token) => {
    const { result, store, saved } = await exercise(flow, token, 'fixture-account')
    expect(result.ok).toBe(false)
    expect(await store.read(OPENAI_CODEX_PROVIDER)).toEqual(saved)
    expect(await store.accounts()).toHaveLength(1)
  })
}

it('resolves and refreshes one named account instead of the active selection', async () => {
  root = await mkdtemp(join(tmpdir(), 'codex-jwt-named-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  await store.modify(OPENAI_CODEX_PROVIDER, async () => ({
    type: 'oauth' as const,
    accountId: 'named-account',
    access: 'expired-named-access',
    refresh: 'named-refresh',
    expires: 1,
  }))
  await store.modify(OPENAI_CODEX_PROVIDER, async () => ({
    type: 'oauth' as const,
    accountId: 'active-account',
    access: jwt(claims('active-account')),
    refresh: 'active-refresh',
    expires: Date.now() + 3_600_000,
  }))
  const named = (await store.accounts()).find(account => !account.active)!

  const token = jwt(claims('named-account'))
  const fetchMock = vi.fn(async () => Response.json({ access_token: token, refresh_token: 'named-refresh-2', expires_in: 3600 }))
  vi.stubGlobal('fetch', fetchMock)

  await expect(readOpenAICodexAccountRequestAuth(store, named.accountKey))
    .resolves.toEqual({ access: token, accountId: 'named-account' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const accounts = await store.accounts()
  expect(accounts.find(account => account.accountKey === named.accountKey)).toMatchObject({ active: false })
  expect(await store.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'active-account' })
  expect(await store.accountIdForAccess(token)).toBe('named-account')

  await expect(readOpenAICodexAccountRequestAuth(store, 'acct_0000000000000000000000000000000000000000000'))
    .rejects.toMatchObject({ code: 'MISSING_CREDENTIAL' })
})
