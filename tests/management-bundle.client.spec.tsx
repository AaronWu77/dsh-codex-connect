// @vitest-environment jsdom
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { Context } from '@deepseek-ai/cordis'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { managementFixture } from './management-fixture.ts'
import { en } from '../src/client/locales.ts'
import type { OpenAICodexPluginCardProps, OpenAICodexPluginCardInjected } from '../src/client/OpenAICodexPluginCard.tsx'
import { resetPlatformBalance } from '../src/client/balance.ts'

const artifact = join(process.cwd(), 'lib/client.js')
interface Handoff { id: string; factory: (require: (name: string) => unknown) => unknown }
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined
}
function settingsInjected(value: unknown): value is OpenAICodexPluginCardInjected {
  const data = record(value)
  return typeof data?.t === 'function' && typeof record(data.account)?.subscribe === 'function'
    && typeof record(data.quota)?.snapshot === 'function' && typeof record(data.configScope)?.mutate === 'function'
}
function managementComponent(value: unknown): value is React.ComponentType<OpenAICodexPluginCardProps> {
  return typeof value === 'function'
}

describe.skipIf(!existsSync(artifact))('built management client on fixed host runtime dependencies', () => {
  it('loads through the real module handoff, shares injected services, and removes effects on disposal', async () => {
    const fixture = managementFixture()
    const originalFetch = fixture.fetcher
    vi.stubGlobal('fetch', (url: RequestInfo | URL, init?: RequestInit) => String(url).endsWith('/backfill/status')
      ? Promise.resolve(Response.json({ state: 'done', pollMs: 500 })) : originalFetch(url, init))
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
      if (!handoff) throw new Error('Missing bundle handoff')
      const plugin = record(handoff.factory(name => {
        if (name === 'react') return React
        if (name === 'react/jsx-runtime') return jsxRuntime
        if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives
        throw new Error('Unexpected client runtime dependency: ' + name)
      }))
      if (typeof plugin?.apply !== 'function') throw new Error('Missing bundle apply')
      const apply = plugin.apply
      ctx.provide('locale', { register: () => () => {}, bind: () => fixture.props.t })
      ctx.provide('connection', {})
      ctx.provide('sessions', { refresh: async () => {} })
      ctx.provide('configForms', {
        get: () => fixture.scope,
        describe: () => ({ getSnapshot: () => ({ status: 'ready', view: undefined }), subscribe: () => () => {} }),
        whileServed: (_names: string[], callback: () => () => void) => callback(),
      })
      ctx.provide('slots', {
        inject: (_name: string, callback: () => () => void) => ctx.effect(callback),
        register: (options: { name: string; inject?: () => unknown }, component: unknown) => {
          registrations.set(options.name, { component, ...(options.inject === undefined ? {} : { inject: options.inject }) })
          return () => { registrations.delete(options.name) }
        },
      })
      await ctx.plugin({ name: 'management-built-admission', apply: child => { apply(child) } })
      const settings = registrations.get('settings.plugins.tab')
      expect(registrations.has('sidebar.footer.action')).toBe(true)
      expect(registrations.has('shell.overlay')).toBe(true)
      expect(settings).toBeDefined()
      if (!settings || !managementComponent(settings.component)) throw new Error('Missing management component')
      const injected = settings.inject?.()
      if (!settingsInjected(injected)) throw new Error('Invalid built settings injection')
      expect(injected.account).toBeDefined()
      expect(injected.quota).toBe(ctx.get('codexQuota'))
      const Component = settings.component
      render(<Component {...fixture.props} {...injected} />)
      await screen.findByText('¥42.50')
      expect(screen.getByRole('tab', { name: en.managementOverview })).toBeDefined()
      fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
      await screen.findByRole('combobox', { name: en.managementPreviewAccount })
      fireEvent.click(screen.getByRole('tab', { name: en.managementAccounts }))
      await screen.findByRole('button', { name: en.addAccount })
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
