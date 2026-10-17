import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    expect(root.startsWith(join(tmpdir(), 'codex-release-gate-'))).toBe(true)
    await rm(root, { recursive: true, force: true })
  }
})

async function check(ending: string, missingVerification = false) {
  const root = await mkdtemp(join(tmpdir(), 'codex-release-gate-'))
  roots.push(root)
  for (const file of ['package.json', '.github/workflows/release.yml', '.github/workflows/ci.yml', 'scripts/check-release-workflow.mjs', 'scripts/verify-release-ci.test.mjs', 'scripts/verify-release-ci.mjs']) {
    let text = (await readFile(new URL(`../${file}`, import.meta.url), 'utf8')).replace(/\r\n/gu, '\n')
    if (missingVerification && file === '.github/workflows/release.yml') text = text.replace('needs: verify', 'needs: missing-verification')
    const target = join(root, file)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, text.replace(/\n/gu, ending))
  }
  const result = spawnSync(process.execPath, [join(root, 'scripts/check-release-workflow.mjs')], { encoding: 'utf8', timeout: 15_000 })
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  return result
}

describe('release workflow security gate on Windows checkouts', () => {
  it.each([['LF', '\n'], ['CRLF', '\r\n']])('retains all release checks for %s files', async (_name, ending) => {
    const result = await check(ending)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('35/35 assertions passed')
  })

  it('rejects a publish job that does not wait for verification even with CRLF', async () => {
    const result = await check('\r\n', true)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('publish waits for read-only verification')
  })
})
