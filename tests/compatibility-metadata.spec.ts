/** Metadata checks do not establish live compatibility with either npm Host release. */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const root = new URL('../', import.meta.url)

describe('declared Host compatibility metadata', () => {
  it.each(['0.2.2-rc.1', '0.2.1-rc.2', 'metadata-drift', 'peer-drift', 'mixed-install', 'duplicate-package'])(
    'validates %s without accepting declaration or installation drift', async mode => {
      const directory = await mkdtemp(join(tmpdir(), 'codex-compatibility-'))
      try {
        const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8')) as { peerDependencies: Record<string, string> }
        const compatibility = JSON.parse(await readFile(new URL('compatibility.json', root), 'utf8')) as {
          dshPluginApi: { version: string; packages: string[] }
        }
        if (mode === 'metadata-drift') compatibility.dshPluginApi.version = '0.2.3'
        if (mode === 'peer-drift') manifest.peerDependencies['@deepseek-ai/dsh-web'] = '*'
        if (mode === 'duplicate-package') compatibility.dshPluginApi.packages.push(compatibility.dshPluginApi.packages[0]!)
        const version = mode === '0.2.1-rc.2' ? mode : '0.2.2-rc.1'
        async function module(name: string, packageName: string, packageVersion: string, source = 'export {}\n') {
          const path = join(directory, 'node_modules', name)
          await mkdir(path, { recursive: true })
          await writeFile(join(path, 'package.json'), JSON.stringify({
            name: packageName, version: packageVersion, type: 'module',
            exports: { '.': './index.js', './utils/event-stream': './index.js' },
          }))
          await writeFile(join(path, 'index.js'), source)
        }
        for (const name of new Set(compatibility.dshPluginApi.packages)) {
          await module(name, name, mode === 'mixed-install' && name === '@deepseek-ai/dsh-web' ? '0.2.1-rc.2' : version)
        }
        await module('@earendil-works/pi-ai', '@earendil-works/pi-ai', '1.4.0')
        await module('@earendil-works/pi-ai-host', '@earendil-works/pi-ai', '1.4.0', 'export function createAssistantMessageEventStream() {}\n')
        await writeFile(join(directory, 'package.json'), JSON.stringify(manifest))
        await writeFile(join(directory, 'compatibility.json'), JSON.stringify(compatibility))
        const script = join(directory, 'scripts', 'check-compatibility.mjs')
        await mkdir(dirname(script))
        await writeFile(script, await readFile(new URL('scripts/check-compatibility.mjs', root)))
        const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8', timeout: 10_000 })
        expect(result.error).toBeUndefined()
        expect(result.signal).toBeNull()
        const rejection = {
          'metadata-drift': 'DSH plugin API version mismatch',
          'peer-drift': 'peer dependency @deepseek-ai/dsh-web must match',
          'mixed-install': 'installed @deepseek-ai/dsh-web does not match',
          'duplicate-package': 'package list contains duplicates',
        }[mode]
        expect(result.status).toBe(rejection === undefined ? 0 : 1)
        if (rejection === undefined) expect(JSON.parse(result.stdout)).toMatchObject({ status: 'compatible' })
        else expect(result.stderr).toContain(rejection)
      } finally { await rm(directory, { recursive: true, force: true }) }
    },
  )
})
