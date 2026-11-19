/** Pure action, context, and circuit-breaker contracts for Codex Auto-review. */

import { createHash, randomUUID } from 'node:crypto'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock, Message, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types'
import type { CommandId } from '@deepseek-ai/dsh-commands'
// Type-only: brings the PTC dispatch session events into SessionEventMap.
import type {} from '@deepseek-ai/dsh-tool-executor-ptc/types'
import type { AutoReviewPreflightSnapshot } from './auto-review-preflight.ts'
import { sameAutoReviewSnapshot } from './auto-review-preflight.ts'

/** Consecutive denials that stop automatic review for the active turn. */
export const AUTO_REVIEW_MAX_CONSECUTIVE_DENIALS = 3
/** Denials inside the rolling decision window that stop automatic review. */
export const AUTO_REVIEW_MAX_WINDOW_DENIALS = 10
/** Decisions retained for the rolling denial breaker. */
export const AUTO_REVIEW_DECISION_WINDOW = 50
/** Denials retained for explicit human override. */
export const AUTO_REVIEW_RECENT_DENIAL_LIMIT = 10

const TRANSCRIPT_BUDGET = 20_000
const TOOL_BUDGET = 10_000
const MESSAGE_ENTRY_BUDGET = 5_000
const TOOL_ENTRY_BUDGET = 1_000
const NON_USER_ENTRY_LIMIT = 40

/** Exact immutable action reconstructed from one DSH approval request. */
export interface AutoReviewAction {
  readonly toolName: string
  readonly callId: ToolCallId
  readonly turn: number
  readonly arguments: unknown
  readonly cwd?: string
  readonly workspaceRoot?: string
  readonly provider?: string
  readonly reason?: string
  readonly fingerprint: string
}

/** Bounded provider input with explicit omission and truncation facts. */
export interface AutoReviewContext {
  readonly transcript: string
  readonly tools: string
  readonly transcriptEntriesOmitted: number
  readonly toolEntriesOmitted: number
  readonly entriesTruncated: number
  /** Complete retained user text is evidence, never an authorization grant. */
  readonly hasTrustedUserEvidence?: boolean
  readonly sensitiveValuesRedacted?: number
}

/** One recent structured denial available to `/approve`. */
export interface AutoReviewDenial {
  readonly id: string
  readonly fingerprint: string
  readonly toolName: string
  readonly rationale: string
  readonly action: AutoReviewAction
  readonly snapshot?: AutoReviewPreflightSnapshot
  readonly exactRetryAllowed: boolean
}

const REDACTED = '[REDACTED]'
const SENSITIVE_FIELD = /^(?:auth|authentication|authorization|proxyauthorization|cookie|setcookie|access|refresh)$|(?:password|passwd|passphrase|secret|secretkey|token|apikey|privatekey|credentials?)$/iu

/**
 * Best-effort redaction for text that might be included in a remote review; not a complete secret detector.
 * @param text - untrusted text, never instructions for this redactor.
 * @returns redacted text and the number of detected sensitive values.
 */
export function redactAutoReviewText(text: string): { readonly text: string; readonly redactions: number } {
  let redactions = 0
  const replace = (_value: string): string => { redactions++; return REDACTED }
  const redacted = text
    // Header values can contain several cookies with opaque names and values.
    .replace(/((?<![A-Za-z0-9_\-])(?:set[\-_]?)?cookie[ \t]*:[ \t]*)[^\r\n]*/giu,
      (_value, prefix: string) => { redactions++; return `${prefix}${REDACTED}` })
    .replace(/-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----[\s\S]*?-----END (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----/gu, replace)
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.\-]+/giu, replace)
    .replace(/\b(?:sk-[A-Za-z0-9_\-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|AKIA[A-Z0-9]{16})\b/gu, replace)
    .replace(/\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/gu, replace)
    .replace(/((?<![A-Za-z0-9_\-])"?(?:[A-Za-z0-9_\-]*(?:password|passwd|passphrase|secret|token|api[_\-]?key)|auth|authentication|authorization|(?:set[\-_]?)?cookie|access|refresh)"?\s*[=:]\s*)(?:"(?:[^"\\]|\\.)*"|'[^']*'|[^\s,;&}]+)/giu,
      (_value, prefix: string) => { redactions++; return `${prefix}${REDACTED}` })
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/giu,
      (_value, prefix: string) => { redactions++; return `${prefix}${REDACTED}@` })
  return { text: redacted, redactions }
}

