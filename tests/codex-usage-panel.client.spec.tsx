// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodexUsageCapsule, CodexUsagePanel, CodexUsagePanelStore, LocalUsageNotice } from '../src/client/CodexUsagePanel.tsx'
import type { CodexUsageInjected } from '../src/client/CodexUsagePanel.tsx'
import type { LocalUsageSnapshot } from '../src/client/usage-ledger.ts'
import { LocalUsageStore } from '../src/client/usage-warmup.ts'
import { RecentRequestsStore } from '../src/client/recent-requests.ts'
import { CodexManagementOverview } from '../src/client/CodexManagementOverview.tsx'
import { OpenAICodexAccountStore } from '../src/client/account-store.ts'
import { resetPlatformBalance } from '../src/client/balance.ts'
import { en, zh } from '../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../src/client/locales.ts'
import { usageStyles, usageDialogStyles } from '../src/client/usage-styles.ts'

const t = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll('{' + name + '}', String(replacement))
  return value
}
let account: OpenAICodexAccountStore
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/dsh-codex-connect/balance'
    ? Response.json({ ok: true, value: { isAvailable: true, balances: [{ currency: 'CNY', total: 42.5, granted: 2.5, toppedUp: 40 }] } })
    : Response.json({ status: 'signed-out' })))
  account = new OpenAICodexAccountStore()
})
afterEach(() => { cleanup(); account.dispose(); resetPlatformBalance(); vi.unstubAllGlobals() })
function props(): CodexUsageInjected {
  const quota = { windows: [], accounts: [
    { accountKey: 'acct_one', label: 'First account', active: true, windows: [
      { bucketId: 'main', remainingPercent: 76, windowSeconds: 18000 },
      { bucketId: 'model', remainingPercent: 43, windowSeconds: 18000 },
      { bucketId: 'main', remainingPercent: 82, windowSeconds: 604800 },
    ] },
    { accountKey: 'acct_two', label: 'Second account', active: false, windows: [
      { bucketId: 'main', remainingPercent: 91, windowSeconds: 18000 },
      { bucketId: 'main', remainingPercent: 95, windowSeconds: 604800 },
    ] },
  ] }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(Date.now())
  const usageSnapshot = { state: 'ready' as const, data: {
    timeZone: 'Asia/Shanghai', days: { [today]: { tokens: 12345, requests: 7, sessions: 1 } } } }
  const localUsage = { snapshot: () => usageSnapshot, subscribe: () => () => {}, retry: vi.fn() }
  return { t, account, quota: { snapshot: () => quota, subscribe: () => () => {} }, panel: new CodexUsagePanelStore(),
    localUsage, recent: new RecentRequestsStore(), wide: true }
}

