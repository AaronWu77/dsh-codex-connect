import { describe, expect, it } from 'vitest'
import { publicAuthError } from '../src/auth-error.ts'

describe('public auth diagnostics', () => {
  it.each([
    new Error('{"refresh_token":"fixture-secret"}'),
    new Error('upstream body fixture-secret'),
    new Error('failure', { cause: new Error('fixture-secret') }),
    { toString: () => { throw new Error('must not stringify provider objects') } },
    new Error('OpenAI Codex usage request failed with HTTP 503 fixture-secret'),
  ])('uses a fixed message for untrusted error payloads', error => {
    expect(publicAuthError(error)).toBe('OpenAI Codex operation failed. Please try again.')
  })
})
