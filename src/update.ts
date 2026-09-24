/** Version precedence and verified DSH-compatibility parsing for Codex Connect. */

export interface OpenAICodexVerifiedPluginVersion {
  version: string
  verifiedDshVersions: string[]
}

export interface OpenAICodexVerifiedCompatibilityCatalog {
  schemaVersion: 1
  checkedAt: string
  latestDshVersion: string
  pluginVersions: OpenAICodexVerifiedPluginVersion[]
}

interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: Array<number | string>
}

function parseVersionParts(raw: string): ParsedVersion | undefined {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(raw)
  if (match === null) return undefined
  const rawPrerelease = match[4] === undefined ? [] : match[4].split('.')
  if (rawPrerelease.some(identifier => /^\d+$/u.test(identifier) && !/^(0|[1-9]\d*)$/u.test(identifier))) return undefined
  const prerelease = rawPrerelease.map(identifier => /^(0|[1-9]\d*)$/u.test(identifier) ? Number(identifier) : identifier)
  if (prerelease.some(identifier => typeof identifier === 'number' && !Number.isSafeInteger(identifier))) return undefined
  const parsed = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  }
  return [parsed.major, parsed.minor, parsed.patch].every(Number.isSafeInteger) ? parsed : undefined
}

/** Parse one exact package version, accepting the conventional leading `v`. */
export function parseOpenAICodexVersion(raw: string): ParsedVersion | undefined {
  if (typeof raw !== 'string') return undefined
  const normalized = raw.startsWith('v') ? raw.slice(1) : raw
  return parseVersionParts(normalized)
}

function compareIdentifiers(left: number | string, right: number | string): number {
  if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : left > right ? 1 : 0
  if (typeof left === 'number') return -1
  if (typeof right === 'number') return 1
  return left < right ? -1 : left > right ? 1 : 0
}

/** Compare two package versions using SemVer precedence (build metadata ignored). */
export function compareOpenAICodexVersions(left: string, right: string): number {
  const a = parseOpenAICodexVersion(left)
  const b = parseOpenAICodexVersion(right)
  if (a === undefined || b === undefined) throw new TypeError('invalid OpenAI Codex version')
  for (const [aPart, bPart] of [[a.major, b.major], [a.minor, b.minor], [a.patch, b.patch]] as const) {
    if (aPart !== bPart) return aPart < bPart ? -1 : 1
  }
  if (a.prerelease.length === 0 && b.prerelease.length !== 0) return 1
  if (a.prerelease.length !== 0 && b.prerelease.length === 0) return -1
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const aPart = a.prerelease[index]
    const bPart = b.prerelease[index]
    if (aPart === undefined) return -1
    if (bPart === undefined) return 1
    const comparison = compareIdentifiers(aPart, bPart)
    if (comparison !== 0) return comparison
  }
  return 0
}

/** Parse the repository-owned compatibility catalog without assuming version ranges are monotonic. */
export function parseOpenAICodexVerifiedCompatibility(value: unknown): OpenAICodexVerifiedCompatibilityCatalog | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const checkedAt = record['checkedAt']
  const latestDshVersion = record['latestDshVersion']
  const rawPluginVersions = record['pluginVersions']
  if (record['schemaVersion'] !== 1
    || typeof checkedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/u.test(checkedAt)
    || typeof latestDshVersion !== 'string'
    || parseOpenAICodexVersion(latestDshVersion) === undefined
    || !Array.isArray(rawPluginVersions)
    || rawPluginVersions.length > 256) return undefined
  const pluginVersions: OpenAICodexVerifiedPluginVersion[] = []
  const seenPluginVersions = new Set<string>()
  for (const rawPluginVersion of rawPluginVersions) {
    if (typeof rawPluginVersion !== 'object' || rawPluginVersion === null || Array.isArray(rawPluginVersion)) return undefined
    const pluginVersion = rawPluginVersion as Record<string, unknown>
    const version = pluginVersion['version']
    const rawVerified = pluginVersion['verifiedDshVersions']
    if (typeof version !== 'string'
      || parseOpenAICodexVersion(version) === undefined
      || seenPluginVersions.has(version)
      || !Array.isArray(rawVerified)
      || rawVerified.length > 64) return undefined
    const verifiedDshVersions: string[] = []
    for (const rawDshVersion of rawVerified) {
      if (typeof rawDshVersion !== 'string'
        || parseOpenAICodexVersion(rawDshVersion) === undefined
        || verifiedDshVersions.includes(rawDshVersion)) return undefined
      verifiedDshVersions.push(rawDshVersion)
    }
    seenPluginVersions.add(version)
    pluginVersions.push({ version, verifiedDshVersions })
  }
  return { schemaVersion: 1, checkedAt, latestDshVersion, pluginVersions }
}
