import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

/** The reported token count and settled request count for one calendar day. */
export interface CodexConnectUsageDay {
  tokens: number
  requests: number
}

/** Client-visible own-session usage, bucketed in the configured calendar. */
export interface CodexConnectUsageView {
  timeZone: string
  days: Record<string, CodexConnectUsageDay>
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    codexConnectUsage: CodexConnectUsageView
  }
  interface SessionProjectionStateMap {
    codexConnectUsage: CodexConnectUsageState
  }
}

/** Checkpoint state for own-session counts and their completeness. */
export interface CodexConnectUsageState {
  semanticsVersion: 6
  inheritedEventCount: number
  retainedDays: number
  /** At least one own event could not be represented. */
  fault: boolean
  /** Some own request usage is missing, malformed, or cannot fit in safe counters. */
  incompleteUsage: boolean
  /** Recent own-event dates form an upper bound on retained activity dates. */
  possibleDays: string[]
  /** An uncertain activity date may evict a visible usage day. */
  retentionUncertain: boolean
  /** A turn has started anywhere in this Session, including its inherited prefix. */
  hasTurnStart: boolean
  /** Open own-session step, used to retain its completion day. */
  stepStartTime?: number
  /** Pending tool IDs are hashed and grouped by digest prefix; true marks question calls. */
  pendingTools: Record<string, Record<string, boolean>>
  totalTokens: number
  totalRequests: number
  view: CodexConnectUsageView
}

/** Calendar and retention settings, supplied by the registering owner. */
export interface CodexConnectUsageOptions {
  timeZone: string
  retainedDays: number
}

const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const daySchema = z.object({ tokens: countSchema, requests: countSchema }).strict()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00.000Z')
  return Number(value.slice(0, 4)) >= 1970 && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
})
const viewSchema = z.object({ timeZone: z.string(), days: z.record(dateSchema, daySchema) }).strict()

function hasUncertainRetention(days: Record<string, CodexConnectUsageDay>, possibleDays: readonly string[]): boolean {
  const possible = new Set(possibleDays)
  return Object.entries(days).some(([date, value]) => (value.tokens !== 0 || value.requests !== 0) && !possible.has(date))
}

function reportedCount(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return undefined
  const rounded = Math.round(n)
  return Number.isSafeInteger(rounded) ? rounded : undefined
}

