/** A paired run must never silently fall back to npm Host implementations. */
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import WebRuntime from '@deepseek-ai/dsh-web'
import { localHostResolution } from './support/local-host-resolution.ts'

const metadata = new URL('../local-host-validation.json', import.meta.url)

describe('local Host runtime resolution', () => {
  it('requires the catalog for an explicitly paired Host run', () => {
    if (process.env['DSH_REPO'] !== undefined) expect(existsSync(metadata)).toBe(true)
  })
  it.each([null, {}, { hostPackages: [] }, { hostPackages: { '@deepseek-ai/dsh-web': 7 } }])('rejects invalid catalog %j', async value => {
    const root = await mkdtemp(join(tmpdir(), 'codex-host-resolution-'))
    try {
      const file = join(root, 'catalog.json')
      await writeFile(file, JSON.stringify(value))
      expect(() => localHostResolution(pathToFileURL(file))).toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  it.runIf(existsSync(metadata))('uses the paired search implementation, not the published npm implementation', () => {
    const plugins = localHostResolution(metadata)
    expect(plugins).toHaveLength(1)
    expect(plugins[0]?.resolveId('@deepseek-ai/dsh-client-ui-settings/client'))
      .toContain('/packages/client/ui-settings/lib/client.js')
    expect(typeof Reflect.get(WebRuntime.prototype, 'getSearchProvider')).toBe('function')
    expect(typeof Reflect.get(WebRuntime.prototype, 'setSearchProvider')).toBe('function')
  })
  it('leaves published-package resolution unchanged when no catalog exists', () => {
    expect(localHostResolution(new URL('../missing-host-validation.json', import.meta.url))).toEqual([])
  })
})
