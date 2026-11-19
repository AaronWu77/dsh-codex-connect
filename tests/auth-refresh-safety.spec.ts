import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createModels } from '@earendil-works/pi-ai'
import type { OAuthCredential } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { afterEach, expect, it, vi } from 'vitest'
import { publicAuthError } from '../src/auth-error.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'

let root: string | undefined
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function credential(accountId: string): OAuthCredential {
  return { type: 'oauth', access: 'fixture-access', refresh: 'fixture-refresh', expires: 1, accountId }
}

async function store(): Promise<OpenAICodexCredentialStore> {
  root = await mkdtemp(join(tmpdir(), 'codex-auth-safety-'))
  return new OpenAICodexCredentialStore(join(root, 'auth.json'))
}

it('contains the actual pi-ai malformed-refresh exception before public output', async () => {
  const auth = await store()
  await auth.modify(OPENAI_CODEX_PROVIDER, async () => credential('a'))
  const models = createModels({ credentials: auth })
  models.setProvider(openaiCodexProvider())
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ refresh_token: 'opaque-fixture-secret' }), {
    status: 200, headers: { 'content-type': 'application/json' },
  }))
  vi.stubGlobal('fetch', fetchMock)
  const logging = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')]
  const error = await models.getAuth(OPENAI_CODEX_PROVIDER).catch((error: unknown) => error)
  expect(fetchMock).toHaveBeenCalled()
  expect(String(error)).toContain('opaque-fixture-secret')
  expect(publicAuthError(error)).toBe('OpenAI Codex operation failed. Please try again.')
  for (const logger of logging) expect(JSON.stringify(logger.mock.calls)).not.toContain('opaque-fixture-secret')
})
