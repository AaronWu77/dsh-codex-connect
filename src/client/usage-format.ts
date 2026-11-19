/** `fmt`: the k/M/B suffix style shared by bars/details/stats; `fmtTime`: local HH:MM:SS. */

export function fmt(n: number | null | undefined): string {
  if (n === undefined || n === null || isNaN(n)) return '—'
  const sign = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (a >= 1e9) return sign + (a / 1e9).toFixed(1) + 'B'
  if (a >= 1e6) return sign + (a / 1e6).toFixed(1) + 'M'
  if (a >= 1000) return sign + (a / 1000).toFixed(1) + 'k'
  return sign + String(Math.round(a))
}


/**
 * Whole-session durations for the timing card, locale-free compact units: raw
 * ms under a second, one-decimal seconds under a minute, then m/s and h/m.
 * Non-finite or non-positive input shows the dash (callers render their empty
 * state anyway).
 */
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (ms < 3_600_000) return `${m}m${s}s`
  return `${Math.floor(m / 60)}h${m % 60}m`
}
