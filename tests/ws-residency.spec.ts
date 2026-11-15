import { beforeEach, describe, expect, it, vi } from 'vitest'

const pi = vi.hoisted(() => ({
  close: vi.fn(),
  reset: vi.fn(),
  stats: vi.fn(),
}))
vi.mock('@earendil-works/pi-ai/api/openai-codex-responses', () => ({
  closeOpenAICodexWebSocketSessions: pi.close,
  resetOpenAICodexWebSocketDebugStats: pi.reset,
  getOpenAICodexWebSocketDebugStats: pi.stats,
}))

const { OpenAICodexWebSocketResidency } = await import('../src/ws-residency.ts')

beforeEach(() => {
  pi.close.mockReset()
  pi.reset.mockReset()
  pi.stats.mockReset()
  pi.stats.mockReturnValue(undefined)
})

function registry(limit: number, clock?: () => number) {
  return new OpenAICodexWebSocketResidency({ resolveLimit: () => limit, now: clock })
}

describe('Codex resident WebSocket budget', () => {
  it('admits only conversation turns that carry a session id', () => {
    const residency = registry(2)
    expect(residency.admit('session-a', 'conversation')).toEqual({ continuation: true, sessionId: 'session-a' })
    expect(residency.admit('session-a', 'title').continuation).toBe(false)
    expect(residency.admit('session-a', 'compaction').continuation).toBe(false)
    expect(residency.admit('session-a', 'subagent').continuation).toBe(false)
    expect(residency.admit('session-a', undefined).continuation).toBe(false)
    expect(residency.admit(undefined, 'conversation').continuation).toBe(false)
    expect(registry(0).admit('session-a', 'conversation').continuation).toBe(false)
    residency.closeAll()
  })

  it('evicts the least recently used idle session when a new one needs the slot', () => {
    const residency = registry(1)
    expect(residency.admit('session-a', 'conversation').continuation).toBe(true)
    expect(residency.settle('session-a', undefined)).toBe('ws')
    expect(residency.admit('session-b', 'conversation').continuation).toBe(true)
    expect(residency.sessions()).toEqual(['session-b'])
    expect(pi.close).toHaveBeenCalledWith('session-a')
    expect(pi.reset).toHaveBeenCalledWith('session-a')
    residency.closeAll()
  })

  it('degrades the newcomer instead of closing a busy session', () => {
    const residency = registry(1)
    expect(residency.admit('session-a', 'conversation').continuation).toBe(true)
    expect(residency.admit('session-b', 'conversation').continuation).toBe(false)
    expect(residency.sessions()).toEqual(['session-a'])
    expect(pi.close).not.toHaveBeenCalled()
    residency.closeAll()
  })

  it('retries a degraded session only after its cooldown expires', () => {
    let now = 0
    const residency = registry(1, () => now)
    expect(residency.admit('session-a', 'conversation').continuation).toBe(true)
    expect(residency.settle('session-a', { eventsEmitted: false })).toBe('sse')
    expect(pi.reset).not.toHaveBeenCalled()

    now = 1_000
    expect(residency.admit('session-a', 'conversation').continuation).toBe(true)
    residency.abort('session-a')
    expect(pi.reset).not.toHaveBeenCalled()

    now = 60_000
    expect(residency.admit('session-a', 'conversation').continuation).toBe(true)
    expect(pi.reset).toHaveBeenCalledWith('session-a')
    expect(residency.settle('session-a', undefined)).toBe('ws')
    residency.closeAll()
  })

  it('reports SSE while pi still holds the session fallback flag', () => {
    const residency = registry(1)
    pi.stats.mockReturnValue({ websocketFallbackActive: true })
    expect(residency.admit('session-a', 'conversation').continuation).toBe(true)
    expect(residency.settle('session-a', undefined)).toBe('sse')
    residency.closeAll()
  })

  it('frees every idle slot after the account connection limit rejects a handshake', () => {
    const residency = registry(2)
    expect(residency.admit('session-a', 'conversation').continuation).toBe(true)
    expect(residency.settle('session-a', undefined)).toBe('ws')
    expect(residency.admit('session-b', 'conversation').continuation).toBe(true)
    expect(residency.settle('session-b', { code: 'websocket_connection_limit_reached', eventsEmitted: false })).toBe('sse')
    expect(residency.sessions()).toEqual(['session-b'])
    expect(pi.close).toHaveBeenCalledWith('session-a')
    residency.closeAll()
  })

  it('closes every connection and clears pi fallback flags', () => {
    const residency = registry(2)
    residency.admit('session-a', 'conversation')
    residency.admit('session-b', 'conversation')
    residency.closeAll()
    expect(residency.sessions()).toEqual([])
    expect(pi.close).toHaveBeenCalledWith()
    expect(pi.reset).toHaveBeenCalledWith()
  })

  it('defers a close-all request until the last request settles', () => {
    const residency = registry(2)
    residency.admit('session-a', 'conversation')
    residency.requestCloseAll()
    expect(pi.close).not.toHaveBeenCalled()
    residency.settle('session-a', undefined)
    expect(pi.close).toHaveBeenCalledWith()
    expect(residency.sessions()).toEqual([])
  })

  it('drops one session when its business session is disposed', () => {
    const residency = registry(2)
    residency.admit('session-a', 'conversation')
    residency.settle('session-a', undefined)
    residency.admit('session-b', 'conversation')
    residency.closeSession('session-a')
    expect(residency.sessions()).toEqual(['session-b'])
    expect(pi.close).toHaveBeenCalledWith('session-a')
    residency.closeAll()
  })
})
