import { useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { OPENAI_CODEX_AUTH_STATUS_PATH } from '../../src/auth-paths.ts'
import { OPENAI_CODEX_QUOTA_PATH } from '../../src/quota-contract.ts'
import { OpenAICodexAccountStore, type AccountSummary } from '../../src/client/account-store.ts'
import { AccountReadiness } from '../../src/client/AccountReadiness.tsx'
import { AccountUsage, type OpenAICodexSettingsInjected } from '../../src/client/OpenAICodexSettings.tsx'
import { createCodexQuotaService, type CodexQuotaService } from '../../src/client/quota-service.ts'
import { en, zh } from '../../src/client/locales.ts'

const ACTIVE_KEY = `acct_${'a'.repeat(43)}`
const OTHER_KEY = `acct_${'b'.repeat(43)}`
const ADDED_KEY = `acct_${'c'.repeat(43)}`
const active: AccountSummary = { accountKey: ACTIVE_KEY, active: true, displayName: 'AaronWu', profileSource: 'oauth' }
const other: AccountSummary = { accountKey: OTHER_KEY, active: false, displayName: 'AUUUUUCH', profileSource: 'oauth' }
const added: AccountSummary = { accountKey: ADDED_KEY, active: false, displayName: 'Added account', profileSource: 'oauth' }

function usage(remainingPercent: number) {
  return { rateLimits: [{ id: 'codex', windows: [{ remainingPercent, windowSeconds: 18_000 }] }] }
}

/** The real settings usage renderer observes the same stores as readiness. */
function ObservedUsage({ account, quota, t }: { account: OpenAICodexAccountStore; quota: CodexQuotaService; t: OpenAICodexSettingsInjected['t'] }) {
  const state = useSyncExternalStore(account.subscribe, account.getSnapshot)
  const figures = useSyncExternalStore(quota.subscribe, quota.snapshot)
  return figures === null ? null : <AccountUsage accounts={state.accounts} quota={figures} t={t} />
}

let root: Root | undefined
let host: HTMLDivElement | undefined
let account: OpenAICodexAccountStore | undefined
let pending: Promise<Response>[] = []
afterEach(async () => {
  root?.unmount()
  account?.dispose()
  await Promise.allSettled(pending)
  host?.remove()
  root = undefined
  host = undefined
  account = undefined
  pending = []
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Quota startup through the real browser account store', () => {
  it.each([['English', en], ['Chinese', zh]] as const)('loads every saved account after deferred status without switching defaults: %s', async (_locale, labels) => {
    let summaries = [active, other]
    let releaseStatus: (() => void) | undefined
    let firstStatus = true
    const requests: { path: string; method: string }[] = []
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const method = init?.method ?? 'GET'
      requests.push({ path, method })
      if (method !== 'GET') throw new Error(`Unexpected account mutation: ${method} ${path}`)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) {
        if (!firstStatus) return Response.json({ status: 'signed-in', accounts: summaries, usage: usage(92) })
        firstStatus = false
        const signal = init?.signal
        if (signal === undefined || signal === null) throw new Error('Status request requires cancellation')
        const response = new Promise<Response>((resolve, reject) => {
          const abort = (): void => { reject(signal.reason) }
          signal.addEventListener('abort', abort, { once: true })
          releaseStatus = () => {
            signal.removeEventListener('abort', abort)
            resolve(Response.json({ status: 'signed-in', accounts: summaries, usage: usage(92) }))
          }
          if (signal.aborted) abort()
        })
        pending.push(response)
        return response
      }
      if (path === OPENAI_CODEX_QUOTA_PATH) return Response.json({ accounts: summaries.filter(summary => !summary.active).map(summary => ({
        accountKey: summary.accountKey, usage: usage(summary.accountKey === OTHER_KEY ? 41 : 73),
      })) })
      throw new Error(`Unexpected HTTP endpoint: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    account = new OpenAICodexAccountStore()
    const store = account
    const quota = createCodexQuotaService(store)
    const t: OpenAICodexSettingsInjected['t'] = (key, params) => Object.entries(params ?? {}).reduce(
      (text, [name, value]) => text.replaceAll('{' + name + '}', String(value)), labels[key],
    )
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<><AccountReadiness account={store} quota={quota} t={t} navigate={() => {}} /><ObservedUsage account={store} quota={quota} t={t} /></>)

    await expect.element(page.getByText(labels.usageNoData, { exact: true })).toBeVisible()
    await vi.waitFor(() => { expect(releaseStatus).toBeTypeOf('function') })
    expect(store.getSnapshot()).toMatchObject({ status: { status: 'loading' }, accounts: [] })
    expect(requests).toEqual([{ path: OPENAI_CODEX_AUTH_STATUS_PATH, method: 'GET' }])

    releaseStatus!()
    const otherReadiness = page.getByRole('listitem').filter({ hasText: 'AUUUUUCH' })
    await expect.element(otherReadiness.getByText(labels.readinessObserved, { exact: true })).toBeVisible()
    const percent41 = t('percentRemaining', { percent: '41' })
    await expect.element(page.getByText(`${labels.fiveHourLimit} ${percent41}`, { exact: true })).toBeVisible()
    await expect.element(page.getByText(labels.readinessUnknown, { exact: true })).not.toBeInTheDocument()
    await expect.element(page.getByText(labels.usageNoData, { exact: true })).not.toBeInTheDocument()
    await expect.element(page.getByRole('listitem').filter({ hasText: 'AaronWu' }).getByText(labels.usingAccount, { exact: true })).toBeVisible()
    expect(requests.filter(request => request.path === OPENAI_CODEX_QUOTA_PATH)).toHaveLength(1)
    expect(store.getSnapshot().accounts.find(summary => summary.active)?.accountKey).toBe(ACTIVE_KEY)

    summaries = [active, other, added]
    await store.refresh()
    await expect.element(page.getByRole('listitem').filter({ hasText: 'Added account' }).getByText(labels.readinessObserved, { exact: true })).toBeVisible()
    await expect.element(page.getByText(`${labels.fiveHourLimit} ${t('percentRemaining', { percent: '73' })}`, { exact: true })).toBeVisible()
    expect(requests.filter(request => request.path === OPENAI_CODEX_QUOTA_PATH)).toHaveLength(2)
    expect(requests.every(request => request.method === 'GET')).toBe(true)
    expect(store.getSnapshot().accounts.find(summary => summary.active)?.accountKey).toBe(ACTIVE_KEY)
  })
})
