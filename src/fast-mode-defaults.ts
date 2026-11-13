/** Seed profile Fast Mode defaults only when a new DSH session starts. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import { FastModeRegistry, isFastModeSessionId } from './fast-mode.ts'
import type { OpenAICodexSettingsConfig } from './settings-contract.ts'
import { ConversationSpeedRegistry } from './speed-mode-registry.ts'
import type { OpenAICodexSpeedMode } from './speed-mode-contract.ts'
import { OpenAICodexSpeedError } from './speed-mode-contract.ts'

type FastModeDefaults = Pick<OpenAICodexSettingsConfig, 'enableNewSessionFastMode' | 'enableNewSubagentFastMode'> & {
  newSessionSpeedMode?: OpenAICodexSpeedMode | undefined
  newSubagentSpeedMode?: OpenAICodexSpeedMode | undefined
}

/**
 * Snapshot the current profile choice for each newly started session. A
 * resumed session or a later profile edit must not change that session's
 * explicit Composer choice. Subagent sessions have an independent default.
 */
export function registerOpenAICodexFastModeDefaults(
  ctx: Context,
  fastMode: FastModeRegistry,
  settings: () => FastModeDefaults,
  resolveRouteAccountKey?: (provider: string, signal: AbortSignal) => Promise<string | undefined>,
): void {
  const started = new WeakSet<Session>()
  if (fastMode instanceof ConversationSpeedRegistry) {
    ctx.on('agent/request', async ({ agent, signal }, next) => {
      const route = await next()
      signal.throwIfAborted()
      await fastMode.applyStartupDefault(agent.session.id, route, resolveRouteAccountKey ?? (async () => {
        throw new OpenAICodexSpeedError('ULTRAFAST_SELECTION_UNAVAILABLE')
      }), signal)
      return route
    }, { global: true })
  }
  ctx.on('agent/created', ({ agent, source }): undefined => {
    if (source !== 'startup' || started.has(agent.session)) {
      if (fastMode instanceof ConversationSpeedRegistry) fastMode.finishStartup(agent.session.id)
      return undefined
    }
    const session = agent.session
    started.add(session)
    if (!isFastModeSessionId(session.id)) return undefined
    const defaults = settings()
    const child = session.header.origin === 'subagent'
    const mode = (child ? defaults.newSubagentSpeedMode : defaults.newSessionSpeedMode)
      ?? ((child ? defaults.enableNewSubagentFastMode : defaults.enableNewSessionFastMode) ? 'fast' : undefined)
    try {
      if (mode !== undefined) {
        if (fastMode instanceof ConversationSpeedRegistry) fastMode.seedStartupDefault(session.id, mode)
        else if (mode === 'ultrafast') throw new OpenAICodexSpeedError('ULTRAFAST_SELECTION_UNAVAILABLE')
        else fastMode.set(session.id, mode === 'fast')
      }
    } finally {
      if (fastMode instanceof ConversationSpeedRegistry) fastMode.finishStartup(session.id)
    }
    return undefined
  }, { global: true })
}
