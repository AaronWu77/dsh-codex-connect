/** Grouped management overview: platform/local summary and Codex limits per account. */
import { useSyncExternalStore } from 'react'
import { balanceEntryOf, platformBalanceSnapshot, subscribePlatformBalance } from './balance.ts'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import type { CodexQuotaService } from './quota-service.ts'
import { fmt, fmtDuration } from './usage-format.ts'
import { subscribeUnavailableUsage, unavailableUsageSnapshot, usageToday } from './usage-ledger.ts'
import type { LocalUsageSource } from './usage-ledger.ts'
import { LocalUsageNotice } from './CodexUsagePanel.tsx'
import { accountsOf, symbolOf, windowLabel, windowsOf } from './UsageQuotaGrid.tsx'

/** Dependencies for the grouped management overview. */
export interface CodexManagementOverviewProps {
  /** Localized page copy. */
  t: OpenAICodexSettingsInjected['t']
  /** Shared per-account quota service. */
  quota: CodexQuotaService
  /** Local session usage source, when supplied by the plugin. */
  localUsage?: LocalUsageSource
}

/**
 * Render the management overview with platform/local figures separated from
 * per-account Codex limits. Unlike the compact quota grid, account identity is
 * the group heading and each window shows its reset time in place.
 * @param props - localized copy, quota service, and local usage source.
 * @returns the grouped overview.
 */
export function CodexManagementOverview({ t, quota, localUsage }: CodexManagementOverviewProps) {
  const balance = useSyncExternalStore(subscribePlatformBalance, platformBalanceSnapshot)
  const quotaSnapshot = useSyncExternalStore(quota.subscribe, quota.snapshot)
  const usage = useSyncExternalStore(localUsage?.subscribe ?? subscribeUnavailableUsage, localUsage?.snapshot ?? unavailableUsageSnapshot)
  const entry = balanceEntryOf(balance, t('dateLocale') === 'zh-CN' ? 'cny' : 'usd')
  const today = usage.data?.days[usageToday(usage.data?.timeZone)]
  const accounts = accountsOf(quotaSnapshot)
  const resetIn = (resetAt: number | undefined): string | undefined => {
    if (resetAt === undefined) return undefined
    const left = resetAt * 1000 - Date.now()
    return left > 0 ? fmtDuration(left) : undefined
  }
  return <div className="cc-codex-overview">
    <section className="cc-codex-section" aria-label={t('ov.quota.platform')}>
      <h3>{t('ov.quota.platform')}</h3>
      <div className="cc-codex-summary">
        {entry === null ? null : <div className="cc-codex-card">
          <span className="cc-codex-card-label">{t('ov.quota.platformBalance')}</span>
          <span className="cc-codex-card-value">{symbolOf(entry.currency) + entry.total.toFixed(2)}</span>
          <span className="cc-codex-card-sub">{t('ov.quota.balanceSub', { granted: entry.granted.toFixed(2), topped: entry.toppedUp.toFixed(2) })}</span>
        </div>}
        {today === undefined ? null : <div className="cc-codex-card">
          <span className="cc-codex-card-label">{t('ov.quota.today')}</span>
          <span className="cc-codex-card-value">{fmt(today.tokens)}</span>
          <span className="cc-codex-card-sub">{t('ov.kpi.tokens')}</span>
        </div>}
      </div>
      <LocalUsageNotice t={t} usage={usage} source={localUsage} />
    </section>
    <section className="cc-codex-section" aria-label={t('ov.quota.limits')}>
      <h3>{t('ov.quota.limits')}</h3>
      {accounts.length === 0 ? <p className="cc-codex-empty">{t('quotaUnavailable')}</p> : <div className="cc-codex-limits">
        {accounts.map(account => {
          const windows = windowsOf(account)
          const showHead = accounts.length > 1 || account.errorCode !== undefined || account.unavailable === true
          return <div className="cc-codex-account" key={account.accountKey} data-active={account.active ? 'true' : undefined}>
            {showHead ? <div className="cc-codex-account-head">
              <strong>{account.label === '' ? t('ov.quota.accountCurrent') : account.label}</strong>
              {account.active && accounts.length > 1 ? <span className="cc-codex-badge">{t('ov.quota.active')}</span> : null}
              {account.errorCode === undefined && account.unavailable !== true ? null : <span className="cc-codex-error">{t('ov.quota.readFailed')}</span>}
            </div> : null}
            {windows.length === 0 ? <p className="cc-codex-empty">{t('quotaUnavailable')}</p> : <div className="cc-codex-windows">
              {windows.map(win => {
                const reset = resetIn(win.resetAt)
                const remaining = Math.max(0, Math.min(100, Math.round(win.remainingPercent)))
                return <div className="cc-codex-window" key={win.windowSeconds}>
                  <span className="cc-codex-window-label">{t('ov.quota.window', { w: windowLabel(win.windowSeconds) })}</span>
                  <span className="cc-codex-window-value">{t('ov.quota.remaining', { p: remaining })}</span>
                  {reset === undefined ? null : <span className="cc-codex-window-reset">{t('ov.quota.resetIn', { d: reset })}</span>}
                  <span className="cc-codex-meter" data-low={remaining <= 20 ? 'true' : undefined} aria-hidden="true">
                    <span style={{ width: remaining + '%' }} />
                  </span>
                </div>
              })}
            </div>}
          </div>
        })}
      </div>}
    </section>
  </div>
}
