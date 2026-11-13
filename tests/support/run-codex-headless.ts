/** Run the supported DSH profile launcher against local Codex WS/SSE fixtures only. */
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { createCodexWsFixture } from './codex-ws-fixture.ts'

const bin = process.env['CODEX_DSH_BIN']
if (bin === undefined) throw new Error('CODEX_DSH_BIN must identify the real built dsh CLI')
const fixtureEntry = fileURLToPath(new URL('../../.tmp/ws-candidate/fixture/headless-codex-entry.js', import.meta.url))
const prefix = fileURLToPath(new URL('../../.tmp/ws-headless-', import.meta.url))
for (const mode of ['success', 'reject'] as const) {
  const root = await mkdtemp(prefix)
  const server = await createCodexWsFixture(mode)
  try {
    const overlay = join(root, 'offline-overlay.json')
    await writeFile(overlay, JSON.stringify([
      { id: 'agent-default-model', config: { provider: 'openai-codex', model: openaiCodexProvider().getModels()[0]!.id } },
      { insert: [{ id: 'codex-headless-network-fixture', name: fixtureEntry, config: { endpoint: server.url } }] },
    ]))
    const env: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: root, DSH_TELEMETRY_DISABLED: '1' }
    delete env['DSH_PROFILE_DIR']
    delete env['DSH_PROFILE']
    const started = performance.now()
    const child = spawn(process.execPath, [bin, '--profile', 'headless', '--patch', overlay, 'Return the offline fixture answer.'], {
      cwd: root, env, stdio: 'inherit', signal: AbortSignal.timeout(60_000),
    })
    const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done, fail) => {
      child.once('error', fail)
      child.once('exit', (code, signal) => done({ code, signal }))
    })
    assert.equal(outcome.code, 0)
    assert.equal(outcome.signal, null)
    assert.ok(server.upgrades >= 1)
    assert.equal(server.httpRequests, mode === 'success' ? 0 : server.upgrades)
    await server.waitClosed()
    console.log(JSON.stringify({ check: 'real-dsh-headless', mode, naturalExit: true, upgrades: server.upgrades,
      sseRequests: server.httpRequests, elapsedMs: Math.round(performance.now() - started) }))
  } finally {
    await server.dispose()
    // The exact directory was allocated by this driver, beneath its fixed private test prefix.
    if (!resolve(root).startsWith(resolve(prefix))) throw new Error('Refusing unexpected fixture cleanup path')
    await rm(root, { recursive: true, force: true })
  }
}
