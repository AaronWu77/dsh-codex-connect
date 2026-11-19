// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { OpenAICodexSpeedControl } from '../src/client/OpenAICodexSpeedControl.tsx'
import { OpenAICodexFastModeToggle } from '../src/client/OpenAICodexFastModeToggle.tsx'
import type { OpenAICodexSettingsKey } from '../src/client/locales.ts'
import type { ConversationSpeedState } from '../src/speed-mode-contract.ts'
import { OPENAI_CODEX_SPEED_MODE_PATH } from '../src/speed-mode-contract.ts'
import { OPENAI_CODEX_FAST_MODE_PATH } from '../src/fast-mode-paths.ts'

const provider = 'openai-codex-16', model = 'gpt-6.1-sol'
const state = (patch: Partial<ConversationSpeedState> = {}): ConversationSpeedState => ({ generation: 'generation', revision: 0, provider, model, mode: 'standard', eligibility: 'unknown', hasAccount: true,
  modelSupported: true, selectionAvailable: true, selectionExpired: false, ...patch })
const t = (key: OpenAICodexSettingsKey): string => key
function json(value: unknown, status = 200): Response { return Response.json(value, { status }) }
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 500, 30, 30))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('selects mutually exclusive modes with provider and revision, without changing directory or settings', async () => {
  const calls: RequestInit[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push(init)
    if (init.method === 'POST') {
      expect(url).toBe(OPENAI_CODEX_SPEED_MODE_PATH)
      expect(JSON.parse(String(init.body))).toEqual({ sessionId: 'session', provider, model, generation: 'generation', revision: 0, mode: 'ultrafast' })
      return json(state({ mode: 'ultrafast', revision: 1 }))
    }
    expect(new URL(url, 'http://dsh.invalid').searchParams.get('provider')).toBe(provider)
    return json(state())
  }))
  render(<OpenAICodexSpeedControl sessionId="session" provider={provider} model={model} t={t} />)
  const trigger = await screen.findByLabelText('speedMenuStandardTitle')
  fireEvent.click(trigger)
  expect(await screen.findByRole('menuitemradio', { name: 'speedStandard' })).toBeTruthy()
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'speedUltrafast' }))
  await screen.findByLabelText('speedMenuUltrafastTitle')
  expect(calls).toHaveLength(2)
  expect(screen.queryByRole('menu')).toBeNull()
})
it('treats failed POST outcomes as unconfirmed and recovers only by GET, never automatic command replay', async () => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => init.method === 'POST' ? json({ error: 'SPEED_SELECTION_STALE' }, 409) : json(state()))
  vi.stubGlobal('fetch', fetch)
  render(<OpenAICodexSpeedControl sessionId="session" provider={provider} model={model} t={t} />)
  fireEvent.click(await screen.findByLabelText('speedMenuStandardTitle'))
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'speedUltrafast' }))
  const recover = await screen.findByLabelText('speedRecover')
  expect(fetch).toHaveBeenCalledTimes(2)
  fireEvent.click(recover)
  await screen.findByLabelText('speedMenuStandardTitle')
  expect(fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1)
  expect(fetch).toHaveBeenCalledTimes(3)
})
it('aborts an old POST when the account view refreshes and ignores its late result', async () => {
  let resolve!: (value: Response) => void, postSignal: AbortSignal | undefined
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === 'POST') { postSignal = init.signal as AbortSignal; return new Promise<Response>(done => { resolve = done }) }
    return json(state())
  })
  vi.stubGlobal('fetch', fetch)
  const view = render(<OpenAICodexSpeedControl sessionId="session" provider={provider} model={model} t={t} refreshKey="account-A" />)
  fireEvent.click(await screen.findByLabelText('speedMenuStandardTitle'))
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'speedUltrafast' }))
  view.rerender(<OpenAICodexSpeedControl sessionId="session" provider={provider} model={model} t={t} refreshKey="account-B" />)
  await screen.findByLabelText('speedMenuStandardTitle')
  expect(postSignal?.aborted).toBe(true)
  resolve(json(state({ mode: 'ultrafast', revision: 1 })))
  await waitFor(() => { expect(screen.queryByLabelText('speedMenuUltrafastTitle')).toBeNull() })
  expect(fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1)
})
it('keeps expired choices visible and Standard selectable while Ultrafast is unsupported or account operations are busy', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => init.method === 'POST'
    ? json(state({ mode: 'standard', model: 'gpt-5.6-sol', modelSupported: false, revision: 1 }))
    : json(state({ mode: 'ultrafast', model: 'gpt-5.6-sol', modelSupported: false, selectionExpired: true }))))
  render(<OpenAICodexSpeedControl sessionId="session" provider={provider} model="gpt-5.6-sol" t={t} available={false} />)
  fireEvent.click(await screen.findByLabelText('speedSelectionExpired'))
  expect(screen.getByRole('alert').textContent).toBe('speedSelectionExpired')
  expect((screen.getByRole('menuitemradio', { name: 'speedUltrafast' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'speedStandard' }))
  await screen.findByLabelText('speedMenuStandardTitle')
})
it('opens the revisioned control after legacy GET refuses an expired unsupported-model choice', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).startsWith(OPENAI_CODEX_FAST_MODE_PATH)
    ? json({ error: 'use conversation speed' }, 409) : json(state({ model: 'gpt-5.6-sol', mode: 'ultrafast', modelSupported: false, selectionExpired: true }))))
  const snapshot: ModelDirectoryState = { status: 'ready', current: { provider, model: 'gpt-5.6-sol' }, groups: [], failures: [], routable: true, pending: null, error: null }
  const directory: SnapshotStore<ModelDirectoryState> = { getSnapshot: () => snapshot, subscribe: () => () => undefined, update: () => undefined, set: () => undefined }
  render(<OpenAICodexFastModeToggle sessionId="session" directory={directory} t={t} />)
  expect(await screen.findByLabelText('speedSelectionExpired')).toBeTruthy()
})
