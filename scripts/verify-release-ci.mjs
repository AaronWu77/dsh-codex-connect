import { pathToFileURL } from 'node:url'

export const REQUIRED_CI_JOBS = Object.freeze(['validate', 'windows-canary-contract'])

/** Fail closed unless the selected main SHA completed every required CI job. */
export function assertReleaseCI(run, jobs, sha, repository) {
  if (!/^[a-f0-9]{40}$/.test(sha) || run?.head_sha !== sha || run.head_branch !== 'main'
    || run.repository?.full_name !== repository || run.path !== '.github/workflows/ci.yml'
    || !['push', 'workflow_dispatch'].includes(run.event)
    || run.status !== 'completed' || run.conclusion !== 'success') throw new Error('Release SHA does not have completed successful main CI')
  if (!Array.isArray(jobs) || jobs.some(job => job.status !== 'completed' || job.conclusion !== 'success')
    || REQUIRED_CI_JOBS.some(name => !jobs.some(job => job.name === name))) throw new Error('Required release CI jobs are missing or unsuccessful')
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY
  const sha = process.env.GITHUB_SHA
  if (!repository || !sha || !process.env.GH_TOKEN) throw new Error('Missing release CI identity')
  const get = async path => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`CI API failed: ${response.status}`)
    return response.json()
  }
  const listing = await get(`actions/workflows/ci.yml/runs?head_sha=${sha}&branch=main&per_page=100`)
  const run = listing.workflow_runs?.[0]
  if (!run) throw new Error('No main CI run for release SHA')
  const result = await get(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`)
  if (result.total_count !== result.jobs?.length) throw new Error('Incomplete CI job listing')
  assertReleaseCI(run, result.jobs, sha, repository)
  console.log(`Release CI verified: ${sha}, run ${run.id}, attempt ${run.run_attempt}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
