/** Resolve both test faces through the generated Host package catalog. */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/**
 * Keep Vite's runtime imports on the same packages used by the paired TypeScript check.
 * @param metadata - Generated local Host catalog; absent for the published-package baseline.
 * @returns A pre-resolution plugin when a local Host catalog exists.
 */
export function localHostResolution(metadata: URL) {
  if (!existsSync(metadata)) return []
  const value: unknown = JSON.parse(readFileSync(metadata, 'utf8'))
  if (value === null || typeof value !== 'object' || !('hostPackages' in value)
    || value.hostPackages === null || typeof value.hostPackages !== 'object' || Array.isArray(value.hostPackages)) {
    throw new Error('Local Host validation metadata must contain a package catalog')
  }
  const packages = new Map<string, string>()
  for (const [name, directory] of Object.entries(value.hostPackages)) {
    if (!name.startsWith('@deepseek-ai/') || typeof directory !== 'string') throw new Error('Invalid local Host package entry')
    packages.set(name, directory)
  }
  return [{
    name: 'codex-local-host-resolution',
    enforce: 'pre' as const,
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return
      const name = source.split('/').slice(0, 2).join('/')
      const directory = packages.get(name)
      if (directory === undefined) return
      // Resolve self-exports, including /client, through the selected package's own manifest.
      return createRequire(join(directory, 'package.json')).resolve(source).replaceAll('\\', '/')
    },
  }]
}
