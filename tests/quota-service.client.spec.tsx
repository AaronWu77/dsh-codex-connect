// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountSnapshot, AccountSummary, OpenAICodexAccountStore } from '../src/client/account-store.ts'
import { createCodexQuotaService } from '../src/client/quota-service.ts'
import { OPENAI_CODEX_QUOTA_PATH } from '../src/quota-contract.ts'

const A_KEY = `acct_${'a'.repeat(43)}`
const B_KEY = `acct_${'b'.repeat(43)}`
const C_KEY = `acct_${'c'.repeat(43)}`

function summary(accountKey: string, active: boolean): AccountSummary {
  return { accountKey, active, displayName: 'work@example.com', maskedEmail: 'wo••@example.com', profileSource: 'oauth' }
}

const A = summary(A_KEY, true)
const B = summary(B_KEY, false)

function signedIn(accounts: readonly AccountSummary[], remainingPercent = 92): AccountSnapshot {
  return {
    status: {
      status: 'signed-in',
      usage: { rateLimits: [{ id: 'codex', name: 'Codex', windows: [{ remainingPercent, windowSeconds: 18_000 }] }] },
    },
    busy: false,
    accounts,
    operation: { kind: 'idle' },
  }
}

/** One already-projected usage payload as the Host route returns it. */
const usage = (remainingPercent: number) => ({
  rateLimits: [{ id: 'codex', name: 'Codex', windows: [{ remainingPercent, windowSeconds: 604_800, resetAt: 1_790_000_000 }] }],
})

function route(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status })
}

