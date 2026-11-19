import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { assertReleaseCI, REQUIRED_CI_JOBS } from './verify-release-ci.mjs'

const sha = 'a'.repeat(40)
const repository = 'fixture/project'
const run = { head_sha: sha, head_branch: 'main', repository: { full_name: repository }, path: '.github/workflows/ci.yml', event: 'push', status: 'completed', conclusion: 'success' }
const jobs = REQUIRED_CI_JOBS.map(name => ({ name, status: 'completed', conclusion: 'success' }))
assert.doesNotThrow(() => assertReleaseCI(run, jobs, sha, repository))
for (const change of [{ head_sha: 'b'.repeat(40) }, { status: 'in_progress' }, { conclusion: 'failure' }, { head_branch: 'other' }, { event: 'pull_request' }, { path: 'other.yml' }, { repository: { full_name: 'other/repo' } }]) {
  assert.throws(() => assertReleaseCI({ ...run, ...change }, jobs, sha, repository))
}
for (const conclusion of ['failure', 'skipped', 'cancelled']) {
  assert.throws(() => assertReleaseCI(run, jobs.map(job => job.name === 'validate' ? { ...job, conclusion } : job), sha, repository))
}
assert.throws(() => assertReleaseCI(run, jobs.filter(job => job.name !== 'validate'), sha, repository))
assert.throws(() => assertReleaseCI(run, jobs.map(job => ({ ...job, status: 'in_progress' })), sha, repository))
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replace(/\r\n/gu, '\n')
function assertWorkflowJobs(text) {
  const body = text.slice(text.indexOf('\njobs:\n'))
  const names = [...body.matchAll(/^  ([A-Za-z0-9_-]+):$/gm)].map(match => match[1])
  assert.deepEqual(names.sort(), [...REQUIRED_CI_JOBS].sort())
}
assert.doesNotThrow(() => assertWorkflowJobs(workflow))
assert.throws(() => assertWorkflowJobs(workflow.replace('  validate:', '  renamed-validation:')))
console.log('Release CI decision: 15 assertions passed')
