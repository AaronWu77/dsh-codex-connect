import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BALANCE_ROUTE, balanceOfPayload, resetBalance, setBalanceFetcher, watchBalanceChannel } from '../src/balance-route.ts'

let ctx: Context | undefined
afterEach(async () => { await ctx?.fiber.dispose(); ctx = undefined; resetBalance(); setBalanceFetcher(null) })
const platform = (total: number) => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: String(total), granted_balance: '2', topped_up_balance: String(total - 2) }] })

async function fixture() {
  let section = { apiKeyEnv: 'FIRST_KEY', baseURL: 'https://api.deepseek.com' }
  let handler: (() => Promise<Response>) | undefined
  const removed = vi.fn()
  ctx = new Context()
  ctx.provide('settings', { describe: () => [{ ns: 'llm-deepseek', value: section }] })
  ctx.provide('credentials', { resolve: async (ref: string) => ({ value: 'test-' + ref }) })
  ctx.provide('connection', { fetch: { register: (route: { path: string; methods: string[]; fetch: () => Promise<Response> }) => {
    expect(route.path).toBe(BALANCE_ROUTE)
    expect(route.methods).toEqual(['POST'])
    handler = route.fetch
    return removed
  } } })
  await ctx.plugin({ name: 'balance-route-test', apply: watchBalanceChannel })
  await vi.waitFor(() => expect(handler).toBeDefined())
  return {
    read: async () => { if (!handler) throw new Error('route absent'); return (await handler()).json() as Promise<{ ok: boolean; value: { balances: { total: number }[] } | null }> },
    changeCredential: () => { section = { ...section, apiKeyEnv: 'SECOND_KEY' } }, removed,
  }
}

describe('Codex-owned DeepSeek platform balance route', () => {
  it('decodes DeepSeek balance amounts without interpreting Codex credits as money', () => {
    expect(balanceOfPayload(platform(42))).toEqual({ isAvailable: true, balances: [{ currency: 'CNY', total: 42, granted: 2, toppedUp: 40 }] })
    expect(balanceOfPayload({ credits: { balance: '999' } })).toBeNull()
    expect(balanceOfPayload({ balance_infos: [null, { currency: 'CNY', total_balance: '-1' }] })).toBeNull()
  })
  it('deduplicates reads for one credential and withdraws the route on disposal', async () => {
    const fetcher = vi.fn(async () => Response.json(platform(42)))
    setBalanceFetcher(fetcher)
    const f = await fixture()
    expect(await Promise.all([f.read(), f.read()])).toEqual([
      { ok: true, value: balanceOfPayload(platform(42)) }, { ok: true, value: balanceOfPayload(platform(42)) },
    ])
    expect(fetcher).toHaveBeenCalledTimes(1)
    await ctx!.fiber.dispose()
    ctx = undefined
    expect(f.removed).toHaveBeenCalledTimes(1)
  })
  it('does not share an in-flight balance across a credential change', async () => {
    let finishFirst: (value: Response) => void = () => { throw new Error('first read not started') }
    const firstPending = new Promise<Response>(resolve => { finishFirst = resolve })
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => new Headers(init.headers).get('authorization') === 'Bearer test-FIRST_KEY'
      ? firstPending : Response.json(platform(90)))
    setBalanceFetcher(fetcher)
    const f = await fixture()
    const first = f.read()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    f.changeCredential()
    const second = await f.read()
    expect(second.value?.balances[0]?.total).toBe(90)
    finishFirst(Response.json(platform(42)))
    expect((await first).value?.balances[0]?.total).toBe(42)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