describe('Codex-owned quota widget', () => {
  it.each([['English', en], ['Chinese', zh]] as const)('shows the actionable usage failure (%s)', (_language, messages) => {
    const localized = (key: OpenAICodexSettingsKey) => messages[key]
    const known = props().localUsage!.snapshot().data!
    const usage: LocalUsageSnapshot = { state: 'failed', data: known }
    const source = { snapshot: () => usage, subscribe: () => () => {}, retry: vi.fn() }
    const { container } = render(<LocalUsageNotice t={localized} usage={usage} source={source} />)
    expect(screen.getByRole('status').textContent).toBe(messages['ov.local.failed'])
    if (_language === 'English') expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="cc-codex-empty"
      >
        <div
          role="status"
        >
          Could not update usage
        </div>
        <button
          class="cc-usage-quota-detail-action"
          type="button"
        >
          Retry
        </button>
      </div>
    `)
    fireEvent.click(screen.getByRole('button', { name: messages['ov.local.retry'] }))
    expect(source.retry).toHaveBeenCalledTimes(1)
  })
  it('keeps DeepSeek balance, today tokens and both accounts in the original compact arrangement', async () => {
    const injected = props()
    const { container } = render(<CodexUsageCapsule {...injected} />)
    await screen.findByText('¥42.50')
    expect(screen.getByText('12.3k')).toBeDefined()
    expect(container.firstChild).toMatchSnapshot()
    expect([...container.querySelectorAll('.cc-usage-quota-compact > button')].map(button => button.textContent)).toEqual([
      'Balance¥42.50granted 2.50 · topped up 40.00',
      'Today12.3kTokens Used',
      '#1First account5h43%7d82%',
      '#2Second account5h91%7d95%',
    ])
    expect(screen.getByText('First account')).toBeDefined()
    expect(screen.getByText('Second account')).toBeDefined()
    expect(screen.getByText('43%')).toBeDefined()
    expect(container.querySelectorAll('.cc-usage-quota-account')).toHaveLength(2)
    fireEvent.click(screen.getByText('Balance'))
    expect(screen.getByText('¥2.50')).toBeDefined()
    expect(screen.getByText('¥40.00')).toBeDefined()
    expect(injected.panel.snapshot()).toBe(false)
    fireEvent.click(screen.getByText(en['ov.entry']))
    expect(injected.panel.snapshot()).toBe(true)
  })
  it('keeps the collapsed icon entry and keyboard activation', () => {
    const injected = props()
    const { rerender } = render(<CodexUsageCapsule {...injected} wide={false} />)
    fireEvent.click(screen.getByRole('button', { name: en['ov.entry'] }))
    expect(injected.panel.snapshot()).toBe(true)
    injected.panel.close()
    rerender(<CodexUsageCapsule {...injected} />)
    fireEvent.keyDown(screen.getByRole('button', { name: en['ov.entry'] }), { key: 'Enter' })
    expect(injected.panel.snapshot()).toBe(true)
  })
  it('opens a body-portaled dialog with Escape dismissal, independent of Context', async () => {
    const injected = props()
    injected.panel.show()
    render(<CodexUsagePanel {...injected} />)
    expect(screen.getByRole('dialog', { name: 'Quota & usage' })).toBeDefined()
    await screen.findByText('¥42.50')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it.each([
    ['English', en, 'Local session usage (all models, not account billing)'],
    ['Chinese', zh, '本地会话用量（全部模型，不是账号账单）'],
  ] as const)('omits the local scope line in all usage views (%s)', (_language, messages, scope) => {
    const localized = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => {
      let value: string = messages[key]
      for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll('{' + name + '}', String(replacement))
      return value
    }
    const injected = props()
    injected.panel.show()
    const { container } = render(<><CodexUsageCapsule {...injected} t={localized} /><CodexUsagePanel {...injected} t={localized} />
      <CodexManagementOverview t={localized} quota={injected.quota} localUsage={injected.localUsage!} /></>)
    const capsule = within(container).getByRole('button', { name: messages['ov.entry'] })
    const dialog = screen.getByRole('dialog', { name: messages.usagePanelTitle })
    const management = within(container).getByRole('region', { name: messages['ov.quota.platform'] })
    for (const view of [capsule, dialog, management]) {
      expect(within(view).queryByText(scope)).toBeNull()
      expect(within(view).getByText(messages['ov.kpi.tokens'])).toBeDefined()
      expect(within(view).getByText('12.3k')).toBeDefined()
    }
    expect(within(dialog).getByText(localized('ov.quota.remaining', { p: 43 }))).toBeDefined()
    fireEvent.click(within(dialog).getByText(messages['ov.quota.today']))
    const details = within(dialog).getByRole('group', { name: messages['ov.quota.today'] })
    expect(within(details).getByText(messages['ov.kpi.tokens'])).toBeDefined()
    expect(within(details).getByText('12.3k')).toBeDefined()
    expect(within(details).getByText(messages['ov.quota.detail.sessions'])).toBeDefined()
    expect(within(details).getByText('1')).toBeDefined()
    expect(within(details).getByText(messages['ov.quota.detail.requests'])).toBeDefined()
    expect(within(details).getByText('7')).toBeDefined()
  })
  it.each([['English', en], ['Chinese', zh]] as const)(
    'keeps every non-failure state silent in every view without losing figures (%s)', (_language, messages) => {
      const localized = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => {
        let value: string = messages[key]
        for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll('{' + name + '}', String(replacement))
        return value
      }
      const injected = props()
      const known = injected.localUsage!.snapshot().data!
      const snapshots: LocalUsageSnapshot[] = [
        { state: 'loading', data: null },
        { state: 'loading', data: known },
        { state: 'ready', data: known },
        { state: 'unavailable', data: known },
        { state: 'failed', data: known },
      ]
      const listeners = new Set<() => void>()
      let snapshot = snapshots[0]!
      const retry = vi.fn()
      const localUsage = { snapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }, retry }
      const publish = (next: LocalUsageSnapshot): void => { act(() => { snapshot = next; for (const listener of listeners) listener() }) }
      injected.panel.show()
      const { container } = render(<><CodexUsageCapsule {...injected} t={localized} localUsage={localUsage} />
        <CodexUsagePanel {...injected} t={localized} localUsage={localUsage} />
        <CodexManagementOverview t={localized} quota={injected.quota} localUsage={localUsage} /></>)
      const capsule = within(container).getByRole('button', { name: messages['ov.entry'] })
      const dialog = screen.getByRole('dialog', { name: messages.usagePanelTitle })
      const management = within(container).getByRole('region', { name: messages['ov.quota.platform'] })
      // Loading is the only silent state that shows no figure; every other one keeps them.
      for (const value of [snapshots[1]!, snapshots[2]!]) {
        publish(value)
        for (const view of [capsule, dialog, management]) {
          expect(within(view).queryByRole('button', { name: messages['ov.local.retry'] })).toBeNull()
          expect(within(view).getByText('12.3k')).toBeDefined()
        }
      }
      publish(snapshots[0]!)
      for (const view of [capsule, dialog, management]) expect(within(view).queryByText('12.3k')).toBeNull()
      // Unavailable and failed keep the known days and surface the retry affordance.
      for (const value of [snapshots[3]!, snapshots[4]!]) {
        publish(value)
        for (const view of [capsule, dialog, management]) expect(within(view).getByText('12.3k')).toBeDefined()
      }
    },
  )


  it.each([['English', en], ['Chinese', zh]] as const)(
    'shows actionable failures with retry while retaining figures (%s)', (_language, messages) => {
      const localized = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => {
        let value: string = messages[key]
        for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll('{' + name + '}', String(replacement))
        return value
      }
      const injected = props()
      const known = injected.localUsage!.snapshot().data!
      const failures: Array<{ snapshot: LocalUsageSnapshot; message: string }> = [
        { snapshot: { state: 'failed', data: known }, message: messages['ov.local.failed'] },
        { snapshot: { state: 'failed', data: null }, message: messages['ov.local.failed'] },
        { snapshot: { state: 'unavailable', data: known }, message: messages['ov.local.unavailable'] },
        { snapshot: { state: 'unavailable', data: null }, message: messages['ov.local.unavailable'] },
        { snapshot: { state: 'failed', data: known, failure: 'request' }, message: messages['ov.local.failed'] },
      ]
      const listeners = new Set<() => void>()
      let snapshot = failures[0]!.snapshot
      const retry = vi.fn()
      const localUsage = { snapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }, retry }
      const publish = (next: LocalUsageSnapshot): void => { act(() => { snapshot = next; for (const listener of listeners) listener() }) }
      injected.panel.show()
      const { container } = render(<><CodexUsageCapsule {...injected} t={localized} localUsage={localUsage} />
        <CodexUsagePanel {...injected} t={localized} localUsage={localUsage} />
        <CodexManagementOverview t={localized} quota={injected.quota} localUsage={localUsage} /></>)
      const capsule = within(container).getByRole('button', { name: messages['ov.entry'] })
      const dialog = screen.getByRole('dialog', { name: messages.usagePanelTitle })
      const management = within(container).getByRole('region', { name: messages['ov.quota.platform'] })
      for (const failure of failures) {
        publish(failure.snapshot)
        retry.mockClear()
        for (const view of [capsule, dialog, management]) {
          expect(within(view).getByText(failure.message)).toBeDefined()
          if (failure.snapshot.data === null) expect(within(view).queryByText('12.3k')).toBeNull()
          else expect(within(view).getByText('12.3k')).toBeDefined()
        }
        expect(within(capsule).queryByRole('button', { name: messages['ov.local.retry'] })).toBeNull()
        fireEvent.click(within(dialog).getByRole('button', { name: messages['ov.local.retry'] }))
        fireEvent.click(within(management).getByRole('button', { name: messages['ov.local.retry'] }))
        expect(retry).toHaveBeenCalledTimes(2)
        expect(within(dialog).getByText(localized('ov.quota.remaining', { p: 43 }))).toBeDefined()
      }
    },
  )
  it.each([['English', en], ['Chinese', zh]] as const)(
    'omits unavailable notices when no local usage source exists (%s)', (_language, messages) => {
      const localized = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => {
        let value: string = messages[key]
        for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll('{' + name + '}', String(replacement))
        return value
      }
      const { localUsage: _omitted, ...injected } = props()
      injected.panel.show()
      const { container } = render(<><CodexUsageCapsule {...injected} t={localized} />
        <CodexUsagePanel {...injected} t={localized} /><CodexManagementOverview t={localized} quota={injected.quota} /></>)
      const capsule = within(container).getByRole('button', { name: messages['ov.entry'] })
      const dialog = screen.getByRole('dialog', { name: messages.usagePanelTitle })
      const management = within(container).getByRole('region', { name: messages['ov.quota.platform'] })
      for (const view of [capsule, dialog, management]) {
        expect(within(view).queryByText(messages['ov.local.unavailable'])).toBeNull()
        expect(within(view).queryByText(messages['ov.local.failed'])).toBeNull()
        expect(within(view).queryByRole('button', { name: messages['ov.local.retry'] })).toBeNull()
      }
      expect(within(dialog).getAllByRole('status').length).toBeGreaterThan(0)
      expect(within(dialog).getByText(localized('ov.quota.remaining', { p: 43 }))).toBeDefined()
    },
  )

  it('renders a reported zero day but never invents one', () => {
    const injected = props()
    const listeners = new Set<() => void>()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(Date.now())
    let snapshot: LocalUsageSnapshot = { state: 'loading', data: { timeZone: 'UTC', days: {} } }
    const localUsage = { snapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }, retry: vi.fn() }
    render(<CodexManagementOverview t={t} quota={injected.quota} localUsage={localUsage} />)
    const publish = (next: LocalUsageSnapshot): void => {
      act(() => { snapshot = next; for (const listener of listeners) listener() })
    }
    // Loading and an empty ledger both leave the today card out.
    expect(screen.queryByText('0')).toBeNull()
    publish({ state: 'ready', data: { timeZone: 'UTC', days: {} } })
    expect(screen.queryByText('0')).toBeNull()
    // A day that recorded requests but no tokens is a real zero, so it renders.
    publish({ state: 'ready', data: { timeZone: 'UTC', days: { [today]: { tokens: 0, requests: 1, sessions: 1 } } } })
    expect(screen.getByText('0')).toBeDefined()
    expect(screen.getByText(en['ov.quota.today'])).toBeDefined()
  })

  it('hides every local notice when no local usage source is supplied', () => {
    const injected = props()
    render(<CodexManagementOverview t={t} quota={injected.quota} />)
    expect(screen.queryByText(en['ov.local.unavailable'])).toBeNull()
    expect(screen.queryByText(en['ov.local.failed'])).toBeNull()
    expect(screen.queryByRole('button', { name: en['ov.local.retry'] })).toBeNull()
    expect(screen.getByText('43% left')).toBeDefined()
  })

  it('reads the merged ledger straight off the Session list without any usage request', async () => {
    const originalFetch = globalThis.fetch
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(Date.now())
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => {
      calls.push(String(url))
      if (String(url).startsWith('/api/dsh-codex-connect/local-usage')) return Promise.resolve(new Response('', { status: 404 }))
      return originalFetch(url, init)
    }))
    const list = {
      getSnapshot: () => ({ ids: ['a'], byId: { a: { blank: false, projectionValues: {
        codexConnectUsage: { timeZone: 'Asia/Shanghai', days: { [today]: { tokens: 4321, requests: 2 } } } } } } }),
      subscribe: () => () => {},
    }
    const { LocalUsageStore } = await import('../src/client/usage-warmup.ts')
    const store = new LocalUsageStore({ sessions: { list, refresh: async () => {} } } as never)
    try {
      const unsubscribe = store.subscribe(() => {})
      await waitFor(() => { expect(store.snapshot().state).toBe('ready') })
      expect(store.snapshot().data?.days[today]).toEqual({ tokens: 4321, requests: 2, sessions: 1 })
      expect(store.snapshot().data?.timeZone).toBe('Asia/Shanghai')
      unsubscribe()
    } finally { await store.dispose() }
  })

  it('reports unavailable when the warm-up routes are absent', async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => {
      if (String(url).startsWith('/api/dsh-codex-connect/local-usage')) return Promise.resolve(new Response('', { status: 404 }))
      return originalFetch(url, init)
    }))
    const list = { getSnapshot: () => ({ ids: [], byId: {} }), subscribe: () => () => {} }
    const store = new LocalUsageStore({ sessions: { list, refresh: async () => {} } } as never)
    try {
      const unsubscribe = store.subscribe(() => {})
      await waitFor(() => { expect(store.snapshot().state).toBe('unavailable') })
      unsubscribe()
    } finally { await store.dispose() }
  })
})