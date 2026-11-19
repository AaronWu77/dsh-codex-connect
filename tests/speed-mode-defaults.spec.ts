import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { expect, it, vi } from 'vitest'
import { registerOpenAICodexFastModeDefaults } from '../src/fast-mode-defaults.ts'
import { ConversationSpeedRegistry } from '../src/speed-mode-registry.ts'
import type { OpenAICodexSpeedMode } from '../src/speed-mode-contract.ts'

it('snapshots independent main/subagent startup preferences and resolves the admitted account route only', async () => {
  const ctx = new Context(); await ctx.plugin(SessionStore)
  try {
    const registry = new ConversationSpeedRegistry()
    let defaults = { enableNewSessionFastMode: true, enableNewSubagentFastMode: true,
      newSessionSpeedMode: 'ultrafast' as OpenAICodexSpeedMode, newSubagentSpeedMode: 'standard' as OpenAICodexSpeedMode }
    const account = vi.fn(async () => 'acct_' + 'a'.repeat(43))
    registerOpenAICodexFastModeDefaults(ctx, registry, () => defaults, account)
    const top = ctx.sessions.create(SessionId('top'))
    const child = ctx.sessions.create(SessionId('child'), { meta: { origin: 'subagent' } })
    const start = async (session: typeof top, source: 'startup' | 'resume' = 'startup') => {
      const agent = { session } as Agent
      await ctx.serial(scopeTarget(agent, undefined), 'agent/created', { agent, source, signal: new AbortController().signal })
      return agent
    }
    const request = async (agent: Agent, provider = 'openai-codex-16') => ctx.waterfall('agent/request', {
      agent, signal: new AbortController().signal, turn: 1, step: 1,
    }, async () => ({ provider, model: 'gpt-6.1-sol' }))
    const parent = await start(top); await start(child)
    expect(account).not.toHaveBeenCalled()
    await request(parent)
    expect(account).toHaveBeenCalledWith('openai-codex-16', expect.any(AbortSignal))
    expect(registry.captureSpeed('top').mode).toBe('ultrafast')
    expect(registry.captureSpeed('child').mode).toBe('standard')
    registry.set('top', false)
    defaults = { ...defaults, newSessionSpeedMode: 'fast' }
    await start(top); await request(parent)
    expect(registry.captureSpeed('top').mode).toBe('standard')
    const resumed = ctx.sessions.create(SessionId('resumed'))
    await request(await start(resumed, 'resume'))
    expect(registry.captureSpeed('resumed').mode).toBe('standard')
    expect(account).toHaveBeenCalledOnce()
  } finally { await ctx.fiber.dispose() }
})
it('keeps legacy boolean defaults when explicit new fields are omitted and honors explicit Standard', async () => {
  const ctx = new Context(); await ctx.plugin(SessionStore)
  try {
    const registry = new ConversationSpeedRegistry()
    let mode: OpenAICodexSpeedMode | undefined
    registerOpenAICodexFastModeDefaults(ctx, registry, () => ({ enableNewSessionFastMode: true, enableNewSubagentFastMode: false, newSessionSpeedMode: mode }))
    const start = async (id: string) => {
      const agent = { session: ctx.sessions.create(SessionId(id)) } as Agent
      await ctx.serial(scopeTarget(agent, undefined), 'agent/created', { agent, source: 'startup', signal: new AbortController().signal })
    }
    await start('legacy'); expect(registry.isEnabled('legacy')).toBe(true)
    mode = 'standard'; await start('explicit'); expect(registry.captureSpeed('explicit').mode).toBe('standard')
  } finally { await ctx.fiber.dispose() }
})
