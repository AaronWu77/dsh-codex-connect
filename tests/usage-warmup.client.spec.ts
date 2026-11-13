import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalUsageStore } from '../src/client/usage-warmup.ts'
import type { LocalUsageContext, LocalUsageListFace } from '../src/client/usage-warmup.ts'

const day = '2026-10-16'
const backfill = '/api/dsh-codex-connect/local-usage/backfill'
const status = backfill + '/status'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

/** One list snapshot carrying `codexConnectUsage` rows. */
function listOf(days: Record<string, { tokens: number; requests: number }>, timeZone = 'Asia/Shanghai'): unknown {
  return {
    ids: ['a'],
    byId: { a: { blank: false, projectionValues: { codexConnectUsage: { timeZone, days } } } },
  }
}

/** A readable list face exposing one mutable snapshot. */
function listFace(initial: unknown = listOf({})) {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const list: LocalUsageListFace = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  return {
    list,
    get listeners() { return listeners.size },
    set(next: unknown): void { snapshot = next; for (const listener of [...listeners]) listener() },
  }
}

/** A client context around one list face and an optional refresh. */
function contextOf(list: LocalUsageListFace, refresh?: () => Promise<unknown>): LocalUsageContext {
  return { sessions: { list, ...(refresh === undefined ? {} : { refresh }) } }
}

/** @param state - Host pass state. @returns a valid status body. */
function statusBody(state: 'idle' | 'running' | 'done' | 'partial' | 'failed', pollMs = 500): Record<string, unknown> {
  return { state, pollMs }
}

/**
 * Wait until the store publishes a snapshot matching the predicate.
 * @param store - The store under observation.
 * @param matches - Predicate over the published snapshot.
 * @returns Resolution once a matching snapshot is published.
 */
function until(store: LocalUsageStore, matches: (snapshot: ReturnType<LocalUsageStore['snapshot']>) => boolean): Promise<void> {
  if (matches(store.snapshot())) return Promise.resolve()
  const { promise, resolve } = Promise.withResolvers<void>()
  let observed = false
  const off = store.subscribe(() => {
    if (observed || !matches(store.snapshot())) return
    observed = true
    off()
    resolve()
  })
  return promise
}

