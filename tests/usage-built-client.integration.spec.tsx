// @vitest-environment jsdom
/** Optional rendering test for an explicitly selected built client bundle. */
import { existsSync, readFileSync } from 'node:fs'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { Context } from '@deepseek-ai/cordis'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { managementFixture } from './management-fixture.ts'
import { en, zh } from '../src/client/locales.ts'
import { resetPlatformBalance } from '../src/client/balance.ts'
import type { OpenAICodexPluginCardInjected, OpenAICodexPluginCardProps } from '../src/client/OpenAICodexPluginCard.tsx'

const artifact = process.env.DSH_CODEX_TEST_CLIENT
if (artifact !== undefined && !existsSync(artifact)) throw new Error('DSH_CODEX_TEST_CLIENT must identify an existing client bundle')
if (artifact === undefined) console.info('Skipping built-client rendering: set DSH_CODEX_TEST_CLIENT to an isolated client.js.')

interface Handoff { id: string; factory: (require: (name: string) => unknown) => unknown }
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined
}
function settingsInjected(value: unknown): value is OpenAICodexPluginCardInjected {
  const data = record(value)
  return typeof data?.t === 'function' && typeof record(data.account)?.subscribe === 'function'
    && typeof record(data.quota)?.snapshot === 'function' && typeof record(data.configScope)?.mutate === 'function'
    && typeof record(data.localUsage)?.subscribe === 'function'
}
function managementComponent(value: unknown): value is React.ComponentType<OpenAICodexPluginCardProps> {
  return typeof value === 'function'
}

