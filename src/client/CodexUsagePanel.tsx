/** Sidebar quota widget and its account usage dialog. */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { CodexSettingsIcon } from './CodexSettingsIcon.tsx'
import { RecentRequests } from './RecentRequests.tsx'
import type { RecentRequestsStore } from './recent-requests.ts'
import type { OpenAICodexAccountStore } from './account-store.ts'
import type { CodexQuotaService } from './quota-service.ts'
import { AccountUsage, accountStatusLabel, dotStyle } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
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

/** Shared read-only usage content for the overview tab and the existing dialog. */
export function CodexUsageOverview({ t, account, quota, localUsage, recent, includeAccountUsage = true, showStatus = true }: Omit<CodexUsageInjected, 'panel' | 'wide'> & { includeAccountUsage?: boolean; showStatus?: boolean }) {
  const snapshot = useSyncExternalStore(account.subscribe, account.getSnapshot)
  const quotaSnapshot = useSyncExternalStore(quota.subscribe, quota.snapshot)
  const usage = useSyncExternalStore(localUsage?.subscribe ?? subscribeUnavailableUsage, localUsage?.snapshot ?? unavailableUsageSnapshot)
  const locale = t('dateLocale')
  const Grid = useMemo(() => makeQuotaGrid(quota, { t, fmtDuration, locale }), [quota, t, locale])
  const today = usageToday(usage.data?.timeZone)
  return (
    <div className="cc-usage-panel">
        {showStatus ? <div className="cc-usage-status" role="status">
          <span aria-hidden="true" style={dotStyle(snapshot.status.status)} />
          <span>{accountStatusLabel(snapshot.status.status, t)}</span>
        </div> : null}
        <LocalUsageNotice t={t} usage={usage} source={localUsage} />
        <Grid days={currentUsageDays(usage.data, today)} today={today} currency={t('dateLocale') === 'zh-CN' ? 'cny' : 'usd'} />
        {includeAccountUsage && quotaSnapshot !== null ? <AccountUsage accounts={snapshot.accounts} quota={quotaSnapshot} t={t} /> : null}
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
