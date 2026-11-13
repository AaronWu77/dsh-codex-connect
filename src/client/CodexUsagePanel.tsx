/** Sidebar quota widget and its account usage dialog. */
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { CodexSettingsIcon } from './CodexSettingsIcon.tsx'
import { RecentRequests } from './RecentRequests.tsx'
import type { RecentRequestsStore } from './recent-requests.ts'
import { balanceEntryOf, platformBalanceSnapshot, subscribePlatformBalance } from './balance.ts'
import { fmt } from './usage-format.ts'
import { symbolOf, windowLabel } from './UsageQuotaGrid.tsx'
import type { DayTotals } from './usage-ledger.ts'
import type { OpenAICodexAccountStore } from './account-store.ts'
import type { AccountSnapshot } from './account-store.ts'
import type { CodexQuota, CodexQuotaService, CodexQuotaWindow } from './quota-service.ts'
import { accountStatusLabel, dotStyle } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import { CompactAccountUsage } from './CompactAccountUsage.tsx'
import { makeQuotaGrid } from './UsageQuotaGrid.tsx'
import { fmtDuration } from './usage-format.ts'
import { subscribeUnavailableUsage, unavailableUsageSnapshot, usageToday } from './usage-ledger.ts'
import type { LocalUsageSnapshot, LocalUsageSource } from './usage-ledger.ts'

/** Whether a panel is currently open; the capsule and the panel share this store. */
export class CodexUsagePanelStore {
  private open = false
  private readonly listeners = new Set<() => void>()

  /** @param listener - notified whenever the open flag changes. @returns its disposer. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @returns whether the usage panel is open. */
  readonly snapshot = (): boolean => this.open

  /** Open the panel. */
  show(): void {
    this.setOpen(true)
  }

  /** Close the panel. */
  close(): void {
    this.setOpen(false)
  }

  private setOpen(next: boolean): void {
    if (this.open === next) return
    this.open = next
    for (const listener of this.listeners) listener()
  }
}


/** Services shared by the sidebar entry and the overlay. */
export interface CodexUsageInjected {
  t: OpenAICodexSettingsInjected['t']
  account: OpenAICodexAccountStore
  quota: CodexQuotaService
  panel: CodexUsagePanelStore
  localUsage?: LocalUsageSource
  recent: RecentRequestsStore
  wide?: boolean
}

/** Actionable local usage failures; ordinary loading stays silent. */
export function LocalUsageNotice({ t, usage, source, compact = false }: {
  t: OpenAICodexSettingsInjected['t']; usage: LocalUsageSnapshot; source: LocalUsageSource | undefined; compact?: boolean
}) {
  if (source === undefined) return null
  const message = usage.state === 'unavailable' ? t('ov.local.unavailable')
    : usage.state === 'failed' || usage.failure === 'request' ? t('ov.local.failed') : undefined
  if (message === undefined) return null
  return <div className="cc-codex-empty">
    <div role="status">{message}</div>
    {compact ? null : <button type="button" className="cc-usage-quota-detail-action" onClick={() => { source.retry() }}>{t('ov.local.retry')}</button>}
  </div>
}

/** Present only the established daily figure for the current calendar. */
function currentUsageDays(data: LocalUsageSnapshot['data'], day: string): NonNullable<LocalUsageSnapshot['data']>['days'] {
  const value = data?.days[day]
  return value === undefined ? {} : { [day]: value }
}

/** Original compact quota card; the collapsed rail retains the same gauge entry. */
export function CodexUsageCapsule({ t, quota, panel, wide, localUsage }: CodexUsageInjected) {
  const open = useSyncExternalStore(panel.subscribe, panel.snapshot)
  const usage = useSyncExternalStore(localUsage?.subscribe ?? subscribeUnavailableUsage, localUsage?.snapshot ?? unavailableUsageSnapshot)
  const locale = t('dateLocale')
  const Grid = useMemo(() => makeQuotaGrid(quota, { t, fmtDuration, locale }), [quota, t, locale])
  const today = usageToday(usage.data?.timeZone)
  const show = (): void => { panel.show() }
  if (wide !== true) return (
    <button type="button" className="cc-usage-entry cc-usage-entry-rail" title={t('ov.entry')}
      aria-label={t('ov.entry')} aria-haspopup="dialog" aria-expanded={open} onClick={show}>
      <span className="cc-usage-entry-icon" aria-hidden="true"><CodexSettingsIcon size={18} /></span>
    </button>
  )
  return (
    <div className="cc-usage-widget" role="button" tabIndex={0} title={t('ov.entry')}
      aria-label={t('ov.entry')} aria-haspopup="dialog" aria-expanded={open} onClick={show}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show() }
      }}>
      <div className="cc-usage-widget-head">
        <span className="cc-usage-entry-icon" aria-hidden="true"><CodexSettingsIcon size={14} /></span>
        <span className="cc-usage-widget-title">{t('ov.entry')}</span>
        <span className="cc-usage-widget-more" aria-hidden="true">{String.fromCharCode(0x203a)}</span>
      </div>
      <LocalUsageNotice t={t} usage={usage} source={localUsage} compact />
      <Grid days={currentUsageDays(usage.data, today)} today={today} compact onSelectDay={show} />
    </div>
  )
}

