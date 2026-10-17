/** Sidebar quota widget and its account usage dialog. */
import { useMemo, useSyncExternalStore } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { UsageIcon } from './UsageIcon.tsx'
import type { OpenAICodexAccountStore } from './account-store.ts'
import type { CodexQuotaService } from './quota-service.ts'
import { AccountUsage, accountStatusLabel, dotStyle } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import { makeQuotaGrid } from './UsageQuotaGrid.tsx'
import { fmtDuration } from './usage-format.ts'
import { usageLedgerOf, usageToday, type UsageSessionProps } from './usage-ledger.ts'

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
export interface CodexUsageInjected extends UsageSessionProps {
  t: OpenAICodexSettingsInjected['t']
  account: OpenAICodexAccountStore
  quota: CodexQuotaService
  panel: CodexUsagePanelStore
  wide?: boolean
}

/** Original compact quota card; the collapsed rail retains the same gauge entry. */
export function CodexUsageCapsule({ t, quota, panel, wide, useSessions }: CodexUsageInjected) {
  const open = useSyncExternalStore(panel.subscribe, panel.snapshot)
  const snapshot = useSessions?.(value => value)
  const usage = useMemo(() => usageLedgerOf(snapshot), [snapshot])
  const locale = t('dateLocale')
  const Grid = useMemo(() => makeQuotaGrid(quota, { t, fmtDuration, locale }), [quota, t, locale])
  const show = (): void => { panel.show() }
  if (wide !== true) return (
    <button type="button" className="cc-usage-entry cc-usage-entry-rail" title={t('ov.entry')}
      aria-label={t('ov.entry')} aria-haspopup="dialog" aria-expanded={open} onClick={show}>
      <UsageIcon size={18} className="cc-usage-entry-icon" />
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
        <UsageIcon size={14} className="cc-usage-entry-icon" />
        <span className="cc-usage-widget-title">{t('ov.entry')}</span>
        <span className="cc-usage-widget-more" aria-hidden="true">{String.fromCharCode(0x203a)}</span>
      </div>
      <Grid days={usage.days} today={usageToday(usage.timeZone)} compact onSelectDay={show} />
    </div>
  )
}

/** Shared read-only usage content for the overview tab and the existing dialog. */
export function CodexUsageOverview({ t, account, quota, useSessions }: Omit<CodexUsageInjected, 'panel' | 'wide'>) {
  const snapshot = useSyncExternalStore(account.subscribe, account.getSnapshot)
  const quotaSnapshot = useSyncExternalStore(quota.subscribe, quota.snapshot)
  const sessions = useSessions?.(value => value)
  const usage = useMemo(() => usageLedgerOf(sessions), [sessions])
  const locale = t('dateLocale')
  const Grid = useMemo(() => makeQuotaGrid(quota, { t, fmtDuration, locale }), [quota, t, locale])
  return (
    <div className="cc-usage-panel">
        <div className="cc-usage-status" role="status">
          <span aria-hidden="true" style={dotStyle(snapshot.status.status)} />
          <span>{accountStatusLabel(snapshot.status.status, t)}</span>
        </div>
        <Grid days={usage.days} today={usageToday(usage.timeZone)} currency={t('dateLocale') === 'zh-CN' ? 'cny' : 'usd'} />
        {quotaSnapshot === null ? null : <AccountUsage accounts={snapshot.accounts} quota={quotaSnapshot} t={t} />}
      </div>
  )
}

/** Account usage dialog; its entry and read-only interactions remain unchanged. */
export function CodexUsagePanel(props: CodexUsageInjected) {
  const { t, panel } = props
  const open = useSyncExternalStore(panel.subscribe, panel.snapshot)
  return (
    <Modal open={open} onClose={() => { panel.close() }} title={t('usagePanelTitle')} closeLabel={t('close')}
      className="cc-usage-dialog" contentClassName="cc-usage-dialog-content">
      <CodexUsageOverview {...props} />
    </Modal>
  )
}
