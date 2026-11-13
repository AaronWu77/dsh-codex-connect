import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import { localHostResolution } from './tests/support/local-host-resolution.ts'

const packageVersion = (JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }).version

export default defineConfig({
  plugins: localHostResolution(new URL('./local-host-validation.json', import.meta.url)),
  resolve: { dedupe: ['react', 'react-dom'] },
  define: {
    __CODEX_CONNECT_VERSION__: JSON.stringify(packageVersion),
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    exclude: ['tests/browser/**'],
    testTimeout: 30_000,
    // Linked Host packages have real paths outside node_modules; inline both path forms.
    server: { deps: { inline: [/[/\\](?:dsh-client-)?ui-primitives[/\\]/] } },
  },
})
