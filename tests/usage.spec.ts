import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OAuthCredential } from '@earendil-works/pi-ai'
import { OpenAICodexWebAuth } from '../src/auth-routes.ts'
import {
  OPENAI_CODEX_USAGE_URL,
  isOpenAICodexReauthRequiredError,
  OpenAICodexReauthRequiredError,
  parseOpenAICodexUsage,
  readOpenAICodexRateLimits,
} from '../src/usage.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'

let root: string | undefined

afterEach(async () => {
  vi.unstubAllGlobals()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function payload(planType: unknown = 'business'): unknown {
  return {
    plan_type: planType,
    rate_limit: {
      allowed: true,
      limit_reached: false,
      primary_window: { used_percent: 13, limit_window_seconds: 604_800 },
      secondary_window: { used_percent: 40.5, limit_window_seconds: 18_000 },
    },
    credits: { has_credits: true, unlimited: false, balance: '42.5' },
    spend_control: {
      reached: false,
      individual_limit: {
        limit: '100',
        used: '25',
        remaining: '75',
        remaining_percent: 75,
      },
    },
    additional_rate_limits: [{
      metered_feature: 'codex_spark',
      limit_name: 'Codex Spark',
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: { used_percent: 0, limit_window_seconds: 604_800 },
      },
    }],
  }
}

async function authenticatedStore(): Promise<OpenAICodexCredentialStore> {
  root = await mkdtemp(join(tmpdir(), 'dsh-openai-codex-usage-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const credential: OAuthCredential = {
    type: 'oauth',
    access: 'access-secret',
    refresh: 'refresh-secret',
    expires: Date.now() + 3_600_000,
    accountId: 'account-1',
  }
  await store.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential))
  return store
}