/**
 * Redact nested fields with bounded traversal without changing the original exact action.
 * @param value - JSON evidence prepared for disclosure to the remote reviewer.
 * @returns a redacted copy and the number of sensitive or omitted values.
 */
export function redactAutoReviewValue(value: unknown): { readonly value: unknown; readonly redactions: number } {
  let redactions = 0
  let entries = 0
  const seen = new WeakSet<object>()
  const visit = (entry: unknown, depth: number): unknown => {
    if (++entries > 10_000 || depth > 32) { redactions++; return REDACTED }
    if (typeof entry === 'string') {
      const result = redactAutoReviewText(entry)
      redactions += result.redactions
      return result.text
    }
    if (entry !== null && typeof entry === 'object') {
      if (seen.has(entry)) { redactions++; return REDACTED }
      seen.add(entry)
      if (Array.isArray(entry)) return entry.map(child => visit(child, depth + 1))
      return Object.fromEntries(Object.entries(entry).map(([key, child]) => {
        if (SENSITIVE_FIELD.test(key.replace(/[^a-z]/giu, ''))) { redactions++; return [key, REDACTED] }
        return [key, visit(child, depth + 1)]
      }))
    }
    return entry
  }
  const result = visit(value, 0)
  return { value: result, redactions }
}

interface RenderedEntry {
  readonly index: number
  readonly trustedUser: boolean
  readonly text: string
  readonly truncated: boolean
  readonly redactions: number
}

