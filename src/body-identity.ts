/**
 * Explain why a WebSocket resend was not a continuation.
 *
 * PI compares the whole prepared body except `input` and `previous_response_id`,
 * then the exact input prefix. Recording the last two prepared bodies per session
 * lets the plugin name the first divergence without guessing or retaining text.
 */

/** Short, content-free reason codes reported in the recent-request list. */
export type OpenAICodexBodyMismatch =
  | `field:${string}`
  | `item:${number}`
  | 'item:truncated'
  | 'response-items'

/** @param value - any prepared field. @returns a comparable serialization. */
function stable(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'undefined'
  } catch {
    return 'unserializable'
  }
}

/**
 * Keep the previous and current prepared body per session and diff them on demand.
 * Bodies are held by reference for one turn; nothing is written to disk.
 */
export class OpenAICodexBodyIdentity {
  private readonly previous = new Map<string, Record<string, unknown>>()
  private readonly current = new Map<string, Record<string, unknown>>()

  /**
   * Record one prepared body as the newest observation for its session.
   * @param sessionId - business session the request belongs to.
   * @param body - prepared request body, after every payload policy has run.
   */
  record(sessionId: string, body: unknown): void {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return
    const next = body as Record<string, unknown>
    const prior = this.current.get(sessionId)
    if (prior === undefined) {
      if (!this.previous.has(sessionId)) this.previous.set(sessionId, next)
    } else {
      this.previous.set(sessionId, prior)
    }
    this.current.set(sessionId, next)
  }

  /**
   * Serialize the request PI would send for a delta continuation.
   * @param sessionId - business session to measure.
   * @param items - number of trailing input items PI sent.
   * @returns the approximate wire size in bytes, or undefined without a body.
   */
  deltaBytes(sessionId: string, items: number): number | undefined {
    const current = this.current.get(sessionId)
    if (current === undefined) return undefined
    const input = Array.isArray(current['input']) ? current['input'] : []
    const count = Math.max(0, Math.min(items, input.length))
    const body = { ...current, previous_response_id: 'resp', input: input.slice(input.length - count) }
    try {
      return Buffer.byteLength(JSON.stringify(body), 'utf8')
    } catch {
      return undefined
    }
  }

  /**
   * Name the first divergence between the two most recent bodies.
   * @param sessionId - business session to explain.
   * @returns a reason code, or undefined when both observations are the same request.
   */
  explain(sessionId: string): OpenAICodexBodyMismatch | undefined {
    const previous = this.previous.get(sessionId)
    const current = this.current.get(sessionId)
    if (previous === undefined || current === undefined || previous === current) return undefined
    const ignored = new Set(['input', 'previous_response_id'])
    for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) {
      if (ignored.has(key)) continue
      if (stable(previous[key]) !== stable(current[key])) return `field:${key}`
    }
    const previousItems = Array.isArray(previous['input']) ? previous['input'] : []
    const currentItems = Array.isArray(current['input']) ? current['input'] : []
    const shared = Math.min(previousItems.length, currentItems.length)
    for (let index = 0; index < shared; index += 1) {
      if (stable(previousItems[index]) !== stable(currentItems[index])) return `item:${index}`
    }
    if (currentItems.length < previousItems.length) return 'item:truncated'
    // The visible prefix matched, so the divergence sits in PI's own response items.
    return 'response-items'
  }
}

