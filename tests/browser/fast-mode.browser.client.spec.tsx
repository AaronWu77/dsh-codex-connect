import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { OpenAICodexFastModeToggle } from '../../src/client/OpenAICodexFastModeToggle.tsx'
import { OPENAI_CODEX_FAST_MODE_PATH } from '../../src/fast-mode-paths.ts'
import { en, zh } from '../../src/client/locales.ts'

let root: Root | undefined
let host: HTMLDivElement | undefined
afterEach(() => { root?.unmount(); host?.remove(); root = undefined; host = undefined; vi.unstubAllGlobals() })

describe('Codex account Fast Mode in Chromium', () => {
  it.each([['openai-codex', en], ['openai-codex-2', en], ['openai-codex-16', zh]] as const)('toggles conversation state on %s without changing account or model', async (provider, labels) => {
    const sessionId = 'fast-mode-browser-fixture'
    const fetchMock = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      if (options?.method === 'POST') return Response.json({ enabled: true })
      expect(String(url)).toBe(`${OPENAI_CODEX_FAST_MODE_PATH}?sessionId=${sessionId}`)
      return Response.json({ enabled: false })
    })
    vi.stubGlobal('fetch', fetchMock)
    const state: ModelDirectoryState = { status: 'ready', current: { provider, model: 'gpt-6.1-sol' }, groups: [], failures: [], routable: true, pending: null, error: null }
    const directory = createSnapshotStore(state)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(createElement(OpenAICodexFastModeToggle, { directory, sessionId, t: key => labels[key] }))
    const button = page.getByRole('button')
    await expect.element(button).toBeEnabled()
    await expect.element(button).toHaveAttribute('aria-pressed', 'false')
    await button.click()
    await expect.element(button).toHaveAttribute('aria-pressed', 'true')
    expect(fetchMock).toHaveBeenLastCalledWith(OPENAI_CODEX_FAST_MODE_PATH, expect.objectContaining({ method: 'POST', body: JSON.stringify({ sessionId, enabled: true }) }))
    expect(directory.getSnapshot().current).toEqual({ provider, model: 'gpt-6.1-sol' })
  })

  it('does not show or fetch Codex controls for a lookalike provider', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const state: ModelDirectoryState = { status: 'ready', current: { provider: 'custom-route-2', model: 'gpt-6.1-sol' }, groups: [], failures: [], routable: true, pending: null, error: null }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(createElement('div', { 'data-testid': 'foreign-route-mount' }, 'Fixture mounted', createElement(OpenAICodexFastModeToggle, { directory: createSnapshotStore(state), sessionId: 'foreign-route-fixture', t: key => en[key] })))
    await expect.element(page.getByTestId('foreign-route-mount')).toBeVisible()
    await expect.element(page.getByRole('button')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
