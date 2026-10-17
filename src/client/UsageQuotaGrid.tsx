/** DeepSeek balance, daily tokens and every Codex account quota, with cell drill-downs. */
import { useState, useSyncExternalStore, type ReactElement } from 'react'
import { balanceEntryOf, platformBalanceSnapshot, subscribePlatformBalance } from './balance.ts'
import { fmt } from './usage-format.ts'
import type { DayTotals } from './usage-ledger.ts'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import type { CodexQuota, CodexQuotaAccount, CodexQuotaWindow, CodexQuotaService } from './quota-service.ts'

type CostCurrency = 'cny' | 'usd'
interface ViewKit { t: OpenAICodexSettingsInjected['t']; fmtDuration: (ms: number) => string; locale: string }

/** Props both occupants render from. */
export interface QuotaGridProps {
  /** Merged daily ledger (day key -> figures) backing the today cell. */
  days: Record<string, DayTotals>
  /** Today's key from the caller's calendar. */
  today: string
  /** Compact type scale for the sidebar widget. */
  compact?: boolean
  /** Preferred platform currency ('cny' default; the panel follows its locale). */
  currency?: CostCurrency
  /**
   * Pin one day in the caller's session list (the dashboard owns one; the
   * sidebar widget leaves it out and opens the dashboard instead).
   */
  onSelectDay?: (day: string | null) => void
}

/** Preserve the two shortest distinct rolling windows in each compact account row. */
const WINDOWS_PER_ACCOUNT = 2

/** Currency symbol for the balance cells the platform serves. */
function symbolOf(currency: string): string {
  if (currency === 'CNY') return String.fromCharCode(0x00a5)
  if (currency === 'USD') return String.fromCharCode(0x0024)
  return currency + ' '
}

/** One rolling window length as a compact label (5h, 7d). */
function windowLabel(seconds: number): string {
  if (seconds % 86400 === 0) return String(seconds / 86400) + 'd'
  if (seconds % 3600 === 0) return String(seconds / 3600) + 'h'
  return String(Math.round(seconds / 60)) + 'm'
}

/**
 * The windows one account shows, shortest first. The server reports one window
 * per bucket, so the same LENGTH can arrive from several buckets (the main Codex
 * bucket plus a model-specific one): keep the most constrained value per length,
 * so a row never hides the scarcer of two five-hour windows.
 * @param account - one signed-in account as the service publishes it.
 * @returns up to two windows, shortest first.
 */
function windowsOf(account: CodexQuotaAccount): CodexQuotaWindow[] {
  const byLength = new Map<number, CodexQuotaWindow>()
  for (const win of account.windows) {
    const current = byLength.get(win.windowSeconds)
    if (current === undefined || win.remainingPercent < current.remainingPercent) byLength.set(win.windowSeconds, win)
  }
  return [...byLength.values()]
    .sort((left, right) => left.windowSeconds - right.windowSeconds)
    .slice(0, WINDOWS_PER_ACCOUNT)
}

/** The account rows to render: the service's list, or the active account alone. */
function accountsOf(quota: CodexQuota | null): CodexQuotaAccount[] {
  if (quota === null) return []
  const listed = quota.accounts
  if (listed !== undefined && listed.length > 0) return [...listed]
  if (quota.windows.length === 0) return []
  return [{ accountKey: 'active', label: '', active: true, windows: quota.windows, ...(quota.credits === undefined ? {} : { credits: quota.credits }) }]
}

/** One drill-down target, identified by the cell that opened it. */
interface Detail {
  kind: 'balance' | 'today' | 'window' | 'account'
  /** Window cells key their detail by account + window length. */
  key?: string
}

/**
 * Build the grid occupant.
 * @param service - the shared account quota service.
 * @param kit - the slot kit (locale + duration formatting).
 * @returns the component both the sidebar widget and the panel render.
 */
