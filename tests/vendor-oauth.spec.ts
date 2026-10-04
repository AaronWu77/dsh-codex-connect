import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
const files = ['auth/oauth/openai-codex.js', 'auth/oauth/device-code.js', 'auth/oauth/oauth-page.js', 'auth/oauth/pkce.js', 'utils/provider-env.js']

afterEach(async () => {
  for (const root of roots.splice(0)) {
    expect(root.startsWith(join(tmpdir(), 'codex-vendor-check-'))).toBe(true)
    await rm(root, { recursive: true, force: true })
  }
})

async function check(lineEnding: string, changed = false) {
  const root = await mkdtemp(join(tmpdir(), 'codex-vendor-check-'))
  roots.push(root)
  await mkdir(join(root, 'scripts'))
  const script = await readFile(new URL('../scripts/vendor-codex-oauth.mjs', import.meta.url), 'utf8')
  await writeFile(join(root, 'scripts/vendor-codex-oauth.mjs'), script)
  await symlink(new URL('../node_modules', import.meta.url), join(root, 'node_modules'), 'junction')
  for (const file of files) {
    const target = join(root, 'vendor/pi-ai-oauth', file)
    await mkdir(dirname(target), { recursive: true })
    const text = (await readFile(new URL(`../vendor/pi-ai-oauth/${file}`, import.meta.url), 'utf8')).replace(/\r\n/gu, '\n')
    await writeFile(target, text.replace(/\n/gu, lineEnding) + (changed && file === files[0] ? '\nthrow new Error("vendor drift");\n' : ''))
  }
  const result = spawnSync(process.execPath, [join(root, 'scripts/vendor-codex-oauth.mjs')], { encoding: 'utf8', timeout: 15_000 })
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  return result
}

describe('pinned OAuth copy validation', () => {
  it.each([['LF', '\n'], ['CRLF', '\r\n']])('accepts %s checkout line endings without changing the pinned source', async (_name, ending) => {
    const result = await check(ending)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('patches verified')
  })

  it('still rejects a changed statement in a CRLF checkout', async () => {
    const result = await check('\r\n', true)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Vendor drift: auth/oauth/openai-codex.js')
  })
})
