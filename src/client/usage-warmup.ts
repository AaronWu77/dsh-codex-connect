/** Observe Context's shared historical usage replay without importing its implementation. */
import { requestJson } from './request-json.ts'
import { asRecord } from './usage-ledger.ts'

const ROUTE = '/api/dsh-context/backfill'
type ReplayState = 'idle' | 'running' | 'done' | 'partial' | 'failed'

/** @param value - Status route payload. @returns The validated replay state and host-configured polling cadence. */
function replayStatusOf(value: unknown): { state: ReplayState; pollMs: number } {
  const record = asRecord(value)
  const state = record?.state
  const pollMs = record?.pollMs
  if ((state !== 'idle' && state !== 'running' && state !== 'done' && state !== 'partial' && state !== 'failed')
    || typeof pollMs !== 'number' || !Number.isFinite(pollMs) || pollMs <= 0) {
    throw new Error('Context usage replay returned an invalid status')
  }
  return { state, pollMs }
}

/** An abortable polling delay; disposal clears the timer and listener together. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const finish = (): void => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

/**
 * Start or observe the host's one-pass replay, then refresh the catalog on settlement.
 * @param refresh - Re-pulls session-list projection values; existing rows remain on failure.
 * @param report - Reports unavailable or incomplete history without blanking known usage.
 * @returns Async disposer that cancels requests and waits for observation to settle.
 */
export function startUsageWarmup(refresh: () => Promise<void>, report: (message: string) => void): () => Promise<void> {
  const controller = new AbortController()
  const { signal } = controller
  const status = async () => {
    const response = await requestJson(ROUTE + '/status', { method: 'POST', signal })
    if (!response.response.ok) throw new Error('Context usage replay status is unavailable')
    return replayStatusOf(response.value)
  }
  const running = (async () => {
    try {
      let current = await status()
      if (current.state === 'idle') {
        const started = await requestJson(ROUTE, { method: 'POST', signal })
        if (!started.response.ok) throw new Error('Context usage replay could not start')
      }
      while (!signal.aborted && (current.state === 'idle' || current.state === 'running')) {
        await pause(current.pollMs, signal)
        if (signal.aborted) return
        current = await status()
      }
      if (signal.aborted) return
      await refresh()
      if (current.state !== 'done') report('Historical token usage is incomplete; known daily figures are retained')
    } catch (error) {
      if (!signal.aborted) report(error instanceof Error ? error.message : 'Historical token usage could not be refreshed')
    }
  })()
  return async () => { controller.abort(); await running }
}
