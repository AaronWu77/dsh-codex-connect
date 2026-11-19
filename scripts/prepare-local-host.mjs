#!/usr/bin/env node

/** Create an isolated source/build checkout against one already-built local Host. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const host = process.argv[2]
if (host === undefined || process.argv.length !== 3) throw new Error('Usage: node scripts/prepare-local-host.mjs <built-harness-checkout>')
const hostRoot = await realpath(resolve(host))
const manifest = JSON.parse(await readFile(join(hostRoot, 'package.json'), 'utf8'))
if (manifest.name !== '@deepseek-ai/dsh-root') throw new Error('The Host path must identify the DeepSeek Harness checkout')

const hostPackages = new Map()
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(directory, entry.name)
    let metadata
    try { metadata = JSON.parse(await readFile(join(path, 'package.json'), 'utf8')) } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    if (typeof metadata.name === 'string' && metadata.name.startsWith('@deepseek-ai/')) {
      if (hostPackages.has(metadata.name)) throw new Error(`Duplicate Host package: ${metadata.name}`)
      hostPackages.set(metadata.name, path)
    }
  }
}
for (const group of await readdir(join(hostRoot, 'packages'), { withFileTypes: true })) {
  if (group.isDirectory()) await collect(join(hostRoot, 'packages', group.name))
}
await collect(join(hostRoot, 'vendor'))
for (const name of ['@deepseek-ai/cordis', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-web', '@deepseek-ai/dsh-session-projection']) {
  if (!hostPackages.has(name)) throw new Error(`The Host checkout is missing ${name}`)
}

const inventory = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
if (inventory.error !== undefined) throw inventory.error
if (inventory.status !== 0) throw new Error(`Cannot inventory plugin source: ${inventory.stderr}`)
const pairing = await readFile(join(root, 'README.i18n.yaml'), 'utf8')
for (const path of ['README.md', 'docs/README.zh.md']) {
  const bytes = Buffer.from((await readFile(join(root, path), 'utf8')).replace(/\r\n/gu, '\n'))
  const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  if (!pairing.includes(`${path}: ${hash}`)) throw new Error(`Update README.i18n.yaml before preparing ${path}`)
}
const stagingRoot = join(root, '.tmp')
await mkdir(stagingRoot, { recursive: true })
const staging = await mkdtemp(join(stagingRoot, 'local-host-'))
for (const path of inventory.stdout.split('\0').filter(Boolean)) {
  if (/^(?:node_modules|lib|ws-package-candidate|\.git|\.tmp|\.local)(?:\/|$)/u.test(path)) throw new Error(`Unexpected source inventory path: ${path}`)
  const target = join(staging, path)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(join(root, path), target)
}

const modules = join(staging, 'node_modules')
await mkdir(modules)
for (const entry of await readdir(join(root, 'node_modules'), { withFileTypes: true })) {
  if (entry.name === '@deepseek-ai' || entry.name === '.modules.yaml' || entry.name === '.pnpm-workspace-state-v1.json') continue
  if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
  await symlink(await realpath(join(root, 'node_modules', entry.name)), join(modules, entry.name), 'junction')
}
await mkdir(join(modules, '@deepseek-ai'))
for (const [name, path] of hostPackages) await symlink(path, join(modules, name), 'junction')
await writeFile(join(staging, 'local-host-validation.json'), JSON.stringify({
  host: hostRoot, hostVersion: manifest.version, source: root, hostPackages: Object.fromEntries(hostPackages),
}, null, 2) + '\n')
console.log(staging)