describe('local usage store', () => {
  it('merges the session list while the warm-up runs and re-pulls once it settles', async () => {
    vi.useFakeTimers()
    const listed = listFace(listOf({ [day]: { tokens: 100, requests: 1 } }))
    const refreshed = listOf({ [day]: { tokens: 100, requests: 1 }, '2026-10-15': { tokens: 40, requests: 1 } })
    const refresh = vi.fn(async () => { listed.set(refreshed) })
    let polls = 0
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (url === status) {
        polls++
        return Response.json(statusBody(polls < 3 ? 'running' : 'done'))
      }
      return Response.json({ state: 'running' })
    })
    vi.stubGlobal('fetch', fetcher)
    const store = new LocalUsageStore(contextOf(listed.list, refresh))
    const off = store.subscribe(() => {})
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(store.snapshot()).toMatchObject({ state: 'ready', data: { days: { [day]: { tokens: 100 } } } })
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual([status])
      await vi.advanceTimersByTimeAsync(500)
      expect(store.snapshot()).toMatchObject({ state: 'ready', data: { days: { [day]: { tokens: 100 } } } })
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(0)
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(store.snapshot()).toMatchObject({ state: 'ready', data: {
        days: { [day]: { tokens: 100, requests: 1, sessions: 1 }, '2026-10-15': { tokens: 40, requests: 1, sessions: 1 } },
      } })
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual([status, status, status])
    } finally { off(); await store.dispose() }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows the merged ledger from the list before any warm-up request resolves', async () => {
    const listed = listFace()
    listed.set({
      ids: ['a'],
      byId: { a: { blank: false, projectionValues: { codexConnectUsage: { timeZone: 'Asia/Shanghai',
        days: { [day]: { tokens: 120, requests: 3 } } } } } },
    })
    // A transport that never settles must not gate the figures the list already carries.
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetcher)
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    try {
      expect(store.snapshot()).toEqual({ state: 'ready', data: {
        timeZone: 'Asia/Shanghai',
        days: { [day]: { tokens: 120, requests: 3, sessions: 1 } },
      } })
      expect(fetcher).toHaveBeenCalledTimes(1)
    } finally { off(); await store.dispose() }
  })

  it('starts an idle Host and then polls its status', async () => {
    vi.useFakeTimers()
    const listed = listFace()
    const calls: string[] = []
    let polls = 0
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url) => {
      calls.push(String(url))
      if (url === backfill) return Response.json({ state: 'running' })
      polls++
      return Response.json(statusBody(polls === 1 ? 'idle' : polls === 2 ? 'running' : 'done'))
    }))
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(calls).toEqual([status, backfill])
      await vi.advanceTimersByTimeAsync(500)
      expect(calls).toEqual([status, backfill, status])
      await vi.advanceTimersByTimeAsync(500)
      expect(calls).toEqual([status, backfill, status, status])
      expect(store.snapshot().state).toBe('ready')
    } finally { off(); await store.dispose() }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('polls an already running Host without triggering a pass', async () => {
    vi.useFakeTimers()
    const listed = listFace()
    let running = true
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url) => {
      calls.push(String(url))
      const body = statusBody(running ? 'running' : 'done')
      running = false
      return Response.json(body)
    }))
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(calls).toEqual([status])
      await vi.advanceTimersByTimeAsync(500)
      expect(calls).toEqual([status, status])
      expect(store.snapshot().state).toBe('ready')
    } finally { off(); await store.dispose() }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settles a Host whose pass is already done without polling', async () => {
    vi.useFakeTimers()
    const listed = listFace()
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(statusBody('done')))
    vi.stubGlobal('fetch', fetcher)
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(store.snapshot().state).toBe('ready')
    } finally { off(); await store.dispose() }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('treats a settled partial or failed pass as reachable', async () => {
    vi.useFakeTimers()
    for (const [state, expected] of [['partial', 'ready'], ['failed', 'failed']] as const) {
      const listed = listFace(listOf({ [day]: { tokens: 3, requests: 1 } }))
      vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json(statusBody(state))))
      const store = new LocalUsageStore(contextOf(listed.list))
      const off = store.subscribe(() => {})
      try {
        await vi.advanceTimersByTimeAsync(0)
        expect(store.snapshot()).toMatchObject({ state: expected, data: { days: { [day]: { tokens: 3 } } } })
      } finally { off(); await store.dispose() }
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('publishes unavailable when the routes are absent and retries them', async () => {
    const listed = listFace(listOf({ [day]: { tokens: 5, requests: 1 } }))
    let reachable = false
    const fetcher = vi.fn<typeof fetch>(async () => {
      if (!reachable) return new Response('', { status: 404 })
      return Response.json(statusBody('done'))
    })
    vi.stubGlobal('fetch', fetcher)
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    try {
      await until(store, snapshot => snapshot.state === 'unavailable')
      expect(store.snapshot()).toMatchObject({ state: 'unavailable', failure: 'request', data: { days: { [day]: { tokens: 5 } } } })
      reachable = true
      store.retry()
      await until(store, snapshot => snapshot.state === 'ready')
      expect(store.snapshot().failure).toBeUndefined()
    } finally { off(); await store.dispose() }
  })

  it('keeps known days when the re-pull fails', async () => {
    vi.useFakeTimers()
    const listed = listFace(listOf({ [day]: { tokens: 7, requests: 1 } }))
    const refresh = vi.fn(async () => { throw new Error('refresh failed') })
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json(statusBody('done'))))
    const store = new LocalUsageStore(contextOf(listed.list, refresh))
    const off = store.subscribe(() => {})
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(store.snapshot()).toMatchObject({ state: 'ready', data: { days: { [day]: { tokens: 7 } } } })
    } finally { off(); await store.dispose() }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the last good days when a later extended list carries none', async () => {
    const listed = listFace(listOf({ [day]: { tokens: 7, requests: 1 } }))
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json(statusBody('done'))))
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    try {
      await until(store, snapshot => snapshot.state === 'ready')
      listed.set({ ids: [], byId: {} })
      await Promise.resolve()
      expect(store.snapshot().data?.days[day]?.tokens).toBe(7)
    } finally { off(); await store.dispose() }
  })

  it('does not poll or subscribe until the first subscriber arrives', async () => {
    const listed = listFace()
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(statusBody('done')))
    vi.stubGlobal('fetch', fetcher)
    const store = new LocalUsageStore(contextOf(listed.list))
    expect(store.snapshot().state).toBe('loading')
    expect(fetcher).not.toHaveBeenCalled()
    const off = store.subscribe(() => {})
    try {
      await until(store, snapshot => snapshot.state === 'ready')
      expect(listed.listeners).toBe(1)
    } finally { off(); await store.dispose() }
    expect(listed.listeners).toBe(0)
  })

  it('stops observing after the last unsubscribe and resumes on resubscribe', async () => {
    vi.useFakeTimers()
    let running = true
    const listed = listFace()
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(statusBody(running ? 'running' : 'done')))
    vi.stubGlobal('fetch', fetcher)
    const store = new LocalUsageStore(contextOf(listed.list))
    const first = store.subscribe(() => {})
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(fetcher).toHaveBeenCalledTimes(1)
      first()
      expect(listed.listeners).toBe(0)
      running = false
      const second = store.subscribe(() => {})
      await vi.advanceTimersByTimeAsync(0)
      expect(fetcher).toHaveBeenCalledTimes(2)
      second()
    } finally { await store.dispose() }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the polling delay and any in-flight request on unsubscribe', async () => {
    vi.useFakeTimers()
    const listed = listFace()
    let resolveStatus!: (response: Response) => void
    const pending = new Promise<Response>(resolve => { resolveStatus = resolve })
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(statusBody('running')))
      .mockImplementationOnce(() => pending)
    vi.stubGlobal('fetch', fetcher)
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(500)
    expect(fetcher).toHaveBeenCalledTimes(2)
    const signal = fetcher.mock.calls[1]?.[1]?.signal
    off()
    expect(signal?.aborted).toBe(true)
    resolveStatus(Response.json(statusBody('done')))
    await store.dispose()
    expect(store.snapshot().state).toBe('loading')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a status response that arrives after disposal', async () => {
    const listed = listFace()
    let resolveStatus!: (response: Response) => void
    const pending = new Promise<Response>(resolve => { resolveStatus = resolve })
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => pending))
    const store = new LocalUsageStore(contextOf(listed.list))
    const listener = vi.fn()
    const off = store.subscribe(listener)
    await Promise.resolve()
    const disposal = store.dispose()
    resolveStatus(Response.json(statusBody('done')))
    await disposal
    off()
    expect(store.snapshot().state).toBe('loading')
    expect(listener).not.toHaveBeenCalled()
  })

  it('leaves no unhandled rejection when the transport fails', async () => {
    const listed = listFace()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.reject(new Error('private transport detail'))))
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    try {
      await until(store, snapshot => snapshot.state === 'unavailable')
      expect(JSON.stringify(store.snapshot())).not.toContain('private transport detail')
    } finally { off(); await store.dispose() }
  })

  it('reports an invalid status payload as unavailable rather than guessing', async () => {
    const listed = listFace()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ state: 'unknown', pollMs: 500 })))
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    try {
      await until(store, snapshot => snapshot.state === 'unavailable')
    } finally { off(); await store.dispose() }
  })

  it('works without a sessions capability at all', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json(statusBody('done'))))
    const store = new LocalUsageStore({})
    const off = store.subscribe(() => {})
    try {
      await until(store, snapshot => snapshot.state === 'ready')
      expect(store.snapshot().data).toBeNull()
    } finally { off(); await store.dispose() }
  })

  it('ignores a throwing sessions proxy', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json(statusBody('done'))))
    const store = new LocalUsageStore({ get sessions(): never { throw new Error('absent service') } })
    const off = store.subscribe(() => {})
    try {
      await until(store, snapshot => snapshot.state === 'ready')
      expect(store.snapshot().data).toBeNull()
    } finally { off(); await store.dispose() }
  })

  it('refreshes without a refresh capability', async () => {
    const listed = listFace(listOf({ [day]: { tokens: 2, requests: 1 } }))
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json(statusBody('done'))))
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    try {
      await until(store, snapshot => snapshot.state === 'ready')
      expect(store.snapshot().data?.days[day]?.tokens).toBe(2)
    } finally { off(); await store.dispose() }
  })

  it('re-runs the observation from retry while a pass is still running', async () => {
    vi.useFakeTimers()
    const listed = listFace()
    let polls = 0
    const fetcher = vi.fn<typeof fetch>(async () => {
      polls++
      return Response.json(statusBody(polls < 3 ? 'running' : 'done'))
    })
    vi.stubGlobal('fetch', fetcher)
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(store.snapshot().state).toBe('loading')
      store.retry()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetcher).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(0)
      expect(store.snapshot().state).toBe('ready')
    } finally { off(); await store.dispose() }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores retries and late subscriptions after disposal', async () => {
    vi.useFakeTimers()
    const listed = listFace()
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(statusBody('done')))
    vi.stubGlobal('fetch', fetcher)
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    off()
    await store.dispose()
    const calls = fetcher.mock.calls.length
    store.retry()
    const late = store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    late()
    expect(fetcher).toHaveBeenCalledTimes(calls)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('delays a retried observation until the aborted one settles', async () => {
    vi.useFakeTimers()
    const listed = listFace()
    let resolveStarted!: (response: Response) => void
    const started = new Promise<Response>(resolve => { resolveStarted = resolve })
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(statusBody('idle')))
      .mockImplementationOnce(() => started)
      .mockResolvedValueOnce(Response.json(statusBody('done')))
    vi.stubGlobal('fetch', fetcher)
    const store = new LocalUsageStore(contextOf(listed.list))
    const off = store.subscribe(() => {})
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(fetcher).toHaveBeenCalledTimes(2)
      store.retry()
      expect(fetcher).toHaveBeenCalledTimes(2)
      resolveStarted(Response.json({ state: 'running' }))
      await vi.advanceTimersByTimeAsync(0)
      expect(fetcher).toHaveBeenCalledTimes(3)
      expect(store.snapshot().state).toBe('ready')
    } finally { off(); await store.dispose() }
    expect(vi.getTimerCount()).toBe(0)
  })
})
