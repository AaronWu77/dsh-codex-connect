/** Local file eligibility checks; execution-time sandbox and observation checks remain authoritative. */

import { dirname, isAbsolute, relative, resolve, sep, win32 } from 'node:path'
import type { FsObservation, FsTargetKey } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-working-directory'
import type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types'
import type { AutoReviewAction } from './auto-review-contract.ts'
import { redactAutoReviewValue, resolveAutoReviewAction } from './auto-review-contract.ts'

import type { AutoReviewLocalPolicy } from './auto-review-local-policy.ts'
export type { AutoReviewLocalPolicy } from './auto-review-local-policy.ts'

/** Retained metadata for revalidation; opaque keys are compared, never interpreted as paths. */
export interface AutoReviewPreflightSnapshot {
  readonly world: 'host-local'
  readonly policy: AutoReviewLocalPolicy
  readonly cwd: string
  readonly workspaceRoot: string
  readonly cwdKey: FsTargetKey
  readonly workspaceKey: FsTargetKey
  readonly targetKey: FsTargetKey
  readonly observation: FsObservation
  readonly riskFloor: 'low' | 'medium'
}

/** Eligibility is not authority: manual mode never grants a remote allow. */
export type AutoReviewPreflight =
  | { readonly kind: 'eligible'; readonly action: AutoReviewAction; readonly snapshot: AutoReviewPreflightSnapshot }
  | { readonly kind: 'human'; readonly reason: string }

/** Unsupported effects remain owned by the Host human approval chain. */
export type AutoReviewActionPolicy = { readonly riskFloor: 'low' | 'medium' } | { readonly humanReason: string }

const SENSITIVE_PATH = /(?:^|\/)(?:\.env(?:rc|\.[^/]*)?|\.(?:ssh|aws|dsh|codex|git|gitconfig|git-credentials|gitmodules|agents|docker|kube|gnupg|azure|gcloud|npmrc|pypirc|netrc|bashrc|zshrc)|id_(?:rsa|dsa|ecdsa|ed25519)|credentials?(?:\.[^/]*)?|auth\.json|\.openai-codex-auth\.json(?:\.v1-backup)?|[^/]*\.key|[^/]*\.pem|keychains?)(?:\/|$)/iu
const SENSITIVE_WRITE_PATH = /(?:^|\/)(?:\.(?:claude|config|github|vscode|idea|mcp\.json|profile|bash_profile|zprofile|zshenv)|(?:AGENTS|CLAUDE|GEMINI|SKILL)\.md|copilot-instructions\.md|cordis(?:\.patch)?\.ya?ml)(?:\/|$)/iu
const SCHEMAS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  read: ['file_path', 'offset', 'limit'], read_image: ['file_path'],
  write: ['file_path', 'content'], edit: ['file_path', 'old_string', 'new_string', 'replace_all'],
  str_replace_editor: ['command', 'path', 'file_text', 'insert_line', 'new_str', 'old_str', 'view_range'],
})

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sensitive(path: string): boolean {
  const normalized = path.replaceAll('\\', '/')
  return SENSITIVE_PATH.test(normalized) || SENSITIVE_WRITE_PATH.test(normalized)
}

/**
 * Check exact JSON fields, lexical scope and sensitive paths without reading contents.
 * Manual mode permits only eligibility checks and exact human-command retries, never automatic authority.
 * @param action - exact logged action with the effective cwd and original workspace.
 * @param policy - explicit operator-selected local authorization scope.
 * @returns the minimum local risk, or the reason the Host human chain must decide.
 */