describe('OpenAI Codex usage', () => {
  it('projects rolling percentages and exact provider-supported balances', () => {
    expect(parseOpenAICodexUsage(payload())).toEqual({
      rateLimits: [
        {
          id: 'codex',
          name: 'Codex',
          windows: [
            { remainingPercent: 87, windowSeconds: 604_800 },
            { remainingPercent: 59.5, windowSeconds: 18_000 },
          ],
        },
        {
          id: 'codex_spark',
          name: 'Codex Spark',
          windows: [{ remainingPercent: 100, windowSeconds: 604_800 }],
        },
      ],
      credits: { unlimited: false, balance: '42.5' },
      individualLimit: {
        limit: '100',
        used: '25',
        remaining: '75',
        remainingPercent: 75,
      },
    })
  })

  it.each(['plus', 'pro', 'business', 'team', undefined, null])(
    'preserves server-returned windows without guessing semantics for the %s plan', planType => {
      const parsed = parseOpenAICodexUsage(payload(planType))
      expect(parsed.rateLimits[0]?.windows).toEqual([
        { remainingPercent: 87, windowSeconds: 604_800 },
        { remainingPercent: 59.5, windowSeconds: 18_000 },
      ])
    },
  )

  it('rejects percentages that would make a quota bar misleading', () => {
    expect(() => parseOpenAICodexUsage({
      rate_limit: {
        primary_window: { used_percent: 101, limit_window_seconds: 18_000 },
      },
    })).toThrow(/invalid used percentage/)
  })

  it('projects a valid WHAM reset_at without deriving a client-side timestamp', () => {
    const parsed = parseOpenAICodexUsage({
      rate_limit: {
        primary_window: {
          used_percent: 13,
          limit_window_seconds: 604_800,
          reset_at: 1_735_689_600,
        },
        secondary_window: {
          used_percent: 40,
          limit_window_seconds: 18_000,
        },
      },
    })

    expect(parsed.rateLimits[0]?.windows).toEqual([
      { remainingPercent: 87, windowSeconds: 604_800, resetAt: 1_735_689_600 },
      { remainingPercent: 60, windowSeconds: 18_000 },
    ])
  })

  it('treats an explicit null reset_at as unavailable without dropping quota data', () => {
    expect(parseOpenAICodexUsage({
      rate_limit: {
        primary_window: {
          used_percent: 13,
          limit_window_seconds: 604_800,
          reset_at: null,
        },
      },
    }).rateLimits[0]?.windows[0]).toEqual({
      remainingPercent: 87,
      windowSeconds: 604_800,
    })
  })

  it.each(['1735689600', 0, -1, 1.5, Number.MAX_SAFE_INTEGER])(
    'fails closed when reset_at is present but invalid (%s)', resetAt => {
      expect(() => parseOpenAICodexUsage({
        rate_limit: {
          primary_window: {
            used_percent: 0,
            limit_window_seconds: 604_800,
            reset_at: resetAt,
          },
        },
      })).toThrow(/invalid rate-limit reset time/)
    },
  )

  it('projects reset credits encoded as Unix seconds', () => {
    const parsed = parseOpenAICodexUsage({
      rate_limit_reset_credits: {
        available_count: 2,
        credits: [{
          id: 'credit-1',
          reset_type: 'codex_rate_limits',
          status: 'available',
          granted_at: 1_750_118_400,
          expires_at: 1_752_710_400,
          title: 'Full reset (Weekly + 5 hr)',
        }],
      },
    })

    expect(parsed.resetCredits).toEqual({
      availableCount: 2,
      credits: [{
        id: 'credit-1',
        resetType: 'codex_rate_limits',
        status: 'available',
        grantedAt: 1_750_118_400,
        expiresAt: 1_752_710_400,
        title: 'Full reset (Weekly + 5 hr)',
      }],
    })
  })

  it('projects reset credits encoded as RFC3339 strings', () => {
    const parsed = parseOpenAICodexUsage({
      rate_limit_reset_credits: {
        available_count: 1,
        credits: [{
          id: 'credit-2',
          reset_type: 'codex_rate_limits',
          status: 'available',
          granted_at: '2026-06-17T00:00:00Z',
          expires_at: '2026-07-17T00:00:00Z',
        }],
      },
    })

    expect(parsed.resetCredits?.credits?.[0]).toEqual({
      id: 'credit-2',
      resetType: 'codex_rate_limits',
      status: 'available',
      grantedAt: Date.parse('2026-06-17T00:00:00Z') / 1_000,
      expiresAt: Date.parse('2026-07-17T00:00:00Z') / 1_000,
    })
  })

  it.each([undefined, null])('treats a %s expiry as no expiry without dropping the rest', expiresAt => {
    const parsed = parseOpenAICodexUsage({
      rate_limit: { primary_window: { used_percent: 10, limit_window_seconds: 18_000 } },
      rate_limit_reset_credits: {
        available_count: 1,
        credits: [{
          id: 'credit-3',
          reset_type: 'codex_rate_limits',
          status: 'available',
          granted_at: 1_750_118_400,
          expires_at: expiresAt,
        }],
      },
    })

    expect(parsed.resetCredits?.credits?.[0]).toEqual({
      id: 'credit-3',
      resetType: 'codex_rate_limits',
      status: 'available',
      grantedAt: 1_750_118_400,
    })
    expect(parsed.rateLimits[0]?.windows).toEqual([{ remainingPercent: 90, windowSeconds: 18_000 }])
  })

  it('keeps a positive available count when the server omits the card list', () => {
    const parsed = parseOpenAICodexUsage({ rate_limit_reset_credits: { available_count: 3, credits: [] } })
    expect(parsed.resetCredits).toEqual({ availableCount: 3, credits: [] })
  })

  it('omits reset credits when the provider does not report the field', () => {
    expect(parseOpenAICodexUsage({ rate_limit: { primary_window: { used_percent: 0, limit_window_seconds: 604_800 } } }))
      .not.toHaveProperty('resetCredits')
  })

  it.each([
    ['a non-object block', 'not-an-object'],
    ['a negative count', { available_count: -1 }],
    ['an unrecognized timestamp encoding', {
      available_count: 1,
      credits: [{ id: 'credit-4', reset_type: 'codex_rate_limits', status: 'available', granted_at: 'yesterday' }],
    }],
    ['a missing grant time', {
      available_count: 1,
      credits: [{ id: 'credit-5', reset_type: 'codex_rate_limits', status: 'available' }],
    }],
  ] as const)('omits a malformed reset-credit block (%s) without breaking the windows', (_label, resetCredits) => {
    const parsed = parseOpenAICodexUsage({
      rate_limit: { primary_window: { used_percent: 25, limit_window_seconds: 604_800 } },
      rate_limit_reset_credits: resetCredits,
    })

    expect(parsed).not.toHaveProperty('resetCredits')
    expect(parsed.rateLimits[0]?.windows).toEqual([{ remainingPercent: 75, windowSeconds: 604_800 }])
  })

  it('reads the fixed usage endpoint with refreshed plugin credentials', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response(payload()))
    vi.stubGlobal('fetch', fetchMock)
    const usage = await readOpenAICodexRateLimits(await authenticatedStore())

    expect(usage.rateLimits[0]?.windows[0]?.remainingPercent).toBe(87)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(OPENAI_CODEX_USAGE_URL)
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: {
        authorization: 'Bearer access-secret',
        'chatgpt-account-id': 'account-1',
        'cache-control': 'no-store',
      },
    })
  })

  it('keeps the access token paired with its account when the active account switches', async () => {
    const store = await authenticatedStore()
    await store.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve({
      type: 'oauth',
      access: 'second-access-secret',
      refresh: 'second-refresh-secret',
      expires: Date.now() + 3_600_000,
      accountId: 'account-2',
    }))
    const accounts = await store.accounts()
    const first = accounts.find(account => !account.active)
    const second = accounts.find(account => account.active)
    if (first === undefined || second === undefined) throw new Error('two account fixtures were not created')
    await store.activate(first.accountKey)

    const read = store.read.bind(store)
    let firstRead = true
    store.read = async (...args) => {
      const credential = await read(...args)
      if (firstRead) {
        firstRead = false
        await store.activate(second.accountKey)
      }
      return credential
    }
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response(payload()))
    vi.stubGlobal('fetch', fetchMock)

    await readOpenAICodexRateLimits(store)

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer access-secret')
    expect(headers.get('chatgpt-account-id')).toBe('account-1')
  })

  it.each([401, 403])('throws a secret-free reauthorization error for usage HTTP %s', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => response({
      error: 'fixture-response-secret',
      token: 'fixture-response-token',
    }, status)))

    let caught: unknown
    try {
      await readOpenAICodexRateLimits(await authenticatedStore())
    } catch (error: unknown) {
      caught = error
    }

    expect(caught).toBeInstanceOf(OpenAICodexReauthRequiredError)
    expect(isOpenAICodexReauthRequiredError(caught)).toBe(true)
    expect(caught).toMatchObject({ code: 'OPENAI_CODEX_REAUTH_REQUIRED' })
    for (const secret of [
      'access-secret',
      'refresh-secret',
      'account-1',
      'fixture-response-secret',
      'fixture-response-token',
    ]) {
      expect(String(caught)).not.toContain(secret)
      expect(JSON.stringify(caught)).not.toContain(secret)
    }
  })

  it('keeps a signed-in account usable when quota metadata is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'unavailable' }, 503)))
    const status = await new OpenAICodexWebAuth(await authenticatedStore()).status()

    expect(status).toEqual({
      status: 'signed-in',
      usage: { rateLimits: [] },
      quotaError: 'OpenAI Codex usage request failed with HTTP 503',
    })
    expect(status).not.toHaveProperty('expiresAt')
  })
})
