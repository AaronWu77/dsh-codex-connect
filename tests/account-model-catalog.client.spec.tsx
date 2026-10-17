// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountModelCatalog } from '../src/client/AccountModelCatalog.tsx'
import { managementFixture } from './management-fixture.ts'
import { en } from '../src/client/locales.ts'
import { modelCatalogFixture } from './model-catalog-fixture.ts'
import { BROWSER_REQUEST_TIMEOUT_MS } from '../src/client/request-json.ts'
let fixture: ReturnType<typeof managementFixture> | undefined
afterEach(() => { cleanup(); fixture?.account.dispose(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('account model preview request ownership', () => {
  it('never displays a late response from the previously selected account', async () => {
    const f = managementFixture(); fixture = f
    let resolveFirst: (response: Response) => void = () => { throw new Error('read not started') }
    const delayed = new Promise<Response>(resolve => { resolveFirst = resolve })
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => String(url).includes('?accountKey=' + f.first) ? delayed : f.fetcher(url, init)))
    render(<AccountModelCatalog account={f.account} t={f.props.t} active />)
    const select = await screen.findByRole('combobox', { name: en.managementPreviewAccount })
    fireEvent.change(select, { target: { value: f.second } })
    await screen.findByText('Personal model')
    await act(async () => { resolveFirst(Response.json(modelCatalogFixture([{ id: 'old-model', name: 'Wrong account response' }]))); await delayed })
    expect(screen.queryByText('Wrong account response')).toBeNull()
    expect(screen.getByText('Personal model')).toBeDefined()
  })
  it('fails visibly on invalid responses and retries without an account mutation', async () => {
    const f = managementFixture(); fixture = f
    let fail = true
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => fail && String(url).includes('?accountKey=')
      ? Promise.resolve(Response.json({ models: 'invalid' })) : f.fetcher(url, init)))
    render(<AccountModelCatalog account={f.account} t={f.props.t} active />)
    await screen.findByText(en.managementCatalogInvalid)
    fail = false
    fireEvent.click(screen.getByRole('button', { name: en.managementCatalogRetry }))
    await screen.findByText('GPT-5.6 Sol')
    expect(f.mutate).not.toHaveBeenCalled()
  })
  it('ends an uncooperative transport at its deadline and stops pending requests on unmount', async () => {
    const f = managementFixture(); fixture = f
    const unsubscribe = f.account.subscribe(() => {})
    await waitFor(() => expect(f.account.getSnapshot().accounts).toHaveLength(2))
    vi.useFakeTimers()
    let requestSignal: AbortSignal | null | undefined
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => {
      if (!String(url).includes('?accountKey=')) return f.fetcher(url, init)
      requestSignal = init?.signal
      return new Promise(() => {})
    }))
    const view = render(<AccountModelCatalog account={f.account} t={f.props.t} active />)
    await act(async () => { await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS) })
    expect(screen.getByText(en.managementCatalogTimeout)).toBeDefined()
    expect(requestSignal?.aborted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en.managementCatalogRetry }))
    view.unmount()
    expect(requestSignal?.aborted).toBe(true)
    unsubscribe(); f.account.dispose()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

it.each([
  [401, 'managementCatalogAuthRequired'], [403, 'managementCatalogForbidden'],
  [404, 'managementCatalogAccountRemoved'], [503, 'managementCatalogUnavailable'],
] as const)('distinguishes HTTP %s without leaking server errors or changing accounts', async (status, key) => {
  const f = managementFixture(); fixture = f
  vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => String(url).includes('?accountKey=')
    ? Promise.resolve(Response.json({ error: 'private server diagnostic' }, { status })) : f.fetcher(url, init)))
  render(<AccountModelCatalog account={f.account} t={f.props.t} active />)
  expect((await screen.findByRole('alert')).textContent).toContain(en[key])
  expect(screen.queryByText('private server diagnostic')).toBeNull()
  expect(f.fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
})

it('retains same-account last valid data on failure but never presents it for another account', async () => {
  const f = managementFixture(); fixture = f
  const view = render(<AccountModelCatalog account={f.account} t={f.props.t} active />)
  await screen.findByText('GPT-5.6 Sol')
  vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => String(url).includes('?accountKey=')
    ? Promise.resolve(Response.json({}, { status: 503 })) : f.fetcher(url, init)))
  view.rerender(<AccountModelCatalog account={f.account} t={f.props.t} active refreshRevision={1} />)
  await screen.findByText(en.managementCatalogUnavailable)
  expect(screen.getByText('GPT-5.6 Sol')).toBeDefined()
  expect(screen.getByText(en.managementCatalogRetained)).toBeDefined()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: f.second } })
  await screen.findByText(en.managementCatalogUnavailable)
  expect(screen.queryByText('GPT-5.6 Sol')).toBeNull()
  expect(screen.queryByText(en.managementCatalogRetained)).toBeNull()
})

it('reports a network failure separately from invalid data', async () => {
  const f = managementFixture(); fixture = f
  vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => String(url).includes('?accountKey=')
    ? Promise.reject(new TypeError('connection lost')) : f.fetcher(url, init)))
  render(<AccountModelCatalog account={f.account} t={f.props.t} active />)
  await screen.findByText(en.managementCatalogFailed)
})
