import { vi } from 'vitest'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { OpenAICodexAccountStore } from '../src/client/account-store.ts'
import type { AccountSummary } from '../src/client/account-store.ts'
import { DEFAULT_OPENAI_CODEX_SETTINGS } from '../src/settings-contract.ts'
import type { OpenAICodexSettingsConfig } from '../src/settings-contract.ts'
import { en } from '../src/client/locales.ts'
import { modelCatalogFixture } from './model-catalog-fixture.ts'
import * as paths from '../src/auth-paths.ts'
import * as models from '../src/model-contract.ts'

/** Local fake server and revisioned form shared by DOM and Chromium tests. */
export function managementFixture(messages: Record<keyof typeof en, string> = en, writable = true) {
  const first = 'acct_' + 'a'.repeat(43)
  const second = 'acct_' + 'b'.repeat(43)
  let accounts: AccountSummary[] = [
    { accountKey: first, active: true, displayName: 'Work account', profileSource: 'oauth' },
    { accountKey: second, active: false, displayName: 'Personal account', profileSource: 'oauth' },
  ]
  let authorizing = false
  let snapshot: ConfigFormSnapshot<OpenAICodexSettingsConfig> = {
    status: 'ready', value: { ...DEFAULT_OPENAI_CODEX_SETTINGS }, base: { ...DEFAULT_OPENAI_CODEX_SETTINGS },
    user: undefined, revision: 0, writable, mode: 'host',
  }
  let rejectSave = false
  const listeners = new Set<() => void>()
  const mutate = vi.fn<ConfigForm<OpenAICodexSettingsConfig>['mutate']>(async (ops, revision) => {
    if (rejectSave) throw new Error('save refused')
    if (!snapshot.writable || revision !== snapshot.revision) throw new Error('revision conflict')
    const next = { ...snapshot.value! }
    for (const op of ops) Object.assign(next, { [String(op.path[0])]: op.op === 'set' ? op.value : undefined })
    snapshot = { ...snapshot, value: next, revision: (snapshot.revision ?? 0) + 1 }
    for (const listener of listeners) listener()
    return true
  })
  const scope: ConfigForm<OpenAICodexSettingsConfig> = {
    getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    mutate, set: async () => { throw new Error('Use atomic mutate') }, unset: async () => true,
  }
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const path = url.pathname
    if (path === models.OPENAI_CODEX_MODEL_CATALOG_PATH) {
      const key = url.searchParams.get('accountKey')
      return Response.json(modelCatalogFixture(key === second
        ? [{ id: 'personal-model', name: 'Personal model' }]
        : [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }, { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }])
        .map(model => ({ ...model, available: key === second ? false : true })))
    }
    if (path === models.OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH || path === models.OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH) return Response.json({ source: 'live', clientVersion: '0.159.0', modelCount: 2, unavailableModels: [] })
    if (path === '/api/dsh-codex-connect/balance') return Response.json({ ok: true, value: { isAvailable: true, balances: [{ currency: 'CNY', total: 42.5, granted: 2.5, toppedUp: 40 }] } })
    if (path === paths.OPENAI_CODEX_AUTH_LOGIN_PATH) { authorizing = true; return Response.json({ url: 'https://auth.openai.com/authorize' }) }
    if (path === paths.OPENAI_CODEX_AUTH_CANCEL_PATH) { authorizing = false; return Response.json({ ok: true }) }
    if (path === paths.OPENAI_CODEX_AUTH_ACCOUNTS_PATH) {
      if (init?.method === 'POST' || init?.method === 'DELETE') {
        const body = JSON.parse(String(init.body)) as { accountKey: string; replacementAccountKey?: string }
        if (init.method === 'DELETE') accounts = accounts.filter(account => account.accountKey !== body.accountKey)
        const activeKey = init.method === 'POST' ? body.accountKey : body.replacementAccountKey ?? accounts.find(account => account.active)?.accountKey
        accounts = accounts.map(account => ({ ...account, active: account.accountKey === activeKey }))
      }
      return Response.json({ accounts })
    }
    if (path === paths.OPENAI_CODEX_AUTH_STATUS_PATH) return Response.json({ status: authorizing ? 'signing-in' : accounts.length ? 'signed-in' : 'signed-out', usage: { rateLimits: [] }, accounts })
    throw new Error('Unexpected network request: ' + path)
  })
  vi.stubGlobal('fetch', fetcher)
  const account = new OpenAICodexAccountStore()
  const quotaSnapshot = { windows: [], accounts: accounts.map(item => ({ accountKey: item.accountKey, label: item.displayName, active: item.active, windows: [{ bucketId: 'main', windowSeconds: 18000, remainingPercent: 75 }] })) }
  const quota = { snapshot: () => quotaSnapshot, subscribe: () => () => {} }
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(Date.now())
  const sessions = { ids: ['main'], byId: { main: { projectionValues: { contextUsage: { timeZone: 'Asia/Shanghai', days: { [day]: { tokens: 12345, requests: 7 } } } } } } }
  const props = {
    t: (key: keyof typeof en, params?: Record<string, unknown>) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replaceAll('{' + name + '}', String(value)), messages[key]),
    configScope: scope, account, quota,
    useSessions: vi.fn((selector: (value: typeof sessions) => unknown) => selector(sessions)) as never, useSessionStatus: vi.fn() as never,
    useSessionRetainInfo: vi.fn() as never, useWorkspaces: vi.fn() as never, usePanelInfo: vi.fn() as never,
  }
  return { props, account, scope, mutate, fetcher, first, second, rejectSaves: () => { rejectSave = true } }
}
