import { describe, expect, it } from 'vitest'
import { parseOpenAICodexReasoningEffort } from '../src/reasoning-defaults.ts'
import { parseOpenAICodexSpeedDefault, projectOpenAICodexSpeedPayload, readConversationSpeed, supportsOpenAICodexUltrafast } from '../src/speed-mode-contract.ts'

describe('explicit Codex speed wire hints', () => {
  it.each(['openai-codex', 'openai-codex-2', 'openai-codex-16'])('supports exact models on account route %s without claiming account entitlement', provider => {
    for (const model of ['gpt-6-astra', 'gpt-6.1-sol']) {
      const payload = { model, reasoning: { effort: 'max' }, max_output_tokens: 2048, input: [] }
      expect(supportsOpenAICodexUltrafast(provider, model)).toBe(true)
      expect(projectOpenAICodexSpeedPayload(payload, provider, model, 'ultrafast')).toEqual({ ...payload, service_tier: 'ultrafast' })
      expect(payload).not.toHaveProperty('service_tier')
    }
  })
  it.each(['gpt-6-sol', 'gpt-6.1-sol-preview', 'gpt-6-astra-extra', 'GPT-6-ASTRA'])('rejects unsupported %s without fuzzy family matching', model => {
    expect(supportsOpenAICodexUltrafast('openai-codex', model)).toBe(false)
    expect(() => projectOpenAICodexSpeedPayload({ model }, 'openai-codex', model, 'ultrafast')).toThrow('ULTRAFAST_MODEL_UNSUPPORTED')
  })
  it('runs after payload replacement, rejects a changed model, and removes owned paid hints for Standard', () => {
    const payload = { model: 'gpt-6.1-sol', service_tier: 'ultrafast', reasoning: { effort: 'low' }, max_output_tokens: 2048 }
    expect(projectOpenAICodexSpeedPayload(payload, 'openai-codex-16', payload.model, 'standard')).toEqual({ model: payload.model, reasoning: payload.reasoning, max_output_tokens: 2048 })
    expect(projectOpenAICodexSpeedPayload(payload, 'openai-codex-16', payload.model, 'fast')).toEqual({ ...payload, service_tier: 'priority' })
    expect(() => projectOpenAICodexSpeedPayload({ model: 'gpt-6-astra' }, 'openai-codex', payload.model, 'ultrafast')).toThrow('ULTRAFAST_PAYLOAD_MODEL_MISMATCH')
    expect(() => projectOpenAICodexSpeedPayload(null, 'openai-codex', payload.model, 'ultrafast')).toThrow('ULTRAFAST_PAYLOAD_INVALID')
    expect(projectOpenAICodexSpeedPayload(payload, 'custom-route-16', payload.model, 'standard')).toBe(payload)
  })
  it('keeps omission and null masks distinct from explicit modes and effort ids', () => {
    for (const value of [undefined, null, 'standard', 'fast', 'ultrafast'] as const) expect(parseOpenAICodexSpeedDefault(value)).toBe(value)
    for (const value of [undefined, null, 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const) expect(parseOpenAICodexReasoningEffort(value)).toBe(value)
    for (const value of [true, 'ULTRAFAST', 'priority', 1, {}]) expect(() => parseOpenAICodexSpeedDefault(value)).toThrow()
    for (const value of ['none', 'ultra', 'MAX', 1, {}]) expect(() => parseOpenAICodexReasoningEffort(value)).toThrow()
  })
  it('rejects readbacks for another route/model and never invents served-tier evidence', () => {
    const state = { generation: 'generation', revision: 0, mode: 'ultrafast', provider: 'openai-codex-16', model: 'gpt-6.1-sol', modelSupported: true,
      eligibility: 'unknown', hasAccount: true, selectionAvailable: true, selectionExpired: false }
    expect(readConversationSpeed(state, state.provider, state.model)).toEqual(state)
    expect(readConversationSpeed(state, 'openai-codex', state.model)).toBeUndefined()
    expect(readConversationSpeed({ ...state, eligibility: 'eligible' }, state.provider, state.model)).toBeUndefined()
  })
})
