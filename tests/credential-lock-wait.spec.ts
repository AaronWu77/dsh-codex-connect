import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'

it.each(['modify', 'captured', 'activate', 'remove', 'logout'])('waits through a slow refresh before %s', async (operation) => {
  const root = await mkdtemp(join(tmpdir(), 'codex-lock-wait-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const token = (accountId: string) => ({ type: 'oauth' as const, accountId, access: 'fixture-access', refresh: 'fixture-refresh', expires: Date.now() + 60_000 })
  let release!: () => void
  let entered!: () => void
  const holding = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  try {
    await store.modify(OPENAI_CODEX_PROVIDER, async () => token('a'))
    await store.modify(OPENAI_CODEX_PROVIDER, async () => token('b'))
    const accounts = await store.accounts()
    const captured = await store.captureActiveAccount()
    const writer = store.modify(OPENAI_CODEX_PROVIDER, async () => { entered(); await gate; return undefined })
    await holding
    const pending = (operation === 'activate' ? store.activate(accounts[0]!.accountKey)
      : operation === 'remove' ? store.removeAccount(accounts[0]!.accountKey)
      : operation === 'logout' ? store.delete(OPENAI_CODEX_PROVIDER)
      : (operation === 'captured' ? captured : store).modify(OPENAI_CODEX_PROVIDER, async current => current))
      .then(() => 'committed', () => 'failed')
    await new Promise(resolve => setTimeout(resolve, 2_500))
    release()
    await writer
    expect(await pending).toBe('committed')
    if (operation === 'logout') expect(await store.read(OPENAI_CODEX_PROVIDER)).toBeUndefined()
    else expect(await store.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: operation === 'activate' ? 'a' : 'b' })
  } finally {
    release?.()
    await rm(root, { recursive: true, force: true })
  }
})

it('leaves another writer lock and credentials intact when the wait expires', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-lock-deadline-'))
  const filename = join(root, 'auth.json')
  const store = new OpenAICodexCredentialStore(filename)
  try {
    await store.modify(OPENAI_CODEX_PROVIDER, async () => ({
      type: 'oauth', accountId: 'a', access: 'fixture-access', refresh: 'fixture-refresh', expires: 60_000,
    }))
    const before = await readFile(filename, 'utf8')
    await writeFile(`${filename}.lock`, 'fixture-other-writer\n', { flag: 'wx' })
    // Advance the acquisition clock, while retaining real exclusive file creation.
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(20_001)
    await expect(store.delete(OPENAI_CODEX_PROVIDER)).rejects.toThrow('timed out waiting for the writer lock')
    expect(await readFile(filename, 'utf8')).toBe(before)
    expect(await readFile(`${filename}.lock`, 'utf8')).toBe('fixture-other-writer\n')
  } finally {
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  }
})
