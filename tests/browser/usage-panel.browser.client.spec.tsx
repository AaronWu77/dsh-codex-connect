import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { CodexUsageCapsule, CodexUsagePanel, CodexUsagePanelStore } from '../../src/client/CodexUsagePanel.tsx'
import { OpenAICodexAccountStore } from '../../src/client/account-store.ts'
import { resetPlatformBalance } from '../../src/client/balance.ts'
import { en, zh } from '../../src/client/locales.ts'
import { usageStyles, usageDialogStyles } from '../../src/client/usage-styles.ts'

let root: Root | undefined
let host: HTMLDivElement | undefined
let account: OpenAICodexAccountStore | undefined
let style: HTMLStyleElement | undefined
afterEach(() => { root?.unmount(); host?.remove(); style?.remove(); account?.dispose(); resetPlatformBalance(); vi.unstubAllGlobals() })

describe('Quota widget and usage dialog in Chromium', () => {
  it.each([['English', en], ['Chinese', zh]] as const)('preserves quota contents and fits narrow and desktop windows in %s', async (_locale, labels) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async url => String(url) === '/api/dsh-codex-connect/balance'
      ? Response.json({ ok: true, value: { isAvailable: true, balances: [{ currency: 'CNY', total: 42.5, granted: 2.5, toppedUp: 40 }] } })
      : Response.json({ status: 'signed-out', accounts: [] })))
    account = new OpenAICodexAccountStore()
    const panel = new CodexUsagePanelStore()
    const snapshot = { windows: [], accounts: [
      { accountKey: 'one', label: 'First account', active: true, windows: [{ bucketId: 'main', remainingPercent: 43, windowSeconds: 18000 }, { bucketId: 'main', remainingPercent: 82, windowSeconds: 604800 }] },
      { accountKey: 'two', label: 'Second account', active: false, windows: [{ bucketId: 'main', remainingPercent: 91, windowSeconds: 18000 }, { bucketId: 'main', remainingPercent: 95, windowSeconds: 604800 }] },
    ] }
    const quota = { snapshot: () => snapshot, subscribe: () => () => {} }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(Date.now())
    const sessions = { ids: ['main'], byId: { main: { projectionValues: { contextUsage: { timeZone: 'Asia/Shanghai', days: { [today]: { tokens: 12345, requests: 7, humanInputs: 1 } } } } } } }
    const injected = { t: (key: keyof typeof en, params?: Record<string, unknown>) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replaceAll('{' + name + '}', String(value)), labels[key] as string), account, panel, quota, useSessions: <T,>(selector: (value: unknown) => T) => selector(sessions) }
    style = document.createElement('style')
    style.textContent = usageStyles + usageDialogStyles + ':root { --dsw-alias-label-primary: #222; --dsw-alias-label-secondary: #555; --dsw-alias-label-tertiary: #666; --dsw-alias-bg-layer-1: #fff; --dsw-alias-bg-layer-2: #eee; --dsw-alias-border-l2: #ccc; --color-blue-500: #2563eb; }'
    document.head.append(style)
    host = document.createElement('div')
    host.style.width = '240px'
    document.body.append(host)
    root = createRoot(host)
    root.render(<><CodexUsageCapsule {...injected} wide /><CodexUsagePanel {...injected} /></>)
    await expect.element(page.getByText('¥42.50', { exact: true })).toBeVisible()
    await expect.element(page.getByText('12.3k', { exact: true })).toBeVisible()
    await expect.element(page.getByText('First account', { exact: true })).toBeVisible()
    await expect.element(page.getByText('Second account', { exact: true })).toBeVisible()
    for (const width of [1440, 390]) {
      await page.viewport(width, 900)
      await page.getByRole('button', { name: labels['ov.entry'], exact: true }).click()
      const dialog = page.getByRole('dialog', { name: labels.usagePanelTitle, exact: true })
      await expect.element(dialog).toBeVisible()
      const box = (await dialog.element()).getBoundingClientRect()
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(width)
      const element = await dialog.element()
      expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth + 1)
      await userEvent.keyboard('{Escape}')
      await expect.element(dialog).not.toBeInTheDocument()
    }
    await page.viewport(960, 800)
    await page.getByRole('button', { name: labels['ov.entry'], exact: true }).click()
    await expect.element(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: labels.close, exact: true }).click()
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
    await page.screenshot({ path: '.tmp/usage-migration/widget-' + _locale + '.png' })
  })
})