function configurationVersion(timeZone: string, retainedDays: number): number {
  const digest = createHash('sha256').update(JSON.stringify([6, timeZone, retainedDays,
    process.versions.node, process.versions.icu, process.versions.tz])).digest()
  return digest.readUIntBE(0, 6) * 16 + (digest.readUInt8(6) >> 4) + 6
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

type PendingTools = CodexConnectUsageState['pendingTools']

function toolDigest(callId: string): [string, string] {
  const hash = createHash('sha256').update(callId, 'utf16le').digest('hex')
  return [hash.slice(0, 2), hash.slice(2)]
}

function pendingTool(tools: PendingTools, [prefix, suffix]: readonly [string, string]): boolean | undefined {
  return tools[prefix]?.[suffix]
}

function updatePendingTool(tools: PendingTools, [prefix, suffix]: readonly [string, string], question: boolean | undefined): PendingTools {
  const bucket = tools[prefix]
  if (bucket?.[suffix] === question) return tools
  const nextBucket = { ...bucket }
  if (question === undefined) delete nextBucket[suffix]
  else nextBucket[suffix] = question
  const next = { ...tools }
  if (Object.keys(nextBucket).length === 0) delete next[prefix]
  else next[prefix] = nextBucket
  return next
}

function humanInput(data: unknown): boolean | undefined {
  const envelope = record(data)
  const message = record(envelope?.message) ?? envelope
  if (message?.role !== 'user' || !Array.isArray(message.content)) return undefined
  const source = record(message.source)
  if (message.source !== undefined && source === undefined) return undefined
  const kind = source?.kind
  return kind === 'user-question-reply' || !((typeof kind === 'string' && kind !== '' && kind !== 'user') || typeof source?.form === 'string')
}

/** Whether result content contains a completed question answer. */
function hasQuestionAnswer(content: unknown): boolean {
  if (!Array.isArray(content)) return false
  const pending: unknown[][] = [content]
  const seen = new WeakSet<object>()
  while (pending.length > 0) {
    const blocks = pending.pop()
    if (blocks === undefined || seen.has(blocks)) continue
    seen.add(blocks)
    for (const item of blocks) {
      const block = record(item)
      if (block?.type === 'tool-result' && block.isError !== true && Array.isArray(block.content)) pending.push(block.content)
      if (block?.type !== 'text' || typeof block.text !== 'string' || block.text === '') continue
      let answer: Record<string, unknown> | undefined
      try { answer = record(JSON.parse(block.text)) } catch (_error) { continue }
      if (answer?.pending === true || !Array.isArray(answer?.answers) || answer.answers.length === 0) continue
      if (answer.answers.every((value: unknown) => {
        const item = record(value)
        return typeof item?.id === 'string' && Array.isArray(item.selected)
          && item.selected.every((label: unknown) => typeof label === 'string')
          && (item.custom === undefined || typeof item.custom === 'string')
      })) return true
    }
  }
  return false
}

/** Whether a PTC question returned a complete answer rather than a pending result. */
function answeredPtcQuestion(type: string, data: unknown): boolean {
  if (type !== 'tool/ptc-dispatch') return false
  const envelope = record(data)
  return envelope?.name === 'ask_user_question' && envelope.isError !== true && hasQuestionAnswer(envelope.content)
}

/**
 * Create a deterministic projection of settled own-session requests and reported tokens.
 * @param options - IANA calendar timezone and positive active-day retention limit.
 * @returns A synchronous wired projection; invalid options throw before registration.
 */
export function createCodexConnectUsageDefinition(options: CodexConnectUsageOptions) {
  if (!Number.isSafeInteger(options.retainedDays) || options.retainedDays < 1) throw new RangeError('retainedDays must be a positive safe integer')
  const { timeZone, retainedDays } = options
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const initialState = (inheritedEventCount: number): CodexConnectUsageState => ({
    semanticsVersion: 6, inheritedEventCount, retainedDays, fault: false, incompleteUsage: false, possibleDays: [],
    retentionUncertain: false, hasTurnStart: false, pendingTools: {}, totalTokens: 0, totalRequests: 0, view: { timeZone, days: {} },
  })
  const stateSchema = z.object({
    semanticsVersion: z.literal(6),
    inheritedEventCount: countSchema,
    retainedDays: countSchema,
    fault: z.boolean(),
    incompleteUsage: z.boolean(),
    possibleDays: z.array(dateSchema),
    retentionUncertain: z.boolean(),
    hasTurnStart: z.boolean(),
    stepStartTime: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).optional(),
    pendingTools: z.record(z.string().regex(/^[0-9a-f]{2}$/), z.record(z.string().regex(/^[0-9a-f]{62}$/), z.boolean())),
    totalTokens: countSchema,
    totalRequests: countSchema,
    view: viewSchema,
  }).strict().transform(state => {
    if (state.retainedDays === retainedDays && state.view.timeZone === timeZone) {
      const { stepStartTime, ...rest } = state
      return stepStartTime === undefined ? rest : { ...rest, stepStartTime }
    }
    // A version collision cannot prove the skipped prefix; expose an incomplete suffix instead.
    return { ...initialState(state.inheritedEventCount), hasTurnStart: state.hasTurnStart, fault: true, incompleteUsage: true }
  }).refine(state => state.possibleDays.length <= retainedDays && Object.keys(state.view.days).length <= retainedDays
    && state.retentionUncertain === hasUncertainRetention(state.view.days, state.possibleDays))
  const definition = {
    key: 'codexConnectUsage',
    stateVersion: configurationVersion(timeZone, retainedDays),
    stateSchema,
    init: (_header, inheritedEventCount): CodexConnectUsageState => initialState(inheritedEventCount),
    apply: (state, event) => {
      try {
        if (!Number.isSafeInteger(event.seq) || event.seq < 0) throw new Error('invalid event sequence')
        if (event.type === 'turn/start' && !state.hasTurnStart) state = { ...state, hasTurnStart: true }
        if (event.seq < state.inheritedEventCount) return state
        if (!Number.isSafeInteger(event.time)) throw new Error('invalid event timestamp')
        const utcYear = new Date(event.time).getUTCFullYear()
        if (!Number.isFinite(utcYear) || utcYear < 1969 || utcYear > 10000) throw new Error('invalid calendar day')
        const parts = formatter.formatToParts(event.time)
        const year = parts.find(part => part.type === 'year')?.value
        const month = parts.find(part => part.type === 'month')?.value
        const day = parts.find(part => part.type === 'day')?.value
        if (year === undefined || month === undefined || day === undefined || Number(year) < 1970 || Number(year) > 9999) throw new Error('invalid calendar day')
        const key = year.padStart(4, '0') + '-' + month + '-' + day
        const possibleDays = state.possibleDays.includes(key) ? state.possibleDays
          : [...state.possibleDays, key].sort().slice(-retainedDays)
        let days = state.view.days
        let stepStartTime = state.stepStartTime
        let pendingTools = state.pendingTools
        let { totalTokens, totalRequests, incompleteUsage } = state
        if (event.type === 'tool/call') {
          const data = record(event.data)
          if (typeof data?.callId === 'string' && typeof data.name === 'string') {
            pendingTools = updatePendingTool(pendingTools, toolDigest(data.callId), data.name === 'ask_user_question')
          }
        } else if (event.type === 'tool/result') {
          const data = record(event.data)
          const message = record(data?.message)
          const source = record(message?.source)
          const sourceKey = typeof source?.callId === 'string' ? toolDigest(source.callId) : undefined
          const rawKey = typeof data?.callId !== 'string' ? undefined
            : data.callId === source?.callId && sourceKey !== undefined ? sourceKey : toolDigest(data.callId)
          const answered = rawKey !== undefined && pendingTool(pendingTools, rawKey) === true
            && data?.error !== true && message?.isError !== true && hasQuestionAnswer(message?.content)
          const matched = sourceKey !== undefined && pendingTool(pendingTools, sourceKey) !== undefined
          if ((matched || answered) && !Object.hasOwn(days, key)) days = { ...days, [key]: { tokens: 0, requests: 0 } }
          if (sourceKey !== undefined) pendingTools = updatePendingTool(pendingTools, sourceKey, undefined)
        }
        if (event.type === 'step/start') stepStartTime = event.time
        else if (event.type === 'step/end' && stepStartTime !== undefined) {
          if (event.time > stepStartTime && !Object.hasOwn(days, key)) days = { ...days, [key]: { tokens: 0, requests: 0 } }
          stepStartTime = undefined
        }
        if (event.type === 'assistant/message') {
          const data = record(event.data)
          const message = record(data?.message)
          const source = record(message?.source)
          if (typeof message?.id !== 'string' || message.id === '' || message.role !== 'assistant' || !Array.isArray(message.content)
            || source?.kind !== 'model' || typeof source.provider !== 'string' || source.provider === ''
            || typeof source.model !== 'string' || source.model === '' || !Array.isArray(data?.stream)
            || !Number.isSafeInteger(data.turn) || Number(data.turn) < 0 || Object.is(data.turn, -0)
            || !Number.isSafeInteger(data.step) || Number(data.step) < 0 || Object.is(data.step, -0)) {
            throw new Error('invalid assistant message')
          }
          const usage = record(data?.usage)
          const previous = days[key]
          let tokens = previous?.tokens ?? 0
          if (usage === undefined) incompleteUsage = true
          else {
            for (const field of ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens'] as const) {
              const value = usage[field]
              if (value === undefined && (field === 'cacheReadTokens' || field === 'cacheWriteTokens')) continue
              const count = reportedCount(value)
              if (count === undefined || !Number.isSafeInteger(tokens + count) || !Number.isSafeInteger(totalTokens + count)) {
                incompleteUsage = true
                continue
              }
              tokens += count
              totalTokens += count
            }
          }
          let requests = previous?.requests ?? 0
          if (Number.isSafeInteger(requests + 1) && Number.isSafeInteger(totalRequests + 1)) {
            requests++
            totalRequests++
          } else incompleteUsage = true
          days = { ...days, [key]: { tokens, requests } }
        } else if (event.type === 'user/message') {
          const human = humanInput(event.data)
          if (human === undefined) {
            const retentionUncertain = possibleDays === state.possibleDays ? state.retentionUncertain
              : hasUncertainRetention(days, possibleDays)
            return { ...state, possibleDays, retentionUncertain, fault: true }
          }
          if (human && !Object.hasOwn(days, key)) days = { ...days, [key]: { tokens: 0, requests: 0 } }
        } else if (answeredPtcQuestion(event.type, event.data) && !Object.hasOwn(days, key)) {
          days = { ...days, [key]: { tokens: 0, requests: 0 } }
        }
        if (days !== state.view.days) {
          const keys = Object.keys(days).sort()
          for (const old of keys.slice(0, Math.max(0, keys.length - retainedDays))) delete days[old]
          if (!Object.hasOwn(days, key)) days = state.view.days
        }
        const retentionUncertain = days === state.view.days && possibleDays === state.possibleDays ? state.retentionUncertain
          : hasUncertainRetention(days, possibleDays)
        if (days === state.view.days && possibleDays === state.possibleDays && retentionUncertain === state.retentionUncertain
          && stepStartTime === state.stepStartTime && pendingTools === state.pendingTools
          && totalTokens === state.totalTokens && totalRequests === state.totalRequests && incompleteUsage === state.incompleteUsage) return state
        const next = { ...state, possibleDays, retentionUncertain, pendingTools, totalTokens, totalRequests, incompleteUsage,
          view: days === state.view.days ? state.view : { timeZone, days } }
        if (stepStartTime === undefined) delete next.stepStartTime
        else next.stepStartTime = stepStartTime
        return next
      } catch (_error) {
        // Retain known counts while making an unrepresentable record visible to the owner.
        return state.fault ? state : { ...state, fault: true }
      }
    },
    wire: { viewSchema, view: state => state.view },
  } satisfies ProjectionDefinition<'codexConnectUsage', CodexConnectUsageState>
  return definition
}
