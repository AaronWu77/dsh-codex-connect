import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { Session, SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { expect, it } from 'vitest'
import { registerOpenAICodexFastModeDefaults } from '../src/fast-mode-defaults.ts'
import { FastModeRegistry } from '../src/fast-mode.ts'
it('seeds independent startup defaults once, not resumes or explicit manual-off choices',async()=>{
  const ctx=new Context(); await ctx.plugin(SessionStore)
  try {
    const registry=new FastModeRegistry()
    let settings={enableNewSessionFastMode:false,enableNewSubagentFastMode:false}
    registerOpenAICodexFastModeDefaults(ctx,registry,()=>settings)
    const announce=async(session:Session,source:'startup'|'resume')=>{
      const agent={session} as Agent
      await ctx.serial(scopeTarget(agent,undefined),'agent/created',{agent,source})
    }
    const existing=ctx.sessions.create(SessionId(crypto.randomUUID())); await announce(existing,'startup')
    settings={enableNewSessionFastMode:true,enableNewSubagentFastMode:false}
    await announce(existing,'startup'); expect(registry.isEnabled(existing.id)).toBe(false)
    const resumed=ctx.sessions.create(SessionId(crypto.randomUUID())); await announce(resumed,'resume'); expect(registry.isEnabled(resumed.id)).toBe(false)
    const fresh=ctx.sessions.create(SessionId(crypto.randomUUID())); await announce(fresh,'startup'); expect(registry.isEnabled(fresh.id)).toBe(true)
    registry.set(fresh.id,false); await announce(fresh,'startup'); expect(registry.isEnabled(fresh.id)).toBe(false)
    const child=ctx.sessions.create(SessionId(crypto.randomUUID()),{meta:{origin:'subagent'}}); await announce(child,'startup'); expect(registry.isEnabled(child.id)).toBe(false)
    settings={enableNewSessionFastMode:false,enableNewSubagentFastMode:true}
    const later=ctx.sessions.create(SessionId(crypto.randomUUID()),{meta:{origin:'subagent'}}); await announce(later,'startup'); expect(registry.isEnabled(later.id)).toBe(true)
    expect(registry.isEnabled(fresh.id)).toBe(false)
  } finally {await ctx.fiber.dispose()}
})
