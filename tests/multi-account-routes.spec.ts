import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as plugin from '../src/index.ts'
import { openAICodexAuthPath, OPENAI_CODEX_PROVIDER } from '../src/store.ts'

let root: string | undefined
let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  vi.unstubAllEnvs()
})

/** Create an isolated DSH home holding one account document, then boot the plugin. */
async function bootWithDocument(
  accounts: readonly { access: string; accountId: string }[],
  activeAccountId: string,
): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'codex-multi-account-'))
  vi.stubEnv('DSH_HOME', root)
  await writeFile(openAICodexAuthPath(root), `${JSON.stringify({
    version: 2,
    activeAccountId,
    credentials: accounts.map(account => ({
      type: 'oauth',
      access: account.access,
      refresh: `${account.access}-refresh`,
      expires: Date.now() + 3_600_000,
      accountId: account.accountId,
    })),
  }, null, 2)}\n`, { mode: 0o600 })
  return await boot()
}

/** Boot the plugin against an isolated empty DSH home. */
async function boot(): Promise<Context> {
  const context = new Context()
  ctx = context
  await context.plugin(LlmRuntime)
  await context.plugin(plugin, {})
  return context
}

describe('multi-account LLM routes through the real registry', () => {
  it('registers one route per stored account and keeps openai-codex on the active account', async () => {
    const context = await bootWithDocument([
      { access: 'one', accountId: 'provider-account-one' },
      { access: 'two', accountId: 'provider-account-two' },
    ], 'provider-account-one')

    await vi.waitFor(() => {
      expect(context.llm.listProviders().map(provider => provider.id)).toEqual(['openai-codex', 'openai-codex-2'])
    })
    const providers = context.llm.listProviders()
    expect(providers[0]!.id).toBe(OPENAI_CODEX_PROVIDER)
    expect(providers[0]!.name).toMatch(/^OpenAI Codex \(acct [A-Za-z0-9_-]{6}\)$/u)
    expect(providers[1]!.name).toMatch(/^OpenAI Codex \(acct [A-Za-z0-9_-]{6}\)$/u)
  })

  it('resolves models on a secondary account route while the primary route keeps serving', async () => {
    const context = await bootWithDocument([
      { access: 'one', accountId: 'provider-account-one' },
      { access: 'two', accountId: 'provider-account-two' },
    ], 'provider-account-one')
    await vi.waitFor(() => { expect(context.llm.listProviders()).toHaveLength(2) })

    const model = 'gpt-5.6-sol'
    await expect(context.llm.resolveModelInfo('openai-codex-2', model)).resolves.toMatchObject({
      provider: 'openai-codex-2',
      id: model,
      context: { contextWindow: 272_000 },
    })
    await expect(context.llm.resolveModelInfo(OPENAI_CODEX_PROVIDER, model)).resolves.toMatchObject({
      provider: OPENAI_CODEX_PROVIDER,
      id: model,
    })
    await expect(context.llm.listModels('openai-codex-2')).resolves.toContainEqual(expect.objectContaining({ id: model }))
  })

  it('registers exactly the one primary route when no account is stored', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-multi-account-empty-'))
    vi.stubEnv('DSH_HOME', root)
    const context = await boot()

    expect(context.llm.listProviders()).toEqual([{ id: OPENAI_CODEX_PROVIDER, name: 'OpenAI Codex' }])
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(context.llm.listProviders()).toEqual([{ id: OPENAI_CODEX_PROVIDER, name: 'OpenAI Codex' }])
  })

  it('keeps the primary route registered when the credential document is malformed', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-multi-account-broken-'))
    vi.stubEnv('DSH_HOME', root)
    await writeFile(openAICodexAuthPath(root), '{ not json', { mode: 0o600 })
    const context = await boot()

    expect(context.llm.listProviders()).toEqual([{ id: OPENAI_CODEX_PROVIDER, name: 'OpenAI Codex' }])
    await expect(context.llm.resolveModelInfo(OPENAI_CODEX_PROVIDER, 'gpt-5.6-sol')).resolves.toMatchObject({ id: 'gpt-5.6-sol' })
  })
})