/** The tightest reported window across every account, for the headline KPI strip. */
function tightestOf(quota: CodexQuota | null, accounts: AccountSnapshot['accounts'], seconds: number): { name: string; win: CodexQuotaWindow } | undefined {
  let best: { name: string; win: CodexQuotaWindow } | undefined
  for (const account of quota?.accounts ?? []) {
    const name = accounts.find(candidate => candidate.accountKey === account.accountKey)?.displayName ?? account.label
    for (const win of account.windows) {
      if (win.windowSeconds !== seconds) continue
      if (best === undefined || win.remainingPercent < best.win.remainingPercent) best = { name, win }
    }
  }
  if (best !== undefined) return best
  for (const win of quota?.windows ?? []) {
    if (win.windowSeconds !== seconds) continue
    if (best === undefined || win.remainingPercent < best.win.remainingPercent) best = { name: '', win }
  }
  return best
}

/** @param win - one rolling window. @returns its relative reset label, when known. */
function resetLabel(win: CodexQuotaWindow): string | undefined {
  if (win.resetAt === undefined) return undefined
  const left = win.resetAt * 1000 - Date.now()
  return left > 0 ? fmtDuration(left) : undefined
}

/** Four compact headline figures with active balance/today drill-down detail. */
function UsageSummary({ t, days, today, currency, quota, accounts }: {
  t: OpenAICodexSettingsInjected['t']
  days: Record<string, DayTotals>
  today: string
  currency: 'cny' | 'usd'
  quota: CodexQuota | null
  accounts: AccountSnapshot['accounts']
}) {
  const balance = useSyncExternalStore(subscribePlatformBalance, platformBalanceSnapshot)
  const entry = balanceEntryOf(balance, currency)
  const totals = Object.hasOwn(days, today) ? days[today] : undefined
  const five = tightestOf(quota, accounts, 18_000)
  const week = tightestOf(quota, accounts, 604_800)
  const [detail, setDetail] = useState<'balance' | 'today' | null>(null)
  if (entry === null && totals === undefined && five === undefined && week === undefined) return null
  const title = detail === 'balance' ? t('ov.quota.balance') : detail === 'today' ? t('ov.quota.today') : ''
  const rows: Array<[string, string]> = detail === 'balance' && entry !== null
    ? [
      [t('ov.quota.detail.total'), symbolOf(entry.currency) + entry.total.toFixed(2)],
      [t('ov.quota.detail.granted'), symbolOf(entry.currency) + entry.granted.toFixed(2)],
      [t('ov.quota.detail.topped'), symbolOf(entry.currency) + entry.toppedUp.toFixed(2)],
      [t('ov.quota.detail.currency'), entry.currency],
    ]
    : detail === 'today' && totals !== undefined
      ? [
        [t('ov.kpi.tokens'), fmt(totals.tokens)],
        [t('ov.quota.detail.sessions'), String(totals.sessions)],
        [t('ov.quota.detail.requests'), fmt(totals.requests)],
      ]
      : []
  const toggle = (next: 'balance' | 'today'): void => { setDetail(current => current === next ? null : next) }
  const windowTile = (label: string, value: { name: string; win: CodexQuotaWindow } | undefined): ReactElement => {
    const percent = value === undefined ? undefined : Math.max(0, Math.min(100, Math.round(value.win.remainingPercent)))
    const reset = value === undefined ? undefined : resetLabel(value.win)
    return <div className="cc-kpi-tile" data-low={percent !== undefined && percent <= 20 ? 'true' : undefined}>
      <span className="cc-kpi-label">{label}</span>
      <span className="cc-kpi-value">{percent === undefined ? '—' : String(percent) + '%'}</span>
      <span className="cc-kpi-sub">{value === undefined
        ? t('usageNoData')
        : [value.name === '' ? t('ov.quota.accountCurrent') : value.name, reset].filter(part => part !== undefined).join(' · ')}</span>
    </div>
  }
  return <section className="cc-kpi" aria-label={t('ov.quota.platform')}>
    <div className="cc-kpi-grid">
      {entry === null ? null : <button type="button" className="cc-kpi-tile" aria-expanded={detail === 'balance'}
        onClick={() => { toggle('balance') }}>
        <span className="cc-kpi-label">{t('ov.quota.balance')}</span>
        <span className="cc-kpi-value">{symbolOf(entry.currency) + entry.total.toFixed(2)}</span>
        <span className="cc-kpi-sub">{t('ov.quota.balanceSub', { granted: entry.granted.toFixed(2), topped: entry.toppedUp.toFixed(2) })}</span>
      </button>}
      {totals === undefined ? null : <button type="button" className="cc-kpi-tile" aria-expanded={detail === 'today'}
        onClick={() => { toggle('today') }}>
        <span className="cc-kpi-label">{t('ov.quota.today')}</span>
        <span className="cc-kpi-value">{fmt(totals.tokens)}</span>
        <span className="cc-kpi-sub">{t('ov.kpi.tokens')}</span>
      </button>}
      {windowTile(windowLabel(18_000), five)}
      {windowTile(windowLabel(604_800), week)}
    </div>
    {rows.length === 0 ? null : <div className="cc-usage-quota-detail" role="group" aria-label={title}>
      <div className="cc-usage-quota-detail-head">
        <span className="cc-usage-quota-detail-title">{title}</span>
        <button type="button" className="cc-usage-quota-detail-close" aria-label={t('cmd.close')}
          onClick={() => { setDetail(null) }}>{String.fromCharCode(0x00d7)}</button>
      </div>
      {rows.map(([label, value]) => <div className="cc-usage-quota-detail-row" key={label}>
        <span className="cc-usage-quota-detail-label">{label}</span>
        <span className="cc-usage-quota-detail-value">{value}</span>
      </div>)}
    </div>}
  </section>
}

