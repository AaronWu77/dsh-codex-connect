// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICodexPluginCard } from '../src/client/OpenAICodexPluginCard.tsx'
import { en, zh } from '../src/client/locales.ts'
import { resetPlatformBalance } from '../src/client/balance.ts'
import { managementFixture } from './management-fixture.ts'
import { OPENAI_CODEX_AUTH_ACCOUNTS_PATH, OPENAI_CODEX_AUTH_LOGIN_PATH } from '../src/auth-paths.ts'
let fixture: ReturnType<typeof managementFixture> | undefined
afterEach(() => { cleanup(); fixture?.account.dispose(); resetPlatformBalance(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function start(messages = en, writable = true) {
  fixture = managementFixture(messages, writable)
  render(<OpenAICodexPluginCard {...fixture.props} />)
  return fixture
}

describe('Codex management center', () => {
  it.each([en, zh])('opens the shared usage overview without a second disclosure card', async labels => {
    start(labels)
    await screen.findByText('¥42.50')
    expect(screen.getByText('12.3k')).toBeDefined()
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect({ tabs: screen.getAllByRole('tab').map(tab => tab.textContent), overview: screen.getByRole('tabpanel', { name: labels.managementOverview }).textContent }).toMatchSnapshot()
    expect(screen.getByRole('tab', { name: labels.managementOverview }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('button', { name: new RegExp(labels.expand) })).toBeNull()
    expect(screen.queryByRole('button', { name: labels.save })).toBeNull()
  })
  it.each([en, zh])('navigates from readiness to manual account management without changing credentials or model choices', async labels => {
    const f = start(labels)
    await screen.findByText(labels.readinessManualOnly)
    fireEvent.click(screen.getByRole('button', { name: labels.readinessManage }))
    expect(screen.getByRole('tab', { name: labels.managementAccounts }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: labels.managementAccounts }))
    expect(f.account.getSnapshot().accounts.find(account => account.active)?.accountKey).toBe(f.first)
    expect(f.mutate).not.toHaveBeenCalled()
    expect(f.fetcher.mock.calls.filter(([url, init]) => String(url) === OPENAI_CODEX_AUTH_ACCOUNTS_PATH && (init?.method === 'POST' || init?.method === 'DELETE'))).toHaveLength(0)
  })
  it('keeps drafts across all tabs and applies only an explicit save', async () => {
    const f = start()
    fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
    const sol = await screen.findByRole('checkbox', { name: /GPT-5.6 Sol/ })
    fireEvent.click(sol)
    fireEvent.click(screen.getByRole('tab', { name: en.networkModule }))
    fireEvent.click(screen.getByRole('tab', { name: en.capabilitiesModule }))
    fireEvent.click(screen.getByRole('tab', { name: en.managementOverview }))
    expect(f.mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: en.save })).toBeDefined()
    expect(screen.getByText(en.managementUnsaved)).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
    expect((screen.getByRole('checkbox', { name: /GPT-5.6 Sol/ }) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('tab', { name: en.managementOverview }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    await waitFor(() => expect(f.scope.getSnapshot().value?.models).toEqual(['gpt-5.6-luna']))
    fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
    expect(f.mutate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('checkbox', { name: /GPT-5.6 Sol/ }))
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    expect((screen.getByRole('checkbox', { name: /GPT-5.6 Sol/ }) as HTMLInputElement).checked).toBe(false)
    expect(f.mutate).toHaveBeenCalledTimes(1)
  })
  it('previews another account without activating it or changing settings', async () => {
    const f = start()
    await waitFor(() => expect(f.account.getSnapshot().accounts).toHaveLength(2))
    fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
    fireEvent.change(await screen.findByRole('combobox', { name: en.managementPreviewAccount }), { target: { value: f.second } })
    await screen.findByText('Personal model')
    expect(screen.getByText(en.managementModelUnavailableReason)).toBeDefined()
    const previewReads = () => f.fetcher.mock.calls.filter(([url]) => String(url).includes('?accountKey=' + f.second)).length
    const before = previewReads()
    fireEvent.click(screen.getByRole('button', { name: en.catalogRefresh }))
    await waitFor(() => expect(previewReads()).toBeGreaterThan(before))
    expect(f.account.getSnapshot().accounts.find(account => account.active)?.accountKey).toBe(f.first)
    expect(f.mutate).not.toHaveBeenCalled()
    expect(f.fetcher.mock.calls.filter(([url, init]) => String(url) === OPENAI_CODEX_AUTH_ACCOUNTS_PATH && init?.method === 'POST')).toHaveLength(0)
  })
  it('exposes account login and confirmed removal using the existing account store', async () => {
    const f = start()
    vi.spyOn(window, 'open').mockReturnValue(null)
    await waitFor(() => expect(f.account.getSnapshot().accounts).toHaveLength(2))
    fireEvent.click(screen.getByRole('tab', { name: en.managementAccounts }))
    fireEvent.click(screen.getByRole('button', { name: en.useAccount }))
    await waitFor(() => expect(f.account.getSnapshot().accounts.find(account => account.active)?.accountKey).toBe(f.second))
    expect(f.mutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: en.removeAccount })[1]!)
    expect(f.fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    fireEvent.click(screen.getByRole('button', { name: en.addAccount }))
    await screen.findByRole('link', { name: en.openLoginInBrowser })
    expect(f.fetcher.mock.calls.filter(([url]) => String(url) === OPENAI_CODEX_AUTH_LOGIN_PATH)).toHaveLength(1)
  })
  it('keeps failed drafts editable and never enables writes on read-only host forms', async () => {
    const f = start()
    fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /GPT-5.6 Sol/ }))
    f.rejectSaves()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect((screen.getByRole('checkbox', { name: /GPT-5.6 Sol/ }) as HTMLInputElement).checked).toBe(false)
    cleanup(); f.account.dispose(); resetPlatformBalance()
    start(en, false)
    fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
    const checkbox = await screen.findByRole('checkbox', { name: /GPT-5.6 Sol/ })
    expect((checkbox.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true)
    expect(screen.getByText(en.settingsReadOnly)).toBeDefined()
    expect((screen.getByRole('combobox', { name: en.managementPreviewAccount }) as HTMLSelectElement).disabled).toBe(false)
  })
  it('supports keyboard tab navigation and correctly links each panel', () => {
    start()
    const first = screen.getByRole('tab', { name: en.managementOverview })
    fireEvent.keyDown(first, { key: 'End' })
    const last = screen.getByRole('tab', { name: en.capabilitiesModule })
    expect(document.activeElement).toBe(last)
    expect(within(screen.getByRole('tabpanel', { name: en.capabilitiesModule })).getByRole('checkbox', { name: en.newSessionFastMode })).toBeDefined()
  })
})
