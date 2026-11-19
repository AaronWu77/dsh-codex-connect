import { afterEach, describe, expect, it, vi } from 'vitest'
import { balanceEntryOf, fetchPlatformBalance, platformBalanceOf, platformBalanceSnapshot, resetPlatformBalance, subscribePlatformBalance, PLATFORM_BALANCE_REFRESH_MS } from '../src/client/balance.ts'

const value = { isAvailable: true, balances: [{ currency: 'CNY', total: 12, granted: 2, toppedUp: 10 }] }
afterEach(() => { resetPlatformBalance(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('DeepSeek platform balance in Codex usage', () => {
  it('validates currency breakdowns and ignores malformed entries', () => {
    expect(platformBalanceOf({ ...value, balances: [null, { currency: 'USD', total: -1 }, ...value.balances] })).toEqual(value)
    expect(platformBalanceOf({ balances: [{ currency: 'CNY', total: '12.0', granted: '2.0', toppedUp: '10' }] })?.balances[0]?.total).toBe(12)
    expect(platformBalanceOf(null)).toBeNull()
    expect(balanceEntryOf(value, 'usd')?.currency).toBe('CNY')
    expect(balanceEntryOf(null, 'cny')).toBeNull()
  })
  it('uses the Codex-owned route and shares one TTL-cached read across surfaces', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true, value }))
    vi.stubGlobal('fetch', fetcher)
    const [left, right] = await Promise.all([fetchPlatformBalance(), fetchPlatformBalance()])
    expect(left).toEqual(value)
    expect(right).toEqual(value)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('/api/dsh-codex-connect/balance', expect.objectContaining({ method: 'POST' }))
  })
  it('refreshes while observed, keeps the last real balance on a failed read and stops after unmount', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ ok: true, value })).mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetcher)
    const changed = vi.fn()
    const unsubscribe = subscribePlatformBalance(changed)
    await vi.advanceTimersByTimeAsync(0)
    expect(platformBalanceSnapshot()).toEqual(value)
    expect(changed).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(PLATFORM_BALANCE_REFRESH_MS)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(platformBalanceSnapshot()).toEqual(value)
    unsubscribe()
    await vi.advanceTimersByTimeAsync(PLATFORM_BALANCE_REFRESH_MS * 2)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})
