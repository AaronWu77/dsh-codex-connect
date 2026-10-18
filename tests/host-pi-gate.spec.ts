/** The development gate rejects missing or drifting host stream aliases. */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

describe('host PI stream dependency gate', () => {
  it.each(['missing', 'drifting', 'installed-drift', 'missing-factory', 'request-missing', 'request-drifting'] as const)('rejects a %s alias declaration before reporting compatibility', async mode => {
    const staging = join(root, '.local')
    await mkdir(staging, { recursive: true })
    const directory = await mkdtemp(join(staging, 'host-pi-gate-'))
    try {
      await mkdir(join(directory, 'scripts'))
      const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
      if (mode === 'request-missing') delete manifest.dependencies['@earendil-works/pi-ai']
      else if (mode === 'request-drifting') manifest.dependencies['@earendil-works/pi-ai'] = '1.0.2'
      else if (mode === 'missing') delete manifest.dependencies['@earendil-works/pi-ai-host']
      else if (mode === 'drifting') manifest.dependencies['@earendil-works/pi-ai-host'] = 'npm:@earendil-works/pi-ai@1.0.3'
      else {
        const alias = join(directory, 'node_modules', '@earendil-works', 'pi-ai-host')
        await mkdir(alias, { recursive: true })
        await writeFile(join(alias, 'package.json'), JSON.stringify({
          name: '@earendil-works/pi-ai', type: 'module',
          version: mode === 'installed-drift' ? '1.0.2' : '1.1.0',
          exports: { '.': './index.js', './utils/event-stream': './index.js' },
        }))
        await writeFile(join(alias, 'index.js'), 'export {}\n')
      }
      await writeFile(join(directory, 'package.json'), JSON.stringify(manifest))
      await writeFile(join(directory, 'compatibility.json'), await readFile(join(root, 'compatibility.json')))
      const script = join(directory, 'scripts', 'check-compatibility.mjs')
      await writeFile(script, await readFile(join(root, 'scripts', 'check-compatibility.mjs')))
      const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8', timeout: 10_000 })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      const message = mode === 'request-missing' || mode === 'request-drifting' ? 'request dependency @earendil-works/pi-ai must match 0.87.1'
        : mode === 'installed-drift' ? 'installed host PI stream alias must resolve to 1.1.0'
        : mode === 'missing-factory' ? 'host PI event-stream factory is unavailable'
          : 'host PI stream alias must be pinned to 1.1.0'
      expect(result.stderr).toContain(message)
      expect(result.stdout).not.toContain('"status":"compatible"')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
