import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createModels } from '@earendil-works/pi-ai'
import type { OAuthCredential } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { afterEach, expect, it, vi } from 'vitest'
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

it('does not save a queued pi-ai login after cancellation has returned', async () => {
  const auth = await store()
  await auth.modify(OPENAI_CODEX_PROVIDER, async () => credential('a'))
  const writerStore = new OpenAICodexCredentialStore(auth.filename)
  let release!: () => void
  let entered!: () => void
  const holding = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  const writer = writerStore.modify(OPENAI_CODEX_PROVIDER, async () => { entered(); await gate; return undefined })
  await holding
  let queued!: () => void
  const waiting = new Promise<void>(resolve => { queued = resolve })
  const modify = auth.modify.bind(auth)
  let mutation: ReturnType<typeof modify> | undefined
  vi.spyOn(auth, 'modify').mockImplementation((...args) => {
    mutation = modify(...args)
    queued()
    return mutation
  })
  const provider = openaiCodexProvider()
  const models = createModels({ credentials: auth })
  models.setProvider({ ...provider, auth: {
    ...provider.auth,
    oauth: { ...provider.auth.oauth!, login: async () => credential('b') },
  } })
  const abort = new AbortController()
  const login = models.login(OPENAI_CODEX_PROVIDER, 'oauth', {
    signal: abort.signal, notify: () => {}, prompt: async () => '',
  }).then(() => 'committed', () => 'cancelled')
  try {
    await waiting
    abort.abort(new Error('fixture cancellation'))
    expect(await login).toBe('cancelled')
    expect(await auth.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'a' })
  } finally {
    release()
    await writer
  }
  await expect(mutation).rejects.toThrow('fixture cancellation')
  expect(await auth.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'a' })
  expect(await auth.accounts()).toHaveLength(1)
})
