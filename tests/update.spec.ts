import { describe, expect, it } from 'vitest'
import { compareOpenAICodexVersions, parseOpenAICodexVersion } from '../src/update.ts'

describe('Codex Connect version precedence', () => {
  it('compares prerelease versions without treating alpha 10 as alpha 2', () => {
    expect(compareOpenAICodexVersions('0.1.0-alpha.10', '0.1.0-alpha.2')).toBeGreaterThan(0)
    expect(compareOpenAICodexVersions('0.1.0-alpha.4.14', '0.1.0-alpha.4.14')).toBe(0)
    expect(compareOpenAICodexVersions('0.1.0', '0.1.0-alpha.99')).toBeGreaterThan(0)
    expect(parseOpenAICodexVersion('v0.1.0-alpha.4.14')).toBeDefined()
    expect(parseOpenAICodexVersion('0.1.0-alpha.01')).toBeUndefined()
  })
})