/** Minimal account store stand-in; the service only reads snapshots and observes changes. */
function fakeAccount(initial: AccountSnapshot) {
  const listeners = new Set<() => void>()
  let snapshot = initial
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    publish(next: AccountSnapshot) {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}

function serve(account: ReturnType<typeof fakeAccount>) {
  return createCodexQuotaService(account as unknown as OpenAICodexAccountStore)
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('shared codexQuota service', () => {
  it('publishes the active account and every other account the Host read', async () => {
    const account = fakeAccount(signedIn([A, B]))
    vi.stubGlobal('fetch', vi.fn(async () => route({ accounts: [{ accountKey: B_KEY, usage: usage(41) }] })))
    const service = serve(account)
    const unsubscribe = service.subscribe(() => {})
    try {
      await vi.waitFor(() => { expect(service.snapshot()?.accounts?.[1]?.windows).toHaveLength(1) })
      const snapshot = service.snapshot()!
      // Back-compat fields still describe the active account alone.
      expect(snapshot.windows).toEqual([{ bucketId: 'codex', bucketName: 'Codex', remainingPercent: 92, windowSeconds: 18_000 }])
      expect(snapshot.accounts!.map(entry => [entry.label, entry.active])).toEqual([['acct aaaaaa', true], ['acct bbbbbb', false]])
      expect(snapshot.accounts![1]!.windows).toEqual([
        { bucketId: 'codex', bucketName: 'Codex', remainingPercent: 41, windowSeconds: 604_800, resetAt: 1_790_000_000 },
      ])
      expect(snapshot.accounts![1]!.unavailable).toBeUndefined()
      expect(snapshot.fetchedAt).toBeTypeOf('number')
      expect(snapshot.accounts![1]!.fetchedAt).toBeTypeOf('number')
      // The caption is the key-derived form, never the stored display name or email.
      expect(JSON.stringify(snapshot.accounts)).not.toContain('example.com')
    } finally { unsubscribe() }
  })

  it('contains one failing account without dropping the others', async () => {
    const account = fakeAccount(signedIn([A, B, summary(C_KEY, false)]))
    vi.stubGlobal('fetch', vi.fn(async () => route({
      accounts: [
        { accountKey: B_KEY, usage: usage(41) },
        { accountKey: C_KEY, unavailable: true },
      ],
    })))
    const service = serve(account)
    const unsubscribe = service.subscribe(() => {})
    try {
      await vi.waitFor(() => { expect(service.snapshot()?.accounts?.[2]?.unavailable).toBe(true) })
      const accounts = service.snapshot()!.accounts!
      expect(accounts.map(entry => entry.accountKey)).toEqual([A_KEY, B_KEY, C_KEY])
      expect(accounts[1]!.windows).toHaveLength(1)
      expect(accounts[1]!.unavailable).toBeUndefined()
      expect(accounts[2]!.windows).toEqual([])
      expect(accounts[2]!.unavailable).toBe(true)
      // The active account is never affected by another account's failure.
      expect(accounts[0]!.unavailable).toBeUndefined()
      expect(service.snapshot()!.windows).toHaveLength(1)
    } finally { unsubscribe() }
  })

  it('keeps the active account and marks the rest unavailable when the route fails', async () => {
    const account = fakeAccount(signedIn([A, B]))
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down') }))
    const service = serve(account)
    const unsubscribe = service.subscribe(() => {})
    try {
      await vi.waitFor(() => { expect(service.snapshot()?.accounts?.[1]?.unavailable).toBe(true) })
      expect(service.snapshot()!.windows).toHaveLength(1)
      expect(service.snapshot()!.accounts![0]!.windows).toHaveLength(1)
      expect(service.snapshot()!.accounts![1]!.windows).toEqual([])
    } finally { unsubscribe() }
  })

  it('treats a malformed route payload as a failed round for every other account', async () => {
    const account = fakeAccount(signedIn([A, B]))
    vi.stubGlobal('fetch', vi.fn(async () => route({ accounts: [{ accountKey: 'not-a-key', usage: usage(41) }] })))
    const service = serve(account)
    const unsubscribe = service.subscribe(() => {})
    try {
      await vi.waitFor(() => { expect(service.snapshot()?.accounts?.[1]?.unavailable).toBe(true) })
      expect(service.snapshot()!.accounts).toHaveLength(2)
      expect(service.snapshot()!.accounts![1]!.windows).toEqual([])
    } finally { unsubscribe() }
  })

  it('holds each account through a failing round and expires it after five minutes', async () => {
    vi.useFakeTimers()
    const account = fakeAccount(signedIn([A, B]))
    let payload: unknown = { accounts: [{ accountKey: B_KEY, usage: usage(41) }] }
    vi.stubGlobal('fetch', vi.fn(async () => route(payload)))
    const service = serve(account)
    const unsubscribe = service.subscribe(() => {})
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(service.snapshot()!.accounts![1]!.windows).toHaveLength(1)

      // One failing round holds the last real figures and flags the account.
      payload = { accounts: [{ accountKey: B_KEY, unavailable: true }] }
      await vi.advanceTimersByTimeAsync(60_000)
      const held = service.snapshot()!.accounts![1]!
      expect(held.windows).toHaveLength(1)
      expect(held.unavailable).toBe(true)

      // Keep the active account fresh so only the other account's hold expires.
      payload = { accounts: [] }
      for (let elapsed = 0; elapsed < 300_000; elapsed += 60_000) {
        await vi.advanceTimersByTimeAsync(60_000)
        account.publish(signedIn([A, B]))
      }
      const expired = service.snapshot()!.accounts!.find(entry => entry.accountKey === B_KEY)!
      expect(expired.windows).toEqual([])
      expect(expired.unavailable).toBeUndefined()
    } finally { unsubscribe() }
  })

  it('suppresses a value-equal refresh and polls only while subscribed', async () => {
    vi.useFakeTimers()
    const account = fakeAccount(signedIn([A, B]))
    const fetchMock = vi.fn(async () => route({ accounts: [{ accountKey: B_KEY, usage: usage(41) }] }))
    vi.stubGlobal('fetch', fetchMock)
    const service = serve(account)
    const listener = vi.fn()
    const unsubscribe = service.subscribe(listener)
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const afterFirstRound = listener.mock.calls.length
      expect(afterFirstRound).toBeGreaterThan(0)

      await vi.advanceTimersByTimeAsync(60_000)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls.length).toBe(afterFirstRound)

      // A second subscriber shares the one in-flight round.
      const second = service.subscribe(() => {})
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      second()

      unsubscribe()
      await vi.advanceTimersByTimeAsync(180_000)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally { unsubscribe() }
  })

  it('requests the per-account quota route path', async () => {
    const account = fakeAccount(signedIn([A, B]))
    const fetchMock = vi.fn(async (_path: string) => route({ accounts: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const service = serve(account)
    const unsubscribe = service.subscribe(() => {})
    try {
      await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalled() })
      expect(fetchMock.mock.calls[0]![0]).toBe(OPENAI_CODEX_QUOTA_PATH)
    } finally { unsubscribe() }
  })

  it('starts a fresh round for the first subscriber after the last one leaves', async () => {
    vi.useFakeTimers()
    const account = fakeAccount(signedIn([A, B]))
    const fetchMock = vi.fn(async (_path: string) => route({ accounts: [{ accountKey: B_KEY, usage: usage(41) }] }))
    vi.stubGlobal('fetch', fetchMock)
    const service = serve(account)
    const first = service.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    first()
    const second = service.subscribe(() => {})
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally { second() }
  })

  it('flags the active account when the store reports a failed refresh', async () => {
    const account = fakeAccount(signedIn([A, B]))
    vi.stubGlobal('fetch', vi.fn(async (_path: string) => route({ accounts: [] })))
    const service = serve(account)
    const unsubscribe = service.subscribe(() => {})
    try {
      await vi.waitFor(() => { expect(service.snapshot()).not.toBeNull() })
      account.publish({
        status: { status: 'error', message: 'quota unavailable' },
        busy: false,
        accounts: [A, B],
        operation: { kind: 'idle' },
      })
      const active = service.snapshot()!.accounts![0]!
      expect(active.active).toBe(true)
      expect(active.unavailable).toBe(true)
      // The last real figures stand until the five-minute hold expires.
      expect(active.windows).toHaveLength(1)
    } finally { unsubscribe() }
  })
})