export function assessAutoReviewActionPolicy(action: AutoReviewAction, policy: AutoReviewLocalPolicy): AutoReviewActionPolicy {
  const human = (humanReason: string): AutoReviewActionPolicy => ({ humanReason })
  try {
    if (Buffer.byteLength(JSON.stringify(action), 'utf8') > 10_000) return human('The exact action exceeds the local review input limit.')
  } catch (error) { return human('The exact action cannot be serialized safely.') }
  if (!record(action.arguments) || action.cwd === undefined || action.workspaceRoot === undefined
    || !isAbsolute(action.cwd) || !isAbsolute(action.workspaceRoot)) return human('The execution directory or authorization scope is unavailable.')
  if (redactAutoReviewValue(action.arguments).redactions > 0) return human('The action contains potentially sensitive data.')
  const args = action.arguments
  const fields = Object.hasOwn(SCHEMAS, action.toolName) ? SCHEMAS[action.toolName] : undefined
  if (fields === undefined || Object.keys(args).some(key => !fields.includes(key))) return human('This tool or argument schema requires human approval.')
  for (const [key, value] of Object.entries(args)) {
    if (['offset', 'limit', 'insert_line'].includes(key)) {
      if (!(typeof value === 'number' && Number.isSafeInteger(value) && value >= 1)) return human('A numeric argument is ambiguous.')
    } else if (key === 'view_range') {
      if (value !== null && !(Array.isArray(value) && value.length === 2 && value.every(Number.isSafeInteger))) return human('The view range is ambiguous.')
    } else if (key === 'replace_all') {
      if (typeof value !== 'boolean') return human('The replacement mode is ambiguous.')
    } else if (typeof value !== 'string' && !(['file_text', 'new_str', 'old_str'].includes(key) && value === null)) {
      return human('An argument has an unsupported type.')
    }
  }
  const required = action.toolName === 'write' ? ['content'] : action.toolName === 'edit' ? ['old_string', 'new_string'] : []
  if (required.some(key => typeof args[key] !== 'string')) return human('Required file arguments are missing.')
  const writes = action.toolName === 'write' || action.toolName === 'edit'
    || action.toolName === 'str_replace_editor' && args['command'] !== 'view'
  if (writes && policy === 'workspace-read') return human('The local authorization scope does not permit file changes.')
  const target = args['file_path'] ?? args['path']
  if (typeof target !== 'string' || target.trim().length === 0 || /[\x00-\x1f~$%]/u.test(target)
    || /^(?:\\\\|\/\/)/u.test(target)
    || /(?:^|[\\/])(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.[^\\/]*)?(?:[\\/]|$)/iu.test(target) || /(?:^|[\\/])[^\\/]*[. ](?:[\\/]|$)/u.test(target.replaceAll('..', ''))
    || target.replace(/^[A-Za-z]:[\\/]/u, '').includes(':')) return human('The action target is ambiguous.')
  // Rooted Windows paths choose a drive differently in the editor and cwd-aware tools.
  if (process.platform === 'win32' && win32.parse(target).root.length === 1) return human('A Windows target requires an explicit drive or an unambiguous relative path.')
  if (action.toolName === 'str_replace_editor' && (!isAbsolute(target)
    || process.platform === 'win32' && !(win32.isAbsolute(target) && /^[A-Za-z]:/u.test(target)))) {
    return human('The editor requires a fully qualified absolute file path.')
  }
  const path = resolve(action.cwd, target)
  const fromWorkspace = relative(action.workspaceRoot, path)
  if (fromWorkspace === '..' || fromWorkspace.startsWith('..' + sep) || isAbsolute(fromWorkspace)) return human('The path is outside the original session workspace.')
  if (sensitive(path)) return human('The action targets credentials or persistent security and agent configuration.')
  if (action.toolName === 'str_replace_editor' && (!['view', 'create', 'str_replace', 'insert'].includes(String(args['command']))
    || args['command'] === 'create' && typeof args['file_text'] !== 'string'
    || args['command'] === 'str_replace' && typeof args['old_str'] !== 'string'
    || args['command'] === 'insert' && (typeof args['new_str'] !== 'string' || !Number.isSafeInteger(args['insert_line'])))) {
    return human('The editor operation is missing required arguments or is unsupported.')
  }
  return { riskFloor: writes ? 'medium' : 'low' }
}

/**
 * Resolve only metadata using the agent's current filesystem and working-directory services.
 * A current instance of the external LocalFileSystem class establishes the host-local execution world;
 * all other providers remain human-owned. No file contents are read and no permissions are changed.
 * @param request - borrowed public Host approval request, including its exact logged tool call.
 * @param policy - explicit local authorization scope, re-read for every preflight.
 * @param signal - cancellation of the owning request and reviewer lifecycle.
 * @returns eligible action and canonical observations, or a human-only reason.
 * @throws on cancelled or unavailable filesystem operations; the answerer must fail closed.
 */