describe.skipIf(artifact === undefined)('isolated built client', () => {
  it.each([
    { scenario: 'renders owner-provided local usage from the Session list without Context', failure: 'none' },
    { scenario: 'offers a retry when the warm-up routes are absent', failure: 'absent' },
    { scenario: 'keeps known days while the warm-up is unavailable', failure: 'partial' },
    { scenario: 'does not invent a zero for an unknown day', failure: 'unknown' },
    { scenario: 'shows an explicitly reported zero', failure: 'zero' },
  ].flatMap(test => [{ ...test, labels: en, language: 'English' }, { ...test, labels: zh, language: 'Chinese' }]))('$language: $scenario', async ({ failure, labels }) => {
    if (artifact === undefined) throw new Error('Missing isolated client bundle')
    const fixture = managementFixture(labels)
    const fetcher = fixture.fetcher
    const requests: Array<{ path: string; method: string }> = []
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
    const now = Date.now()
    const days = Object.fromEntries([-1, 0, 1].map(offset => [formatter.format(now + offset * 86_400_000),
      { tokens: 19_876, requests: 2 }]))
    const projections: Record<string, unknown> = {
      codexConnectUsage: { timeZone: 'UTC', days: failure === 'zero'
        ? Object.fromEntries(Object.keys(days).map(day => [day, { tokens: 0, requests: 1 }]))
        : failure === 'unknown' ? {} : days },
    }
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname
      const method = (init?.method ?? 'GET').toUpperCase()
      requests.push({ path, method })
      if (path.startsWith('/api/dsh-codex-connect/local-usage')) {
        if (failure === 'absent') return Promise.resolve(new Response(null, { status: 404 }))
        if (failure === 'partial') return Promise.resolve(new Response(null, { status: 503 }))
        return Promise.resolve(Response.json({ state: method === 'POST' && path.endsWith('/backfill') ? 'running' : 'done', pollMs: 2_147_483_647 }))
      }
      if (path.startsWith('/api/dsh-context/')) return Promise.reject(new Error('Unexpected Context request'))
      return fetcher(input, init)
    })
    const ctx = new Context()
    let handoff: Handoff | undefined
    const loaderWindow = window as Window & { __ModuleLoader__?: { load: (value: Handoff) => void } }
    const oldLoader = loaderWindow.__ModuleLoader__
    loaderWindow.__ModuleLoader__ = { load: value => { handoff = value } }
    const registrations = new Map<string, { component: unknown; inject?: () => unknown }>()
    const beforeStyles = document.head.querySelectorAll('style').length
    try {
      new Function(readFileSync(artifact, 'utf8'))()
      expect(handoff?.id).toBe('dsh-codex-connect')
      if (handoff === undefined) throw new Error('Missing client module handoff')
      const plugin = record(handoff.factory(name => {
        if (name === 'react') return React
        if (name === 'react/jsx-runtime') return jsxRuntime
        if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives
        throw new Error('Unexpected client runtime dependency: ' + name)
      }))
      if (typeof plugin?.apply !== 'function') throw new Error('Missing client apply')
      const apply = plugin.apply
      ctx.provide('locale', { register: () => () => {}, bind: () => fixture.props.t })
      ctx.provide('connection', {})
      // The Session list is the only usage source: every row carries this plugin's own projection value.
      ctx.provide('sessions', {
        refresh: async () => {},
        list: {
          getSnapshot: () => ({ ids: ['s1'], byId: { s1: { blank: false, projectionValues: projections } } }),
          subscribe: () => () => {},
        },
      })
      ctx.provide('configForms', {
        get: () => fixture.scope,
        describe: () => ({ getSnapshot: () => ({ status: 'ready', view: undefined }), subscribe: () => () => {}, ensure: async () => {} }),
        whileServed: (_names: string[], callback: () => () => void) => callback(),
      })
      ctx.provide('slots', {
        inject: (_name: string, callback: () => () => void) => ctx.effect(callback),
        register: (options: { name: string; inject?: () => unknown }, component: unknown) => {
          registrations.set(options.name, { component, ...(options.inject === undefined ? {} : { inject: options.inject }) })
          return () => { registrations.delete(options.name) }
        },
      })
      await ctx.plugin({ name: 'staged-usage-client', apply: child => { apply(child) } })
      const settings = registrations.get('settings.section')
      if (settings === undefined || !managementComponent(settings.component)) throw new Error('Missing management component')
      const injected = settings.inject?.()
      if (!settingsInjected(injected)) throw new Error('Missing local usage source')
      const Component = settings.component
      render(<Component {...fixture.props} {...injected} />)
      if (failure === 'absent' || failure === 'partial') {
        // Both an absent route and a refusing one degrade the warm-up to
        // `unavailable`; known days stay on screen and Retry is offered.
        await screen.findByText(labels['ov.local.unavailable'])
        await screen.findByText('19.9k')
        expect(screen.getByRole('button', { name: labels['ov.local.retry'] })).toBeDefined()
      } else if (failure === 'zero') {
        const region = await screen.findByRole('region', { name: labels['ov.quota.platform'] })
        await within(region).findByText('0')
      } else if (failure === 'unknown') {
        // Nothing recorded means no ledger at all, never an invented zero day.
        await waitFor(() => expect(injected.localUsage?.snapshot()).toMatchObject({ state: 'ready', data: null }))
        expect(screen.queryByText(labels['ov.quota.today'])).toBeNull()
      } else {
        await screen.findByText('19.9k')
        expect(screen.getByText(labels['ov.quota.today'])).toBeDefined()
      }
      // No scan-progress copy exists any more, and nothing reads the Context plugin's routes.
      expect(screen.queryByText(/Scanning local sessions|正在扫描本地会话/)).toBeNull()
      expect(requests.some(request => request.path.startsWith('/api/dsh-context/'))).toBe(false)
      cleanup()
      await ctx.fiber.dispose()
      expect(registrations.size).toBe(0)
      expect(document.head.querySelectorAll('style').length).toBe(beforeStyles)
    } finally {
      cleanup(); await ctx.fiber.dispose(); fixture.account.dispose(); resetPlatformBalance(); vi.unstubAllGlobals()
      if (oldLoader === undefined) delete loaderWindow.__ModuleLoader__
      else loaderWindow.__ModuleLoader__ = oldLoader
    }
  })
})