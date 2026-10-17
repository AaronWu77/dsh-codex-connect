// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodexUsageCapsule, CodexUsagePanel, CodexUsagePanelStore } from '../src/client/CodexUsagePanel.tsx'
import type { CodexUsageInjected } from '../src/client/CodexUsagePanel.tsx'
import { OpenAICodexAccountStore } from '../src/client/account-store.ts'
import { resetPlatformBalance } from '../src/client/balance.ts'
import { en } from '../src/client/locales.ts'
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
  const snapshot = { ids: ['session'], byId: { session: { projectionValues: { contextUsage: {
    timeZone: 'Asia/Shanghai', days: { [today]: { tokens: 12345, requests: 7, humanInputs: 1 } },
  } } } } }
  return { t, account, quota: { snapshot: () => quota, subscribe: () => () => {} }, panel: new CodexUsagePanelStore(),
    useSessions: selector => selector(snapshot), wide: true }
}

describe('Codex-owned quota widget', () => {
  it('keeps DeepSeek balance, today tokens and both accounts in the original compact arrangement', async () => {
    const injected = props()
    const { container } = render(<CodexUsageCapsule {...injected} />)
    await screen.findByText('¥42.50')
    expect(screen.getByText('12.3k')).toBeDefined()
    expect(container.firstChild).toMatchSnapshot()
    expect(screen.getByText('First account')).toBeDefined()
    expect(screen.getByText('Second account')).toBeDefined()
    expect(screen.getByText('43%')).toBeDefined()
    expect(container.querySelectorAll('.cc-usage-quota-account')).toHaveLength(2)
    fireEvent.click(screen.getByText('Balance'))
    expect(screen.getByText('¥2.50')).toBeDefined()
    expect(screen.getByText('¥40.00')).toBeDefined()
    expect(injected.panel.snapshot()).toBe(false)
    fireEvent.click(screen.getByText('Quota & Usage'))
    expect(injected.panel.snapshot()).toBe(true)
  })
  it('keeps the collapsed icon entry and keyboard activation', () => {
    const injected = props()
    const { rerender } = render(<CodexUsageCapsule {...injected} wide={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quota & Usage' }))
    expect(injected.panel.snapshot()).toBe(true)
    injected.panel.close()
    rerender(<CodexUsageCapsule {...injected} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Quota & Usage' }), { key: 'Enter' })
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
  it('pins migrated layout and responsive dialog styles', () => {
    expect(usageStyles).toContain('.cc-usage-widget {')
    expect(usageStyles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(usageStyles).toContain('backdrop-filter: blur(18px) saturate(150%)')
    expect(usageDialogStyles).toContain('calc(100vw - 32px)')
  })
})
