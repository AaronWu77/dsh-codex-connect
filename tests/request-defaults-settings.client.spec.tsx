// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { OpenAICodexConfiguration } from '../src/client/OpenAICodexConfiguration.tsx'
import { en } from '../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../src/client/locales.ts'
import { DEFAULT_OPENAI_CODEX_SETTINGS, resolveOpenAICodexSettings } from '../src/settings-contract.ts'
import type { OpenAICodexSettingsConfig } from '../src/settings-contract.ts'

function fixture(initial: Partial<OpenAICodexSettingsConfig> = {}) {
  const listeners = new Set<() => void>()
  let snapshot: ConfigFormSnapshot<OpenAICodexSettingsConfig> = { status: 'ready', value: { ...DEFAULT_OPENAI_CODEX_SETTINGS, ...initial }, base: {}, user: {}, writable: true, revision: 0 }
  const mutate = vi.fn<ConfigForm<OpenAICodexSettingsConfig>['mutate']>(async (ops, revision) => {
    if (revision === undefined || snapshot.revision !== revision) throw new Error('Concurrent settings change')
    const next = { ...snapshot.value! }
    for (const op of ops) Object.assign(next, { [op.path[0]!]: op.op === 'set' ? op.value : undefined })
    snapshot = { ...snapshot, value: resolveOpenAICodexSettings(next), revision: revision + 1 }
    for (const listener of listeners) listener()
    return true
  })
  const scope: ConfigForm<OpenAICodexSettingsConfig> = { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, mutate, set: vi.fn(async () => true), unset: vi.fn(async () => true) }
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([])))
  return { scope, mutate }
}
const t = (key: OpenAICodexSettingsKey): string => en[key]
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('stages independent speed, effort, and file authorization without applying them on selection', async () => {
  const { scope, mutate } = fixture()
  render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
  fireEvent.change(screen.getByRole('combobox', { name: en.newSessionSpeedMode }), { target: { value: 'standard' } })
  fireEvent.change(screen.getByRole('combobox', { name: en.newSubagentSpeedMode }), { target: { value: 'ultrafast' } })
  fireEvent.change(screen.getByRole('combobox', { name: en.reasoningDefault }), { target: { value: 'high' } })
  fireEvent.change(screen.getByRole('combobox', { name: en.autoReviewLocalPolicy }), { target: { value: 'workspace-read' } })
  expect(mutate).not.toHaveBeenCalled()
  expect(scope.getSnapshot().value?.autoReviewLocalPolicy).toBe('manual')
  fireEvent.click(screen.getByRole('button', { name: en.save }))
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce())
  expect(scope.getSnapshot().value).toMatchObject({ newSessionSpeedMode: 'standard', newSubagentSpeedMode: 'ultrafast', reasoningEffort: 'high', autoReviewLocalPolicy: 'workspace-read' })
})

it('persists null masks for reset defaults instead of unsetting and re-inheriting them', async () => {
  const { scope, mutate } = fixture({ newSessionSpeedMode: 'ultrafast', newSubagentSpeedMode: 'fast', reasoningEffort: 'high' })
  render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
  for (const name of [en.newSessionSpeedMode, en.newSubagentSpeedMode, en.reasoningDefault]) fireEvent.change(screen.getByRole('combobox', { name }), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: en.save }))
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce())
  expect(mutate.mock.calls[0]?.[0]).toEqual(expect.arrayContaining(['newSessionSpeedMode', 'newSubagentSpeedMode', 'reasoningEffort'].map(field => ({ op: 'set', path: [field], value: null }))))
  expect(scope.getSnapshot().value?.reasoningEffort).toBeUndefined()
})

it('discards a staged authorization expansion without changing the Host scope', () => {
  const { scope, mutate } = fixture()
  render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
  fireEvent.change(screen.getByRole('combobox', { name: en.autoReviewLocalPolicy }), { target: { value: 'workspace-files' } })
  fireEvent.click(screen.getByRole('button', { name: en.discard }))
  expect((screen.getByRole('combobox', { name: en.autoReviewLocalPolicy }) as HTMLSelectElement).value).toBe('manual')
  expect(mutate).not.toHaveBeenCalled()
  expect(scope.getSnapshot().value?.autoReviewLocalPolicy).toBe('manual')
})
