import { describe, expect, it } from 'vitest'
import { AUTO_REVIEW_LOCAL_POLICIES, parseAutoReviewLocalPolicy } from '../src/auto-review-local-policy.ts'

describe('Auto-review explicit local authorization scope', () => {
  it('preserves manual when no local grant was configured', () => {
    expect(parseAutoReviewLocalPolicy(undefined)).toBe('manual')
  })

  it.each(AUTO_REVIEW_LOCAL_POLICIES)('accepts the explicit %s operator scope', value => {
    expect(parseAutoReviewLocalPolicy(value)).toBe(value)
  })

  it.each([null, '', 'allow', 'high', true, 1, {}, ['workspace-files']])('rejects an invalid explicit value %j instead of granting a fallback', value => {
    expect(() => parseAutoReviewLocalPolicy(value)).toThrow(TypeError)
  })
})
