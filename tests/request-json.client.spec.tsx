// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { BROWSER_REQUEST_TIMEOUT_MS, BrowserRequestTimeoutError, requestJson } from '../src/client/request-json.ts'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('includes a stalled response body in the deadline and clears its timer', async () => {
  vi.useFakeTimers()
  let signal: AbortSignal | null | undefined
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    signal = init.signal
    return { json: () => new Promise<unknown>(() => {}) }
  })
  const pending = requestJson('/test', {})
  const rejected = expect(pending).rejects.toBeInstanceOf(BrowserRequestTimeoutError)
  await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS)
  await rejected
  expect(signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('does not send an already-cancelled request', async () => {
  vi.useFakeTimers()
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const controller = new AbortController()
  controller.abort(new Error('disposed'))
  await expect(requestJson('/test', { signal: controller.signal })).rejects.toThrow('disposed')
  expect(fetchMock).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('clears the deadline after a complete response', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', async () => Response.json({ ok: true }))
  const { value } = await requestJson('/test', {})
  expect(value).toEqual({ ok: true })
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['headers', 'body'] as const)('settles parent cancellation during stalled %s and ignores late completion', async phase => {
  vi.useFakeTimers()
  const headers = Promise.withResolvers<Response>()
  const body = Promise.withResolvers<unknown>()
  const started = Promise.withResolvers<void>()
  let signal: AbortSignal | null | undefined
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    signal = init.signal; started.resolve()
    return phase === 'headers' ? headers.promise : { json: () => body.promise }
  })
  const controller = new AbortController()
  const pending = requestJson('/test', { signal: controller.signal })
  const reason = new Error('component disposed')
  const rejected = expect(pending).rejects.toBe(reason)
  await started.promise
  controller.abort(reason)
  await rejected
  expect(signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  headers.resolve(Response.json({ late: true })); body.resolve({ late: true })
  await Promise.resolve()
  expect(vi.getTimerCount()).toBe(0)
})

it('bounds an uncooperative headers transport by the same deadline', async () => {
  vi.useFakeTimers()
  const headers = Promise.withResolvers<Response>()
  vi.stubGlobal('fetch', () => headers.promise)
  const pending = requestJson('/test', {})
  const rejected = expect(pending).rejects.toBeInstanceOf(BrowserRequestTimeoutError)
  await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS)
  await rejected
  headers.resolve(Response.json({ late: true }))
  expect(vi.getTimerCount()).toBe(0)
})
