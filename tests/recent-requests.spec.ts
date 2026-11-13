/** Bounded recent-request log: newest first, cap, and late-fact updates. */
import { describe, expect, it } from 'vitest'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { RecentRequestLog, RECENT_REQUEST_LIMIT } from '../src/recent-requests.ts'
import type { RecentRequestEntry } from '../src/recent-requests.ts'
import { OpenAICodexRequestLifecycle } from '../src/request-lifecycle.ts'

function entry(index: number): RecentRequestEntry {
  return {
    id: `request-${index}`,
    startedAt: 1_000 + index,
    provider: 'openai-codex',
    model: 'gpt-6.1-sol',
    routeLabel: 'OpenAI Codex (AaronWu)',
    kind: 'conversation',
    transport: 'ws',
    inputTokens: index,
    outputTokens: index * 2,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outcome: 'ok',
  }
}

describe('recent request log', () => {
  it('records newest first and keeps only the fixed limit', () => {
    const log = new RecentRequestLog()
    for (let index = 0; index < RECENT_REQUEST_LIMIT + 2; index++) log.record(entry(index))
    expect(log.snapshot().map(item => item.id)).toEqual([
      'request-6', 'request-5', 'request-4', 'request-3', 'request-2',
    ])
  })

  it('late transport, usage and body facts update the recorded row without reordering', () => {
    const log = new RecentRequestLog()
    log.record(entry(1))
    log.update('request-1', { transport: 'sse', inputTokens: 42, bodyBytes: 1_048_576 })
    const [recorded] = log.snapshot()
    expect(recorded?.transport).toBe('sse')
    expect(recorded?.inputTokens).toBe(42)
    expect(recorded?.bodyBytes).toBe(1_048_576)
    expect(recorded?.model).toBe('gpt-6.1-sol')
  })

  it('snapshots are detached and an unknown update is ignored', () => {
    const log = new RecentRequestLog()
    log.record(entry(0))
    log.update('missing', { inputTokens: 9 })
    const snapshot = log.snapshot()
    expect(snapshot[0]?.inputTokens).toBe(0)
    expect(snapshot[0]).not.toBe(log.snapshot()[0])
  })

  it('records usage and a successful finish from the real request lifecycle', async () => {
    const log = new RecentRequestLog()
    const lifecycle = new OpenAICodexRequestLifecycle(undefined, log)
    const chunks = []
    for await (const chunk of lifecycle.stream(async function* () {
      lifecycle.noteRoute('OpenAI Codex (AaronWu)', 'auto')
      lifecycle.noteBodyBytes(2_048)
      yield { type: 'usage' as const, usage: { inputTokens: 11, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 2 } }
      yield { type: 'finish' as const, reason: { kind: 'stop' as const } }
    }, { provider: 'openai-codex', model: 'gpt-6.1-sol', messages: [], reasoningEffort: ReasoningEffortId('xhigh') })) chunks.push(chunk)
    expect(chunks).toHaveLength(2)
    const [recorded] = log.snapshot()
    expect(recorded).toMatchObject({
      provider: 'openai-codex',
      model: 'gpt-6.1-sol',
      routeLabel: 'OpenAI Codex (AaronWu)',
      kind: 'conversation',
      reasoning: 'xhigh',
      transport: 'ws',
      inputTokens: 11,
      outputTokens: 5,
      cacheReadTokens: 3,
      cacheWriteTokens: 2,
      bodyBytes: 2_048,
      outcome: 'ok',
    })
    await lifecycle.dispose()
  })

  it('labels compaction by purpose and other requests from a subagent Session', async () => {
    const log = new RecentRequestLog()
    const lifecycle = new OpenAICodexRequestLifecycle(undefined, log, () => 'subagent')
    const run = async (purpose?: GenerateOptions['purpose']): Promise<void> => {
      for await (const _chunk of lifecycle.stream(async function* () {
        yield { type: 'finish' as const, reason: { kind: 'stop' as const } }
      }, { provider: 'openai-codex', model: 'gpt-6.1-sol', messages: [], ...purpose === undefined ? {} : { purpose } })) { /* drain */ }
    }
    await run('compaction')
    await run()
    expect(log.snapshot().map(item => item.kind)).toEqual(['subagent', 'compaction'])
    await lifecycle.dispose()
  })
})
