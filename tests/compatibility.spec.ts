import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import {
  COMPATIBILITY_CONTRACT,
  detectCompatibility,
  evaluateCompatibility,
  SUPPORTED_DSH_PLUGIN_API_RANGE,
  SUPPORTED_DSH_PLUGIN_API_VERSION,
  SUPPORTED_NODE_RANGE,
  SUPPORTED_PI_AI_RANGE,
} from '../src/compatibility.ts'

const compatiblePackages = {
  '@deepseek-ai/dsh-llm': SUPPORTED_DSH_PLUGIN_API_VERSION,
  '@deepseek-ai/dsh-llm-pi-ai': SUPPORTED_DSH_PLUGIN_API_VERSION,
  '@earendil-works/pi-ai': '0.87.1',
} as const

describe('compatibility contract', () => {
  it('evaluates the fixed Node, DSH API, and pi-ai versions as compatible', () => {
    expect(evaluateCompatibility({ nodeVersion: 'v22.19.0', packageVersions: compatiblePackages })).toEqual({
      schemaVersion: 1,
      status: 'compatible',
      node: { supported: SUPPORTED_NODE_RANGE, installed: 'v22.19.0', status: 'compatible' },
      packages: {
        '@deepseek-ai/dsh-llm': { supported: SUPPORTED_DSH_PLUGIN_API_RANGE, installed: SUPPORTED_DSH_PLUGIN_API_VERSION, status: 'compatible' },
        '@deepseek-ai/dsh-llm-pi-ai': { supported: SUPPORTED_DSH_PLUGIN_API_RANGE, installed: SUPPORTED_DSH_PLUGIN_API_VERSION, status: 'compatible' },
        '@earendil-works/pi-ai': { supported: SUPPORTED_PI_AI_RANGE, installed: '0.87.1', status: 'compatible' },
      },
    })
  })

  it('keeps packaged compatibility metadata identical to the runtime declaration', async () => {
    expect(JSON.parse(await readFile(new URL('../compatibility.json', import.meta.url), 'utf8'))).toEqual(COMPATIBILITY_CONTRACT)
  })

  it('accepts only the complete alpha.2 and pi-ai 0.87.1 pair', () => {
    expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: compatiblePackages }).status).toBe('compatible')
    for (const packages of [
      { ...compatiblePackages, '@deepseek-ai/dsh-llm': '0.2.0-rc.2' },
      { ...compatiblePackages, '@deepseek-ai/dsh-llm-pi-ai': '0.2.0-rc.2' },
      { ...compatiblePackages, '@earendil-works/pi-ai': '0.87.2' },
      { ...compatiblePackages, '@deepseek-ai/dsh-llm': '0.2.1-alpha.3', '@deepseek-ai/dsh-llm-pi-ai': '0.2.1-alpha.3' },
    ]) expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: packages }).status).toBe('unverified')
  })

  it('marks missing or mismatched metadata unknown or unverified', () => {
    expect(evaluateCompatibility({ nodeVersion: 'not-a-node-version', packageVersions: {} }).status).toBe('unknown')
    const report = evaluateCompatibility({ nodeVersion: 'v24.0.0', packageVersions: { ...compatiblePackages, '@earendil-works/pi-ai': '0.82.2' } })
    expect(report.status).toBe('unverified')
    expect(report.packages['@earendil-works/pi-ai']).toMatchObject({ installed: '0.82.2', status: 'unverified' })
  })

  it('prioritizes a known engine mismatch and newer DSH as unverified', () => {
    const packages = { ...compatiblePackages, '@deepseek-ai/dsh-llm': '0.2.1-alpha.3', '@deepseek-ai/dsh-llm-pi-ai': '0.2.1-alpha.3' }
    expect(evaluateCompatibility({ nodeVersion: 'v24.18.0', packageVersions: packages }).status).toBe('unverified')
    expect(evaluateCompatibility({ nodeVersion: 'unknown', packageVersions: packages }).status).toBe('unknown')
    expect(evaluateCompatibility({ nodeVersion: 'v20.0.0', packageVersions: packages }).status).toBe('incompatible')
  })

  it('supports injected package metadata without exposing paths', async () => {
    const report = await detectCompatibility({ nodeVersion: 'v24.0.1', readPackageVersion: async name => compatiblePackages[name] })
    expect(report.status).toBe('compatible')
    expect(JSON.stringify(report)).not.toMatch(/node_modules|Users|token|credential/iu)
  })
})