interface ReviewTurnState {
  turn: number
  consecutiveDenials: number
  decisions: boolean[]
  timedOutFingerprints: Set<string>
  recentDenials: AutoReviewDenial[]
  armedFingerprint?: string
  armedSnapshot?: AutoReviewPreflightSnapshot
  armedCommandId?: CommandId
  armedDenialId?: string
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (record(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new TypeError('Auto-review action contains a non-JSON value')
  return encoded
}

/**
 * Resolve one exact native call or nested PTC start; all other requests stay human-owned.
 * Nested calls retain their sub-call id and take the turn from the preceding, unique run_code root.
 * @param request - borrowed Host request whose call id must identify one logged call or start.
 * @param directory - effective cwd and original workspace; omission uses header metadata only,
 *   which does not establish current execution scope or grant authorization.
 * @returns bounded action and canonical JSON fingerprint, or undefined for unresolved input.
 */
export function resolveAutoReviewAction(request: ApprovalRequestEvent, directory?: { readonly cwd: string; readonly workspaceRoot: string }): AutoReviewAction | undefined {
  if (request.callId === undefined) return undefined
  const events = request.agent.session.snapshotEvents()
  const calls = events.filter(event => event.type === 'tool/call' && event.data.callId === request.callId)
  const starts = events.filter(event => event.type === 'tool/ptc-dispatch-start' && event.data.subCallId === request.callId)
  if (calls.length + starts.length !== 1) return undefined
  const call = calls[0]
  const start = starts[0]
  let turn: number
  let encodedArguments: string
  if (call?.type === 'tool/call') {
    if (call.data.name !== request.toolName || events.some(event => event.type === 'tool/ptc-dispatch' && event.data.subCallId === request.callId)) return undefined
    turn = call.data.turn
    encodedArguments = call.data.arguments
  } else if (start?.type === 'tool/ptc-dispatch-start') {
    const roots = events.filter(event => event.type === 'tool/call' && event.data.callId === start.data.rootCallId)
    const root = roots[0]
    if (roots.length !== 1 || root?.type !== 'tool/call' || root.data.name !== 'run_code' || root.seq >= start.seq) return undefined
    if (start.data.name !== request.toolName || !record(start.data.arguments)) return undefined
    turn = root.data.turn
    try {
      const encoded = JSON.stringify(start.data.arguments)
      if (encoded === undefined) return undefined
      encodedArguments = encoded
    } catch { return undefined }
  } else return undefined
  if (Buffer.byteLength(encodedArguments, 'utf8') > TOOL_BUDGET) return undefined
  let args: unknown
  try { args = JSON.parse(encodedArguments) } catch { return undefined }
  const cwd = directory?.cwd ?? request.agent.session.header.cwd
  const workspaceRoot = directory?.workspaceRoot ?? request.agent.session.header.cwd
  const provider = request.agent.session.requestHeader?.()?.config?.provider
  const envelope = {
    ...provider === undefined ? {} : { provider },
    toolName: request.toolName,
    arguments: args,
    ...cwd === undefined ? {} : { cwd },
    ...workspaceRoot === undefined ? {} : { workspaceRoot },
  }
  return Object.freeze({
    ...provider === undefined ? {} : { provider },
    toolName: request.toolName,
    callId: request.callId,
    turn,
    arguments: args,
    ...cwd === undefined ? {} : { cwd },
    ...workspaceRoot === undefined ? {} : { workspaceRoot },
    ...request.reason === undefined ? {} : { reason: request.reason },
    fingerprint: createHash('sha256').update(canonicalJson(envelope)).digest('hex'),
  })
}

function utf8Size(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

function truncateUtf8(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (utf8Size(text) <= maxBytes) return { text, truncated: false }
  const chars = Array.from(text)
  let low = 0
  let high = chars.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (utf8Size(chars.slice(0, middle).join('')) <= maxBytes - 3) low = middle
    else high = middle - 1
  }
  return { text: `${chars.slice(0, low).join('')}…`, truncated: true }
}

function renderNarrativeBlock(block: ContentBlock): string | undefined {
  switch (block.type) {
    case 'text': return block.text
    case 'image': return '[image attachment]'
    case 'reasoning':
    case 'tool-call': return undefined
    default: return undefined
  }
}

function renderToolBlock(block: ContentBlock): string | undefined {
  switch (block.type) {
    case 'tool-call': return `call ${block.name} ${block.arguments}`
    case 'text':
    case 'image':
    case 'reasoning': return undefined
    default: return undefined
  }
}

function narrativeLabel(message: Message): string {
  if (message.source.kind === 'user') return 'trusted-user'
  if (message.source.kind === 'model') return 'assistant'
  return 'untrusted-context'
}

function renderedEntries(messages: readonly Message[], tool: boolean): RenderedEntry[] {
  const budget = tool ? TOOL_ENTRY_BUDGET : MESSAGE_ENTRY_BUDGET
  return messages.flatMap((message, index) => {
    const content = message.role === 'tool'
      ? tool ? `result ${String(message.toolCallId)}${message.isError ? ' (error)' : ''} ${message.content.map(renderNarrativeBlock).filter(Boolean).join('\n')}` : ''
      : message.content
        .map(tool ? renderToolBlock : renderNarrativeBlock)
        .filter((value): value is string => value !== undefined && value.length > 0)
        .join('\n')
    if (content.length === 0) return []
    const redacted = redactAutoReviewText(content)
    const bounded = truncateUtf8(`[${tool ? 'tool' : narrativeLabel(message)}]\n${redacted.text}`, budget)
    return [{ index, trustedUser: !tool && message.role === 'user' && message.source.kind === 'user'
      && message.content.every(block => block.type === 'text'), redactions: redacted.redactions, ...bounded }]
  })
}

function takeWithin(entries: readonly RenderedEntry[], budget: number): RenderedEntry[] {
  const selected: RenderedEntry[] = []
  let used = 0
  for (const entry of entries) {
    const size = utf8Size(entry.text)
    if (used + size > budget) continue
    selected.push(entry)
    used += size
  }
  return selected
}

function selectNarrative(entries: readonly RenderedEntry[]): RenderedEntry[] {
  const users = entries.filter(entry => entry.trustedUser)
  const selected = new Map<number, RenderedEntry>()
  let used = 0
  const add = (entry: RenderedEntry): void => {
    if (selected.has(entry.index)) return
    const size = utf8Size(entry.text)
    if (used + size > TRANSCRIPT_BUDGET) return
    selected.set(entry.index, entry)
    used += size
  }
  if (users.reduce((sum, entry) => sum + utf8Size(entry.text), 0) <= TRANSCRIPT_BUDGET) users.forEach(add)
  else {
    if (users[0] !== undefined) add(users[0])
    if (users.at(-1) !== undefined) add(users.at(-1)!)
    users.slice(1, -1).reverse().forEach(add)
  }
  entries.filter(entry => !entry.trustedUser).slice(-NON_USER_ENTRY_LIMIT).reverse().forEach(add)
  return [...selected.values()].sort((left, right) => left.index - right.index)
}

/** Build the official-style bounded review context from the retained session surface. */
export function buildAutoReviewContext(agent: Agent): AutoReviewContext {
  const messages = agent.session.deriveMessages()
  const narrative = renderedEntries(messages, false)
  const selectedNarrative = selectNarrative(narrative)
  const historicalTools = takeWithin(renderedEntries(messages, true).reverse(), TOOL_BUDGET).reverse()
  const redactedDirectory = redactAutoReviewValue(agent.session.requestHeader()?.tools ?? [])
  const directory = truncateUtf8(`[available-tools]\n${JSON.stringify(redactedDirectory.value)}`, TOOL_BUDGET)
  const remaining = Math.max(0, TOOL_BUDGET - utf8Size(directory.text))
  const selectedTools = takeWithin(historicalTools.reverse(), remaining).reverse()
  const transcriptEntriesOmitted = narrative.length - selectedNarrative.length
  const toolEntriesOmitted = renderedEntries(messages, true).length - selectedTools.length
  const transcriptPrefix = transcriptEntriesOmitted > 0 ? `[${transcriptEntriesOmitted} transcript entries omitted]\n` : ''
  const toolPrefix = toolEntriesOmitted > 0 ? `[${toolEntriesOmitted} tool entries omitted]\n` : ''
  const transcript = truncateUtf8(`${transcriptPrefix}${selectedNarrative.map(entry => entry.text).join('\n\n')}`, TRANSCRIPT_BUDGET)
  const tools = truncateUtf8(`${toolPrefix}${[directory.text, ...selectedTools.map(entry => entry.text)].join('\n\n')}`, TOOL_BUDGET)
  const entriesTruncated = [...narrative, ...renderedEntries(messages, true)].filter(entry => entry.truncated).length
    + (directory.truncated ? 1 : 0) + (transcript.truncated ? 1 : 0) + (tools.truncated ? 1 : 0)
  return Object.freeze({
    transcript: transcript.text,
    tools: tools.text,
    transcriptEntriesOmitted,
    toolEntriesOmitted,
    entriesTruncated,
    hasTrustedUserEvidence: !transcript.truncated && selectedNarrative.some(entry => entry.trustedUser)
      && selectedNarrative.filter(entry => entry.trustedUser).length === narrative.filter(entry => entry.trustedUser).length
      && selectedNarrative.filter(entry => entry.trustedUser).every(entry => !entry.truncated && entry.redactions === 0),
    sensitiveValuesRedacted: [...selectedNarrative, ...selectedTools].reduce((count, entry) => count + entry.redactions, redactedDirectory.redactions),
  })
}

/** In-memory turn state matching Codex denial, timeout, and exact retry semantics. */
export class AutoReviewState {
  private sessions = new WeakMap<Agent, ReviewTurnState>()

  constructor(private readonly createId: () => string = randomUUID) {}

  private state(agent: Agent, turn: number): ReviewTurnState {
    const current = this.sessions.get(agent)
    if (current !== undefined && current.turn === turn) return current
    const created: ReviewTurnState = {
      turn,
      consecutiveDenials: 0,
      decisions: [],
      timedOutFingerprints: new Set(),
      recentDenials: current?.recentDenials ?? [],
      ...current?.armedFingerprint === undefined ? {} : { armedFingerprint: current.armedFingerprint },
      ...current?.armedSnapshot === undefined ? {} : { armedSnapshot: current.armedSnapshot },
      ...current?.armedCommandId === undefined ? {} : { armedCommandId: current.armedCommandId },
      ...current?.armedDenialId === undefined ? {} : { armedDenialId: current.armedDenialId },
    }
    this.sessions.set(agent, created)
    return created
  }

  /** Record an allow/deny assessment and retain a bounded denial descriptor. */
  recordDecision(agent: Agent, action: AutoReviewAction, denied: boolean, rationale: string, snapshot?: AutoReviewPreflightSnapshot, exactRetryAllowed = true): AutoReviewDenial | undefined {
    const state = this.state(agent, action.turn)
    state.consecutiveDenials = denied ? state.consecutiveDenials + 1 : 0
    state.decisions.push(denied)
    if (state.decisions.length > AUTO_REVIEW_DECISION_WINDOW) state.decisions.shift()
    if (!denied) return undefined
    const denial = Object.freeze({ id: this.createId(), fingerprint: action.fingerprint, toolName: action.toolName, rationale, action, exactRetryAllowed,
      ...snapshot === undefined ? {} : { snapshot },
    })
    state.recentDenials.push(denial)
    if (state.recentDenials.length > AUTO_REVIEW_RECENT_DENIAL_LIMIT) state.recentDenials.shift()
    return denial
  }

  /** Whether the current turn must return to human review. */
  breakerOpen(agent: Agent, turn: number): boolean {
    const state = this.state(agent, turn)
    return state.consecutiveDenials >= AUTO_REVIEW_MAX_CONSECUTIVE_DENIALS
      || state.decisions.filter(Boolean).length >= AUTO_REVIEW_MAX_WINDOW_DENIALS
  }

  /** Mark a timeout; false means the same exact action already consumed its one automatic retry. */
  allowTimeoutRetry(agent: Agent, action: AutoReviewAction): boolean {
    const state = this.state(agent, action.turn)
    if (state.timedOutFingerprints.has(action.fingerprint)) return false
    state.timedOutFingerprints.add(action.fingerprint)
    return true
  }

  /** List recent denials for the active turn, newest first. */
  denials(agent: Agent): readonly AutoReviewDenial[] {
    const state = this.sessions.get(agent)
    return Object.freeze([...(state?.recentDenials ?? [])].reverse())
  }

  /** Arm one exact denial for the next approval request. */
  arm(agent: Agent, denialId: string, commandId?: CommandId): AutoReviewDenial | undefined {
    const state = this.sessions.get(agent)
    const denial = state?.recentDenials.find(candidate => candidate.id === denialId)
    if (state === undefined || denial === undefined || !denial.exactRetryAllowed) return undefined
    this.disarm(agent)
    state.armedFingerprint = denial.fingerprint
    state.armedDenialId = denial.id
    if (denial.snapshot !== undefined) state.armedSnapshot = denial.snapshot
    if (commandId !== undefined) state.armedCommandId = commandId
    return denial
  }

  /** Consume the one-shot override at the next approval boundary. */
  consume(agent: Agent, action: AutoReviewAction, snapshot?: AutoReviewPreflightSnapshot): 'matched' | 'mismatched' | 'none' {
    const state = this.state(agent, action.turn)
    if (state.armedFingerprint === undefined) return 'none'
    const matched = state.armedFingerprint === action.fingerprint
      && (snapshot === undefined || state.armedSnapshot !== undefined && sameAutoReviewSnapshot(state.armedSnapshot, snapshot)
        && state.armedCommandId !== undefined && state.armedDenialId !== undefined
        && hasAutoReviewCommandReceipt(agent, state.armedCommandId, state.armedDenialId, true))
    this.disarm(agent)
    return matched ? 'matched' : 'mismatched'
  }

  /** Consume any pending retry when the next request cannot be resolved. */
  disarm(agent: Agent): void {
    const state = this.sessions.get(agent)
    if (state === undefined) return
    delete state.armedFingerprint
    delete state.armedSnapshot
    delete state.armedCommandId
    delete state.armedDenialId
  }

  /** Forget all decisions and grants when the owning reviewer is disposed. */
  clear(): void {
    this.sessions = new WeakMap()
  }
}

/**
 * Check the durable human command chain, not model text or a plugin-generated user message.
 * @param agent - exact owner of the command log and one-shot retry.
 * @param commandId - command runtime's recorded invocation identity.
 * @param denialId - full id the human command must explicitly name.
 * @param completed - false inside the live handler; true before granting its later exact retry.
 * @returns whether exactly one matching user command is pending or successfully completed.
 */
export function hasAutoReviewCommandReceipt(agent: Agent, commandId: CommandId, denialId: string, completed: boolean): boolean {
  const events = agent.session.snapshotEvents()
  const runs = events.filter(event => event.type === 'command/run' && event.data.commandId === commandId)
  const run = runs[0]
  if (runs.length !== 1 || run?.type !== 'command/run' || run.data.name !== 'approve'
    || run.data.source.kind !== 'user' || run.data.args?.trim() !== denialId) return false
  const done = events.filter(event => event.type === 'command/done' && event.data.commandId === commandId)
  return completed ? done.length === 1 && done[0]?.type === 'command/done' && done[0].data.kind === 'success' : done.length === 0
}
