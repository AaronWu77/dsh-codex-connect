// @vitest-environment jsdom
/** Recent-request parser, observable and dialog section. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecentRequests } from '../src/client/RecentRequests.tsx'
import { RecentRequestsStore, recentRequestsOf } from '../src/client/recent-requests.ts'
import type { RecentRequestView } from '../src/client/recent-requests.ts'
import { en, zh } from '../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../src/client/locales.ts'

const ROUTE = '/api/dsh-codex-connect/recent-requests'

const t = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll('{' + name + '}', String(replacement))
  return value
}

function view(overrides: Partial<RecentRequestView> = {}): RecentRequestView {
  return {
    id: 'request-1',
    startedAt: Date.now(),
    provider: 'openai-codex',
    model: 'gpt-6.1-sol',
    routeLabel: 'OpenAI Codex (AaronWu)',
    kind: 'conversation',
    reasoning: 'xhigh',
    transport: 'ws',
    inputTokens: 3_650,
    outputTokens: 6_370,
    cacheReadTokens: 274_180,
    cacheWriteTokens: 0,
    bodyBytes: 1_048_576,
    outcome: 'ok',
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === ROUTE
    ? Response.json({ requests: [view()] })
    : new Response('', { status: 404 })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('recent request parsing', () => {
  it('keeps five valid rows and ignores malformed ones', () => {
    const rows = Array.from({ length: 7 }, (_value, index) => view({ id: `request-${index}` }))
    const parsed = recentRequestsOf({ requests: [...rows, { id: 'bad' }, null, 'no'] })
    expect(parsed).toHaveLength(5)
    expect(parsed.map(row => row.id)).toEqual(['request-0', 'request-1', 'request-2', 'request-3', 'request-4'])
    expect(parsed[0]?.kind).toBe('conversation')
  })

  it.each(['low', null])('preserves prepared effort %s separately from the original request selection', payloadReasoning => {
    const [parsed] = recentRequestsOf({ requests: [view({ reasoning: 'minimal', payloadReasoning })] })
    expect(parsed).toMatchObject({ reasoning: 'minimal', payloadReasoning })
  })

  it('accepts legacy rows without payload metadata and ignores invalid metadata without losing the row', () => {
    const [legacy] = recentRequestsOf({ requests: [view()] })
    expect(legacy?.reasoning).toBe('xhigh')
    expect(legacy).not.toHaveProperty('payloadReasoning')
    for (const payloadReasoning of [42, false, {}, []]) {
      const [parsed] = recentRequestsOf({ requests: [{ ...view(), payloadReasoning }] })
      expect(parsed?.reasoning).toBe('xhigh')
      expect(parsed).not.toHaveProperty('payloadReasoning')
    }
  })

  it('recognizes request kinds and defaults unknown values to a conversation', () => {
    expect(recentRequestsOf({ requests: [view({ kind: 'title' })] })[0]?.kind).toBe('title')
    expect(recentRequestsOf({ requests: [{ ...view(), kind: 'unknown' }] })[0]?.kind).toBe('conversation')
  })

  it('rejects a missing list, bad transport, bad outcome and negative tokens', () => {
    expect(recentRequestsOf({})).toEqual([])
    expect(recentRequestsOf({ requests: [{ ...view(), transport: 'http' }] })).toEqual([])
    expect(recentRequestsOf({ requests: [{ ...view(), outcome: 'pending' }] })).toEqual([])
    expect(recentRequestsOf({ requests: [{ ...view(), inputTokens: -1 }] })).toEqual([])
  })
})

describe('recent request section', () => {
  it('shows the empty state, then the newest request with transport, tokens, reasoning and body size', async () => {
    const store = new RecentRequestsStore()
    render(<RecentRequests t={t} store={store} />)
    expect(screen.getByText(en['ov.recent.empty'])).toBeDefined()

    await act(async () => { await store.refresh() })
    expect(screen.getByText('gpt-6.1-sol')).toBeDefined()
    expect(screen.getByText(en['ov.recent.kind.conversation'])).toBeDefined()
    expect(screen.getByText(en['ov.recent.transport.ws'])).toBeDefined()
    expect(screen.getByText('OpenAI Codex (AaronWu)')).toBeDefined()
    expect(screen.getByText('3.65K')).toBeDefined()
    expect(screen.getByText('6.37K')).toBeDefined()
    expect(screen.getByText('274.18K')).toBeDefined()
    expect(screen.getByText('xhigh')).toBeDefined()
    expect(screen.getByText('1.00 MiB')).toBeDefined()
  })

  it.each([
    { metadata: { payloadReasoning: 'low' }, display: 'low' },
    { metadata: { payloadReasoning: null }, display: '—' },
    { metadata: {}, display: 'minimal' },
  ])('shows $display for the prepared effort with legacy fallback only when metadata is absent', async ({ metadata, display }) => {
    const store = new RecentRequestsStore()
    render(<RecentRequests t={t} store={store} />)
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ requests: [{ ...view({ reasoning: 'minimal' }), ...metadata }] }))
    await act(async () => { await store.refresh() })
    expect(screen.getByText(display)).toBeDefined()
    if (display !== 'minimal') expect(screen.queryByText('minimal')).toBeNull()
  })

  it('keeps English compact units and metric labels in the Chinese UI', async () => {
    const store = new RecentRequestsStore()
    const zhT = (key: OpenAICodexSettingsKey): string => zh[key]
    render(<RecentRequests t={zhT} store={store} />)
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ requests: [view({ inputTokens: 300_700, outputTokens: 317 })] }))
    await act(async () => { await store.refresh() })
    expect(screen.getByText('300.7K')).toBeDefined()
    expect(screen.getByText('317')).toBeDefined()
    expect(screen.getByText(zh['ov.recent.in'])).toBeDefined()
    expect(screen.queryByText('30.07万')).toBeNull()
  })

  it('labels an SSE fallback as Stream and retains rows when a later refresh fails', async () => {
    const store = new RecentRequestsStore()
    render(<RecentRequests t={t} store={store} />)
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ requests: [view({ transport: 'sse' })] }))
    await act(async () => { await store.refresh() })
    expect(screen.getByText(en['ov.recent.transport.sse'])).toBeDefined()

    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 500 }))
    await act(async () => { await store.refresh() })
    expect(screen.getByText('gpt-6.1-sol')).toBeDefined()
    expect(screen.getByText(en['ov.recent.failed'])).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en['ov.recent.retry'] }))
    expect(fetch).toHaveBeenCalled()
  })
})
