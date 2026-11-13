/** Network-only fixture for running the real Headless profile against Codex transport code. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defaultProviderAuthContext, InMemoryCredentialStore } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { GenerateOptions, PreparedAdapterCall } from '@deepseek-ai/dsh-llm'
import { createOpenAICodexProfile } from '../../src/adapter.ts'
import { OpenAICodexRequestLifecycle } from '../../src/request-lifecycle.ts'

export const name = 'codex-headless-network-fixture'
export const inject = ['llm']
export const Config = z.object({ endpoint: z.string().required() })

export function apply(ctx: Context, config: { endpoint: string }): void {
  const requests = new OpenAICodexRequestLifecycle()
  const original = openaiCodexProvider()
  const model = { ...original.getModels()[0]!, baseUrl: config.endpoint }
  const provider = { ...original, getModels: () => [model] }
  const profile = createOpenAICodexProfile(provider, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    { transport: 'auto', requests })
  const token = `offline.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'offline-account' } })).toString('base64url')}.signature`
  class Adapter extends PiAiAdapter {
    override async prepareCall(providerId: string, modelId: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
      const prepared = await super.prepareCall(providerId, modelId, signal)
      return { ...prepared, stream: options => requests.stream(prepared.stream, options) }
    }
    override stream(options: GenerateOptions) { return requests.stream(request => super.stream(request), options) }
  }
  const profiles = new Map([['openai-codex', profile]])
  const adapter = new Adapter({ profiles: () => profiles, resolveApiKey: async () => token,
    auth: { credentials: new InMemoryCredentialStore(), authContext: defaultProviderAuthContext() } })
  ctx.llm.registerAdapter(['openai-codex'], adapter)
  ctx.effect(() => () => requests.dispose(), 'codex-offline: drain the real model transport')
}
