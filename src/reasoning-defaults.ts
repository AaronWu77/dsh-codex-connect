/** Optional profile effort; the current Host validates each model before authentication. */
export const OPENAI_CODEX_REASONING_EFFORTS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** Reasoning choices accepted by the current PiAiAdapter profile consumer. */
export type OpenAICodexReasoningEffort = typeof OPENAI_CODEX_REASONING_EFFORTS[number]

/** Preserve reset masks until settings layers have merged. */
export function parseOpenAICodexReasoningEffort(value: unknown): OpenAICodexReasoningEffort | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'string' || !OPENAI_CODEX_REASONING_EFFORTS.some(effort => effort === value)) {
    throw new TypeError('OpenAI Codex reasoningEffort must be off, minimal, low, medium, high, xhigh, max, null or omitted')
  }
  return value as OpenAICodexReasoningEffort
}