/** Shared read-only usage content for the overview tab and the existing dialog. */
export function CodexUsageOverview({ t, account, quota, localUsage, recent, includeAccountUsage = true, showStatus = true }: Omit<CodexUsageInjected, 'panel' | 'wide'> & { includeAccountUsage?: boolean; showStatus?: boolean }) {
  const snapshot = useSyncExternalStore(account.subscribe, account.getSnapshot)
  const quotaSnapshot = useSyncExternalStore(quota.subscribe, quota.snapshot)
  const usage = useSyncExternalStore(localUsage?.subscribe ?? subscribeUnavailableUsage, localUsage?.snapshot ?? unavailableUsageSnapshot)
  const today = usageToday(usage.data?.timeZone)
  return (
    <div className="cc-usage-panel">
        {showStatus ? <div className="cc-usage-status" role="status">
          <span aria-hidden="true" style={dotStyle(snapshot.status.status)} />
          <span>{accountStatusLabel(snapshot.status.status, t)}</span>
        </div> : null}
        <LocalUsageNotice t={t} usage={usage} source={localUsage} />
        <UsageSummary t={t} days={currentUsageDays(usage.data, today)} today={today}
          currency={t('dateLocale') === 'zh-CN' ? 'cny' : 'usd'} quota={quotaSnapshot} accounts={snapshot.accounts} />
        {includeAccountUsage && quotaSnapshot !== null ? <CompactAccountUsage accounts={snapshot.accounts} quota={quotaSnapshot} t={t} /> : null}
        <RecentRequests t={t} store={recent} />
      </div>
  )
}

/** Account usage dialog; its entry and read-only interactions remain unchanged. */
export function CodexUsagePanel(props: CodexUsageInjected) {
  const { t, panel, recent } = props
  const open = useSyncExternalStore(panel.subscribe, panel.snapshot)
  useEffect(() => {
    if (!open) return
    void recent.refresh()
    const timer = setInterval(() => { void recent.refresh() }, 5_000)
    return () => { clearInterval(timer) }
  }, [open, recent])
  return (
    <Modal open={open} onClose={() => { panel.close() }} title={t('usagePanelTitle')} closeLabel={t('close')}
      className="cc-usage-dialog" contentClassName="cc-usage-dialog-content">
      <CodexUsageOverview {...props} />
    </Modal>
  )
}
