import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenAICodexResidencyLease } from '../src/ws-residency.ts'

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

function admit(residency: InstanceType<typeof OpenAICodexWebSocketResidency>, sessionId = 'session-a'): OpenAICodexResidencyLease {
  const decision = residency.admit(sessionId, 'conversation')
  expect(decision.continuation).toBe(true)
  if (!decision.continuation) throw new Error('The test request must own a residency lease')
  return decision.lease
}

describe('Codex resident WebSocket budget', () => {
  it('admits only conversation turns that carry a session id', () => {
    const residency = registry(2)
    expect(residency.admit('session-a', 'conversation')).toMatchObject({
      continuation: true, lease: { sessionId: 'session-a', before: { delta: 0, full: 0 } },
    })
    expect(residency.admit('session-a', 'session-title').continuation).toBe(false)
    expect(residency.admit('session-a', 'compaction').continuation).toBe(false)
    expect(residency.admit('session-a', 'auto-review').continuation).toBe(false)
    expect(residency.admit('session-a', 'subagent').continuation).toBe(false)
    expect(residency.admit('session-a', undefined).continuation).toBe(false)
    expect(residency.admit(undefined, 'conversation').continuation).toBe(false)
    expect(registry(0).admit('session-a', 'conversation').continuation).toBe(false)
    residency.closeAll()
  })

  it('evicts the least recently used idle session when a new one needs the slot', () => {
    const residency = registry(1)
    const first = admit(residency)
    expect(residency.settle(first, undefined).transport).toBe('ws')
    admit(residency, 'session-b')
    expect(residency.sessions()).toEqual(['session-b'])
    expect(pi.close).toHaveBeenCalledWith('session-a')
    expect(pi.reset).toHaveBeenCalledWith('session-a')
    residency.closeAll()
  })

  it('degrades the newcomer instead of closing a busy session', () => {
    const residency = registry(1)
    admit(residency)
    expect(residency.admit('session-b', 'conversation').continuation).toBe(false)
    expect(residency.sessions()).toEqual(['session-a'])
    expect(pi.close).not.toHaveBeenCalled()
    residency.closeAll()
  })

  it('retries a degraded session only after its cooldown expires', () => {
    let now = 0
    const residency = registry(1, () => now)
    const first = admit(residency)
    expect(residency.settle(first, { eventsEmitted: false }).transport).toBe('sse')
    expect(pi.reset).not.toHaveBeenCalled()

    now = 1_000
    const second = admit(residency)
    residency.abort(second)
    expect(pi.reset).not.toHaveBeenCalled()

    now = 60_000
    const third = admit(residency)
    expect(pi.reset).toHaveBeenCalledWith('session-a')
    expect(residency.settle(third, undefined).transport).toBe('ws')
    residency.closeAll()
  })

  it('reports SSE while pi still holds the session fallback flag', () => {
    const residency = registry(1)
    pi.stats.mockReturnValue({ websocketFallbackActive: true })
    const lease = admit(residency)
    expect(residency.settle(lease, undefined).transport).toBe('sse')
    residency.closeAll()
  })

  it('frees every idle slot after the account connection limit rejects a handshake', () => {
    const residency = registry(2)
    const first = admit(residency)
    expect(residency.settle(first, undefined).transport).toBe('ws')
    const second = admit(residency, 'session-b')
    expect(residency.settle(second, { code: 'websocket_connection_limit_reached', eventsEmitted: false }).transport).toBe('sse')
    expect(residency.sessions()).toEqual(['session-b'])
    expect(pi.close).toHaveBeenCalledWith('session-a')
    residency.closeAll()
  })

  it('the account connection limit evicts only idle peers, never a busy lease', () => {
    let now = 0
    const residency = registry(3, () => now++)
    const busy = admit(residency, 'session-a')
    residency.settle(admit(residency, 'session-b'), undefined)
    residency.settle(admit(residency, 'session-c'), undefined)

    const newcomer = admit(residency, 'session-d')
    // Capacity admission closes the oldest idle peer, without touching A's live lease.
    expect(pi.close.mock.calls).toEqual([['session-b']])
    expect(residency.sessions()).toContain('session-a')
    pi.close.mockClear()

    expect(residency.settle(newcomer, { code: 'websocket_connection_limit_reached', eventsEmitted: false }))
      .toEqual({ transport: 'sse' })
    // The account-limit failure may free only one additional idle peer.
    expect(pi.close.mock.calls.length).toBeLessThanOrEqual(1)
    expect(pi.close.mock.calls.every(([sessionId]) => sessionId === 'session-c')).toBe(true)
    expect(pi.close).not.toHaveBeenCalledWith('session-a')
    expect(residency.sessions()).toContain('session-a')
    expect(residency.settle(busy, undefined)).toEqual({ transport: 'ws' })
    residency.closeAll()
  })

  it('closes every connection and clears pi fallback flags', () => {
    const residency = registry(2)
    admit(residency)
    admit(residency, 'session-b')
    residency.closeAll()
    expect(residency.sessions()).toEqual([])
    expect(pi.close).toHaveBeenCalledWith()
    expect(pi.reset).toHaveBeenCalledWith()
  })

  it('defers a close-all request until the last request settles', () => {
    const residency = registry(2)
    const first = admit(residency)
    const second = admit(residency, 'session-b')
    residency.requestCloseAll()
    expect(pi.close).not.toHaveBeenCalled()
    residency.settle(first, undefined)
    expect(pi.close).not.toHaveBeenCalled()
    residency.settle(second, undefined)
    expect(pi.close).toHaveBeenCalledWith()
    expect(residency.sessions()).toEqual([])
  })

  it('refuses admission while a close-all is pending and allows it after draining', () => {
    const residency = registry(2)
    const lease = admit(residency)
    residency.requestCloseAll()
    expect(residency.admit('session-a', 'conversation')).toEqual({ continuation: false })
    expect(residency.admit('session-b', 'conversation')).toEqual({ continuation: false })
    expect(pi.close).not.toHaveBeenCalled()
    residency.abort(lease)
    expect(residency.sessions()).toEqual([])
    expect(pi.close).toHaveBeenCalledWith()
    admit(residency, 'session-b')
    residency.closeAll()
  })

  it('drops one idle session when its business session is disposed', () => {
    const residency = registry(2)
    const lease = admit(residency)
    residency.settle(lease, undefined)
    admit(residency, 'session-b')
    residency.closeSession('session-a')
    expect(residency.sessions()).toEqual(['session-b'])
    expect(pi.close).toHaveBeenCalledWith('session-a')
    residency.closeAll()
  })

  it.each(['settle', 'abort'] as const)('defers closeSession until its last lease ends with %s', terminal => {
    const residency = registry(2)
    const first = admit(residency)
    const second = admit(residency)
    residency.closeSession('session-a')
    expect(residency.sessions()).toEqual(['session-a'])
    expect(pi.close).not.toHaveBeenCalled()
    residency.settle(first, undefined)
    expect(pi.close).not.toHaveBeenCalled()
    if (terminal === 'settle') residency.settle(second, undefined)
    else residency.abort(second)
    expect(residency.sessions()).toEqual([])
    expect(pi.close).toHaveBeenCalledExactlyOnceWith('session-a')
    expect(pi.reset).toHaveBeenCalledExactlyOnceWith('session-a')
  })

  it.each(['settle', 'abort'] as const)('closes the idle entry before completing the close-all drain on %s', terminal => {
    const residency = registry(2)
    const lease = admit(residency)
    residency.closeSession('session-a')
    residency.requestCloseAll()
    if (terminal === 'settle') residency.settle(lease, undefined)
    else residency.abort(lease)
    expect(pi.close.mock.calls).toEqual([['session-a'], []])
    expect(residency.sessions()).toEqual([])
  })

  it('attributes a delta to the request that observed it and not to a later one', () => {
    const residency = registry(1)
    const lease = admit(residency)
    pi.stats.mockReturnValue({ deltaRequests: 1, fullContextRequests: 0, lastDeltaInputItems: 3 })
    expect(residency.settle(lease, undefined)).toEqual({ transport: 'ws', continuation: 'delta', deltaItems: 3 })
    const next = admit(residency)
    expect(residency.settle(next, undefined)).toEqual({ transport: 'ws' })
    residency.closeAll()
  })

  it.each(['session-title', 'compaction', 'auto-review'] as const)('does not release a busy session when admission refuses %s', kind => {
    const residency = registry(1)
    const first = admit(residency)
    expect(residency.admit('session-a', kind)).toEqual({ continuation: false })
    const second = admit(residency)
    residency.settle(second, undefined)
    expect(residency.admit('session-b', 'conversation')).toEqual({ continuation: false })
    expect(residency.sessions()).toEqual(['session-a'])
    expect(pi.close).not.toHaveBeenCalled()
    residency.requestCloseAll()
    expect(pi.close).not.toHaveBeenCalled()
    residency.settle(first, undefined)
    expect(pi.close).toHaveBeenCalledExactlyOnceWith()
    expect(residency.sessions()).toEqual([])
  })

  it('does not release another request when a lease is settled or aborted twice', () => {
    const residency = registry(1)
    const first = admit(residency)
    const second = admit(residency)
    residency.settle(first, undefined)
    residency.abort(first)
    expect(residency.settle(first, undefined).transport).toBe('sse')
    expect(residency.admit('session-b', 'conversation').continuation).toBe(false)
    expect(pi.close).not.toHaveBeenCalled()
    residency.abort(second)
    admit(residency, 'session-b')
    expect(pi.close).toHaveBeenCalledWith('session-a')
    residency.closeAll()
  })

  it('does not release a replacement entry with a stale or copied lease', () => {
    const residency = registry(1)
    const stale = admit(residency)
    residency.closeAll()
    const current = admit(residency)
    pi.close.mockClear()
    expect(residency.settle(stale, undefined).transport).toBe('sse')
    residency.abort({ ...current })
    expect(residency.admit('session-b', 'conversation').continuation).toBe(false)
    expect(pi.close).not.toHaveBeenCalled()
    residency.abort(current)
    residency.closeAll()
  })

  it('attributes continuation only when a request ran alone on its session', () => {
    const residency = registry(1)
    const first = admit(residency)
    pi.stats.mockReturnValue({ deltaRequests: 0, fullContextRequests: 1 })
    const second = admit(residency)
    expect(first.before).toEqual({ delta: 0, full: 0 })
    expect(second.before).toEqual({ delta: 0, full: 1 })
    // The first settles while a second lease is still live, so its counter window is shared.
    expect(residency.settle(first, undefined)).toEqual({ transport: 'ws' })
    pi.stats.mockReturnValue({ deltaRequests: 1, fullContextRequests: 1, lastDeltaInputItems: 2 })
    expect(residency.settle(second, undefined)).toEqual({ transport: 'ws', continuation: 'delta', deltaItems: 2 })
    residency.closeAll()
  })

  it('reports WebSocket for a failure that reached the caller mid-stream', () => {
    const residency = registry(1)
    const lease = admit(residency)
    expect(residency.settle(lease, { eventsEmitted: true })).toEqual({ transport: 'ws' })
    residency.closeAll()
  })

  it('refuses new work on a session whose close is already deferred', () => {
    const residency = registry(2)
    const lease = admit(residency)
    residency.closeSession('session-a')
    expect(residency.admit('session-a', 'conversation')).toEqual({ continuation: false })
    residency.settle(lease, undefined)
    expect(residency.sessions()).toEqual([])
  })
})
