import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import { localHostResolution } from './tests/support/local-host-resolution.ts'
import { playwright } from '@vitest/browser-playwright'

const packageVersion = (JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }).version

export default defineConfig({
  plugins: localHostResolution(new URL('./local-host-validation.json', import.meta.url)),
  define: {
    __CODEX_CONNECT_VERSION__: JSON.stringify(packageVersion),
  },
  test: {
    include: ['tests/browser/**/*.browser.client.spec.tsx'],
    testTimeout: 30_000,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
})
