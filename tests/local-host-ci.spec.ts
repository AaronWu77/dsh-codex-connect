/** The fork CI must pair runtime and declarations and keep every required check. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
const required = [
  'repository: AaronWu77/deepseek-harness',
  'ref: 5414d2bcfab351b228023d4abaccced341a4c33b',
  'pnpm run build:artifacts',
  'prepare:local-host',
  'DSH_CODEX_TEST_CLIENT=',
  'pnpm run typecheck',
  'pnpm run lint',
  'pnpm run check:release-workflow',
  'pnpm run check:canary-workflow',
  'pnpm run check:capability-cli',
  'pnpm run check:env-proxy-import',
  'pnpm run check:compatibility',
  'pnpm run pack:check',
  'pnpm --silent run check:dsh-matrix',
  'pnpm run test:browser',
] as const

function validate(text: string): void {
  for (const entry of required) assert.ok(text.includes(entry), `Missing required CI input or check: ${entry}`)
  assert.doesNotMatch(text, /continue-on-error:\s*true/u)
}

describe('paired local Host CI', () => {
  it('checks the pinned Host runtime, types, artifacts, browser and published install matrix', () => {
    validate(workflow)
  })
  it.each(required)('rejects a missing %s', entry => {
    expect(() => validate(workflow.replaceAll(entry, 'removed-for-negative-control'))).toThrow('Missing required CI input or check:')
  })
  it('rejects an ignored failure', () => {
    expect(() => validate(workflow + '\ncontinue-on-error: true\n')).toThrow()
  })
})
