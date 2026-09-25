import { describe, expect, it } from 'vitest'
import {
  isOpenAICodexRouteId,
  openAICodexAccountRouteLabel,
  OpenAICodexAccountRouteRegistry,
  OPENAI_CODEX_PRIMARY_DISPLAY_NAME,
} from '../src/account-routes.ts'
import type { OpenAICodexAccountSummary } from '../src/store.ts'

function account(accountKey: string, active = false): OpenAICodexAccountSummary {
  return { accountKey, displayName: `User ${accountKey.slice(-6)}`, profileSource: 'oauth', active }
}

function bindings(routes: ReturnType<OpenAICodexAccountRouteRegistry['reconcile']>): [string, string | undefined][] {
  return routes.map(route => [route.routeId, route.accountKey])
}

describe('per-account LLM route assignment', () => {
  it('keeps the primary id on the active account and numbers the others in document order', () => {
    const routes = new OpenAICodexAccountRouteRegistry().reconcile([
      account('acct_aaaaaa', true),
      account('acct_bbbbbb'),
      account('acct_cccccc'),
    ])
    expect(routes).toEqual([
      { routeId: 'openai-codex', displayName: 'OpenAI Codex (User aaaaaa)' },
      { routeId: 'openai-codex-2', displayName: 'OpenAI Codex (User bbbbbb)', accountKey: 'acct_bbbbbb' },
      { routeId: 'openai-codex-3', displayName: 'OpenAI Codex (User cccccc)', accountKey: 'acct_cccccc' },
    ])
  })

  it('disambiguates two accounts that share a display name with the key suffix', () => {
    const same = (accountKey: string, active = false): OpenAICodexAccountSummary =>
      ({ accountKey, displayName: 'AaronWu', profileSource: 'oauth', active })
    const routes = new OpenAICodexAccountRouteRegistry().reconcile([
      same('acct_aaaaaa', true),
      same('acct_bbbbbb'),
    ])
    expect(routes.map(route => route.displayName)).toEqual([
      'OpenAI Codex (AaronWu \u00b7 aaaaaa)',
      'OpenAI Codex (AaronWu \u00b7 bbbbbb)',
    ])
  })

  it('returns the primary route alone when no account is stored', () => {
    expect(new OpenAICodexAccountRouteRegistry().reconcile([]))
      .toEqual([{ routeId: 'openai-codex', displayName: OPENAI_CODEX_PRIMARY_DISPLAY_NAME }])
  })

  it('keeps an existing non-primary account on its id when a new account appears before it', () => {
    const registry = new OpenAICodexAccountRouteRegistry()
    registry.reconcile([account('acct_aaaaaa', true), account('acct_bbbbbb'), account('acct_cccccc')])
    const routes = registry.reconcile([
      account('acct_aaaaaa', true),
      account('acct_dddddd'),
      account('acct_bbbbbb'),
      account('acct_cccccc'),
    ])
    expect(bindings(routes)).toEqual([
      ['openai-codex', undefined],
      ['openai-codex-4', 'acct_dddddd'],
      ['openai-codex-2', 'acct_bbbbbb'],
      ['openai-codex-3', 'acct_cccccc'],
    ])
  })

  it('hands the primary id to the newly activated account and reuses the freed id', () => {
    const registry = new OpenAICodexAccountRouteRegistry()
    registry.reconcile([account('acct_aaaaaa', true), account('acct_bbbbbb'), account('acct_cccccc')])
    expect(bindings(registry.reconcile([
      account('acct_aaaaaa'),
      account('acct_bbbbbb', true),
      account('acct_cccccc'),
    ]))).toEqual([
      ['openai-codex', undefined],
      ['openai-codex-2', 'acct_aaaaaa'],
      ['openai-codex-3', 'acct_cccccc'],
    ])
    expect(bindings(registry.reconcile([account('acct_bbbbbb', true), account('acct_cccccc')]))).toEqual([
      ['openai-codex', undefined],
      ['openai-codex-3', 'acct_cccccc'],
    ])
    expect(bindings(registry.reconcile([account('acct_cccccc', true)]))).toEqual([['openai-codex', undefined]])
  })

  it('builds a stable short label from the account key', () => {
    expect(openAICodexAccountRouteLabel('acct_3f9a2cZZZZ')).toBe('OpenAI Codex (acct 3f9a2c)')
    expect(openAICodexAccountRouteLabel('plain-key')).toBe('OpenAI Codex (acct plain-)')
  })

  it('recognizes only its own route ids', () => {
    expect(['openai-codex', 'openai-codex-2', 'openai-codex-16'].every(isOpenAICodexRouteId)).toBe(true)
    expect(['openai-codex-', 'openai-codex-x', 'openai-codex-2-extra', 'other-provider', 'openai-codex2'].some(isOpenAICodexRouteId)).toBe(false)
  })
})