export async function resolveAutoReviewPreflight(request: ApprovalRequestEvent, policy: AutoReviewLocalPolicy, signal: AbortSignal): Promise<AutoReviewPreflight> {
  const human = (reason: string): AutoReviewPreflight => ({ kind: 'human', reason })
  if (!Object.hasOwn(SCHEMAS, request.toolName)) return human('This tool has no local eligibility policy.')
  const fs = request.agent.ctx.get('fs')
  const directories = request.agent.ctx.get('workingDirectory')
  if (fs === undefined || directories === undefined) return human('The filesystem and effective execution directory cannot be established.')
  let localModule
  try { localModule = await import('@deepseek-ai/dsh-fs-local') } catch (error) {
    return human('The local filesystem implementation is unavailable; the host must approve this action.')
  }
  signal.throwIfAborted()
  if (!(fs instanceof localModule.LocalFileSystem)) return human('The filesystem is not a proven host-local execution world.')
  const workspaceRoot = request.agent.session.header.cwd
  if (workspaceRoot === undefined || !isAbsolute(workspaceRoot)) return human('The original workspace authorization scope is unavailable.')
  const cwd = await directories.ensure(request.agent, signal)
  signal.throwIfAborted()
  const action = resolveAutoReviewAction(request, { cwd, workspaceRoot })
  if (action === undefined) return human('The exact logged tool action cannot be established.')
  const local = assessAutoReviewActionPolicy(action, policy)
  if ('humanReason' in local) return human(local.humanReason)
  if (!record(action.arguments)) return human('The exact arguments cannot be resolved.')
  const path = String(action.arguments['file_path'] ?? action.arguments['path'])
  const workspace = await fs.resolve(workspaceRoot, { signal })
  const directory = await fs.resolve(cwd, { signal })
  const target = await fs.resolve(path, { cwd, signal })
  const [workspaceInfo, directoryInfo, info, entry] = await Promise.all([
    fs.stat(workspace, signal), fs.stat(directory, signal), fs.stat(target, signal), fs.lstat(path, { cwd }, signal),
  ])
  signal.throwIfAborted()
  if (workspaceInfo?.type !== 'directory' || directoryInfo?.type !== 'directory'
    || !fs.contains(workspace, directory) || !fs.contains(workspace, target)) return human('The canonical target or directory escapes the original workspace.')
  if (sensitive(fs.processPath(target))) return human('The canonical target is security-sensitive.')
  if (entry?.type === 'symlink' || info !== undefined && info.type !== 'file') return human('Only ordinary, non-link files are locally eligible.')
  if (info === undefined) {
    if (entry !== undefined || !(action.toolName === 'write' || action.toolName === 'str_replace_editor' && action.arguments['command'] === 'create')) {
      return human('The target is not an existing ordinary file or a genuinely absent output.')
    }
    const parent = await fs.resolve(dirname(resolve(cwd, path)), { signal })
    if ((await fs.stat(parent, signal))?.type !== 'directory' || !fs.contains(workspace, parent)) return human('The immediate output parent is unavailable or outside the workspace.')
  }
  signal.throwIfAborted()
  return { kind: 'eligible', action, snapshot: {
    world: 'host-local', policy, cwd, workspaceRoot, cwdKey: directory.targetKey, workspaceKey: workspace.targetKey,
    targetKey: target.targetKey, observation: info === undefined ? { kind: 'absent' } : { kind: 'present', version: info.version }, riskFloor: local.riskFloor,
  } }
}

/**
 * Compare opaque observations from the proven host-local world, not transient Cordis trace proxies.
 * Rechecks narrow stale-target exposure but cannot eliminate a later filesystem TOCTOU race;
 * execution-time sandbox and observation checks remain authoritative.
 * @param left - observations retained before the review or exact command.
 * @param right - freshly resolved observations.
 * @returns whether the action still addresses the same observed target and local authorization scope.
 */
export function sameAutoReviewSnapshot(left: AutoReviewPreflightSnapshot, right: AutoReviewPreflightSnapshot): boolean {
  return left.world === right.world && left.policy === right.policy && left.cwd === right.cwd && left.workspaceRoot === right.workspaceRoot
    && left.cwdKey === right.cwdKey && left.workspaceKey === right.workspaceKey && left.targetKey === right.targetKey && left.riskFloor === right.riskFloor
    && left.observation.kind === right.observation.kind
    && (left.observation.kind === 'absent' || right.observation.kind === 'present' && left.observation.version === right.observation.version)
}
