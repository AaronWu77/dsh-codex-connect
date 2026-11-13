import { mkdtemp, rm } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import * as CodexConnect from '../src/index.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { loadSettingsPlugin } from './support/settings-loader-fixture.ts'
import { createCodexWsFixture } from './support/codex-ws-fixture.ts'

const fixtureState = vi.hoisted(() => ({ endpoint: '' }))
// The only provider substitution is the external network address; PI's WS implementation is real.
vi.mock('@earendil-works/pi-ai/providers/openai-codex', async original => {
  const actual = await original<typeof import('@earendil-works/pi-ai/providers/openai-codex')>()
  return { ...actual, openaiCodexProvider() {
    const provider = actual.openaiCodexProvider()
    return { ...provider, getModels: () => provider.getModels().map(model => ({ ...model, baseUrl: fixtureState.endpoint || model.baseUrl })) }
  } }
})

describe('complete Codex Connect Loader shutdown', () => {
  it('cancels an active native WS request before its plugin fiber finishes unloading', async () => {
    const prefix = fileURLToPath(new URL('../.tmp/ws-loader-', import.meta.url))
    const root = await mkdtemp(prefix)
    const server = await createCodexWsFixture('stall')
    const ctx = new Context()
    const originalFetch = globalThis.fetch
    fixtureState.endpoint = server.url
    vi.stubEnv('DSH_HOME', root)
    vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.startsWith(server.url)) return originalFetch(input, init)
      if (url.startsWith('https://chatgpt.com/backend-api/codex/models')) return new Response('offline catalog unavailable', { status: 404 })
      throw new Error('Unexpected external network request in Codex Loader fixture')
    })
    try {
      const token = `offline.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'offline-account' } })).toString('base64url')}.signature`
      const credentials = new OpenAICodexCredentialStore()
      await credentials.modify('openai-codex', async () => ({ type: 'oauth', access: token, refresh: 'offline-refresh', expires: Date.now() + 3_600_000, accountId: 'offline-account' }))
      await ctx.plugin(LlmRuntime)
      const model = openaiCodexProvider().getModels()[0]!.id
      const plugin = process.env['CODEX_TEST_ENTRY'] === undefined
        ? CodexConnect
        : await import(pathToFileURL(process.env['CODEX_TEST_ENTRY']).href)
      const { entry } = await loadSettingsPlugin(ctx, root, 'dsh-codex-connect', plugin, { transport: 'auto', models: [model] })
      if (entry.fiber === undefined) throw new Error('Codex Loader fixture did not activate')
      const chunks: StreamChunk[] = []
      const running = (async () => {
        for await (const chunk of ctx.llm.stream({ provider: 'openai-codex', model, messages: [], sessionId: SessionId('ws-loader-business') })) chunks.push(chunk)
      })()
      await Promise.race([
        server.requested,
        running.then(() => { throw new Error('Model ended before the offline WebSocket request was admitted') }),
      ])
      await entry.fiber.dispose()
      await running
      await server.waitClosed()
      expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED' } } })
      expect(ctx.llm.listProviders()).toEqual([])
      expect(server.httpRequests).toBe(0)
    } finally {
      await ctx.fiber.dispose()
      await server.dispose()
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
      fixtureState.endpoint = ''
      if (!root.startsWith(prefix)) throw new Error('Refusing unexpected Loader fixture cleanup path')
      await rm(root, { recursive: true, force: true })
    }
  })
})