export function makeQuotaGrid(service: CodexQuotaService, kit: ViewKit): (props: QuotaGridProps) => ReactElement | null {
  const { t, fmtDuration } = kit
  /** Remaining time until one window resets, or null when unknown. */
  function resetInOf(win: CodexQuotaWindow): string | null {
    if (win.resetAt === undefined) return null
    const left = win.resetAt * 1000 - Date.now()
    return left > 0 ? fmtDuration(left) : null
  }
  /** The exact reset instant in the reader's own locale and time zone. */
  function resetAtOf(win: CodexQuotaWindow): string | null {
    if (win.resetAt === undefined) return null
    const at = new Date(win.resetAt * 1000)
    return Number.isNaN(at.getTime()) ? null : at.toLocaleString(kit.locale)
  }
  return function QuotaGrid(props: QuotaGridProps): ReactElement | null {
    // Live through the shared balance store, exactly as the Codex cells follow
    // the codexQuota service: the sticky figure is published, and the store's
    // interval refreshes it without this widget remounting.
    const balance = useSyncExternalStore(subscribePlatformBalance, platformBalanceSnapshot)
    const [detail, setDetail] = useState<Detail | null>(null)
    const quota = useSyncExternalStore(service.subscribe, service.snapshot)
    const entry = balanceEntryOf(balance, props.currency ?? 'cny')
    const today = Object.hasOwn(props.days, props.today) ? props.days[props.today] : undefined
    const accounts = accountsOf(quota)
    const named = accounts.length > 1
    const toggle = (next: Detail): void => {
      setDetail(current => (current !== null && current.kind === next.kind && current.key === next.key ? null : next))
    }
    // The label line is a flex row: the NAME truncates first (it is the
    // longest), the rank chip never does.
    const cell = (
      key: string,
      name: string,
      value: string,
      sub: string | null,
      target: Detail,
      chip?: ReactElement | null,
    ): ReactElement => {
      const open = detail !== null && detail.kind === target.kind && detail.key === target.key
      return (
        <button
          type="button"
          key={key}
          className={'cc-usage-quota-cell' + (open ? ' cc-usage-quota-on' : '')}
          aria-expanded={open}
          onClick={(event) => { event.stopPropagation(); toggle(target) }}
          onKeyDown={(event) => { event.stopPropagation() }}
        >
          <span className="cc-usage-quota-label">
            <span className="cc-usage-quota-name">{name}</span>
            {chip ?? null}
          </span>
          <span className="cc-usage-quota-value">{value}</span>
          {sub !== null && <span className="cc-usage-quota-sub">{sub}</span>}
        </button>
      )
    }
    const summary: ReactElement[] = []
    if (entry !== null) {
      summary.push(cell(
        'balance',
        t('ov.quota.balance'),
        symbolOf(entry.currency) + entry.total.toFixed(2),
        t('ov.quota.balanceSub', { granted: entry.granted.toFixed(2), topped: entry.toppedUp.toFixed(2) }),
        { kind: 'balance' },
      ))
    }
    if (today !== undefined && today.tokens > 0) {
      summary.push(cell(
        'today',
        t('ov.quota.today'),
        fmt(today.tokens),
        t('ov.kpi.tokens'),
        { kind: 'today' },
      ))
    }
    // The window cells extend the summary; the compact layout below renders the
    // summary plus one account row instead of these cells.
    const cells: ReactElement[] = [...summary]
    // Multi-account surfaces mark each window with the account's rank instead
    // of its key: the full `acct <hash>` label cannot fit a three-column cell,
    // and the legend under the grid carries the mapping.
    const rankOf = (accountKey: string): ReactElement | null => {
      if (!named) return null
      const rank = accounts.findIndex(candidate => candidate.accountKey === accountKey) + 1
      return <span className="cc-usage-quota-rank">{'#' + String(rank)}</span>
    }
    for (const account of accounts) {
      const windows = windowsOf(account)
      for (const win of windows) {
        const reset = resetInOf(win)
        const key = `${account.accountKey}:${win.windowSeconds}`
        cells.push(cell(
          key,
          t('ov.quota.codexWindow', { w: windowLabel(win.windowSeconds) }),
          t('ov.quota.remaining', { p: Math.round(win.remainingPercent) }),
          reset === null ? null : t('ov.quota.resetIn', { d: reset }),
          { kind: 'window', key },
          rankOf(account.accountKey),
        ))
      }
    }
    if (cells.length === 0) return null
    const rows: Array<[string, string]> = []
    let detailTitle = ''
    let action: ReactElement | null = null
    if (detail !== null && detail.kind === 'balance' && entry !== null) {
      detailTitle = t('ov.quota.balance')
      rows.push([t('ov.quota.detail.total'), symbolOf(entry.currency) + entry.total.toFixed(2)])
      rows.push([t('ov.quota.detail.granted'), symbolOf(entry.currency) + entry.granted.toFixed(2)])
      rows.push([t('ov.quota.detail.topped'), symbolOf(entry.currency) + entry.toppedUp.toFixed(2)])
      rows.push([t('ov.quota.detail.currency'), entry.currency])
    }
    if (detail !== null && detail.kind === 'today' && today !== undefined) {
      detailTitle = t('ov.quota.today')
      rows.push([t('ov.kpi.tokens'), fmt(today.tokens)])
      rows.push([t('ov.quota.detail.sessions'), String(today.sessions)])
      rows.push([t('ov.quota.detail.requests'), fmt(today.requests)])
      if (props.onSelectDay !== undefined) {
        action = (
          <button
            type="button"
            className="cc-usage-quota-detail-action"
            onClick={(event) => { event.stopPropagation(); props.onSelectDay?.(props.today) }}
          >
            {t('ov.quota.detail.filterDay')}
          </button>
        )
      }
    }
    if (detail !== null && detail.kind === 'window') {
      const [accountKey, seconds] = String(detail.key).split(':')
      const account = accounts.find(candidate => candidate.accountKey === accountKey)
      const win = account === undefined ? undefined : windowsOf(account).find(candidate => String(candidate.windowSeconds) === seconds)
      if (account !== undefined && win !== undefined) {
        detailTitle = t('ov.quota.codexWindow', { w: windowLabel(win.windowSeconds) })
        if (named) rows.push([t('ov.quota.detail.account'), account.label === '' ? t('ov.quota.accountCurrent') : account.label])
        rows.push([t('ov.quota.detail.length'), fmtDuration(win.windowSeconds * 1000)])
        rows.push([t('ov.quota.detail.remaining'), t('ov.quota.remaining', { p: Math.round(win.remainingPercent) })])
        const at = resetAtOf(win)
        if (at !== null) rows.push([t('ov.quota.detail.resetAt'), at])
        const refreshed = account.fetchedAt
        if (refreshed !== undefined) rows.push([t('ov.quota.detail.refreshed'), fmtDuration(Date.now() - refreshed) + ' ' + t('ov.quota.detail.ago')])
      }
    }
    if (detail !== null && detail.kind === 'account') {
      const account = accounts.find(candidate => candidate.accountKey === detail.key)
      if (account !== undefined) {
        detailTitle = account.label === '' ? t('ov.quota.accountCurrent') : account.label
        for (const win of windowsOf(account)) {
          const reset = resetInOf(win)
          rows.push([t('ov.quota.codexWindow', { w: windowLabel(win.windowSeconds) }), t('ov.quota.remaining', { p: Math.round(win.remainingPercent) }) + (reset === null ? '' : ' · ' + t('ov.quota.resetIn', { d: reset }))])
        }
        const refreshed = account.fetchedAt
        if (refreshed !== undefined) rows.push([t('ov.quota.detail.refreshed'), fmtDuration(Date.now() - refreshed) + ' ' + t('ov.quota.detail.ago')])
      }
    }
    const legend = !named ? null : (
      <div className="cc-usage-quota-legend" role="group" aria-label={t('ov.quota.legend')}>
        {accounts.map((account, index) => (
          <span className="cc-usage-quota-legend-item" key={account.accountKey}>
            <span className="cc-usage-quota-rank">{'#' + String(index + 1)}</span>
            <span className="cc-usage-quota-legend-label">{account.label === '' ? t('ov.quota.accountCurrent') : account.label}</span>
          </span>
        ))}
      </div>
    )
    const panel = rows.length === 0 ? null : (
      <div className="cc-usage-quota-detail" role="group" aria-label={detailTitle} onClick={(event) => { event.stopPropagation() }}>
        <div className="cc-usage-quota-detail-head">
          <span className="cc-usage-quota-detail-title">{detailTitle}</span>
          <button
            type="button"
            className="cc-usage-quota-detail-close"
            aria-label={t('cmd.close')}
            onClick={(event) => { event.stopPropagation(); setDetail(null) }}
          >{String.fromCharCode(0x00d7)}</button>
        </div>
        {rows.map(([label, value]) => (
          <div className="cc-usage-quota-detail-row" key={label}>
            <span className="cc-usage-quota-detail-label">{label}</span>
            <span className="cc-usage-quota-detail-value">{value}</span>
          </div>
        ))}
        {action}
      </div>
    )
    if (props.compact === true) {
      // The compact grid always has at least one cell: the fully empty case
      // returned above (cells.length === 0).
      return (
        <div className="cc-usage-quota cc-usage-quota-compact">
          {summary}
          {accounts.map((account) => {
            const accountOpen = detail !== null && detail.kind === 'account' && detail.key === account.accountKey
            const windows = windowsOf(account)
            const reset = windows.map(win => resetInOf(win)).filter((value): value is string => value !== null).join(' · ')
            return (
              <button
                type="button"
                key={account.accountKey}
                className={'cc-usage-quota-account' + (accountOpen ? ' cc-usage-quota-on' : '')}
                aria-expanded={accountOpen}
                title={reset}
                onClick={(event) => { event.stopPropagation(); setDetail(accountOpen ? null : { kind: 'account', key: account.accountKey }) }}
                onKeyDown={(event) => { event.stopPropagation() }}
              >
                <span className="cc-usage-quota-account-head">
                  {named ? rankOf(account.accountKey) : null}
                  <span className="cc-usage-quota-account-name">
                    {account.label === '' ? t('ov.quota.accountCurrent') : account.label}
                  </span>
                </span>
                <span className="cc-usage-quota-account-windows">
                  {windows.map(win => (
                    <span className="cc-usage-quota-window" key={account.accountKey + ':' + String(win.windowSeconds)}>
                      <span className="cc-usage-quota-window-label">{windowLabel(win.windowSeconds)}</span>
                      <span className="cc-usage-quota-window-value">{String(Math.round(win.remainingPercent)) + '%'}</span>
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
          {panel}
        </div>
      )
    }
    return (
      <div className={'cc-usage-quota' + (cells.length >= 6 ? ' cc-usage-quota-multi' : '')}>
        {cells}
        {legend}
        {panel}
      </div>
    )
  }
}
