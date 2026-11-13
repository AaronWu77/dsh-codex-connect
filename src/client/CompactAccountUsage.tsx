/** Dense per-account quota summary for the sidebar dialog. */
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import { formatOpenAICodexResetAt, formatOpenAICodexTimestamp } from './OpenAICodexSettings.tsx'
import type { AccountSnapshot } from './account-store.ts'
import type { CodexQuota, CodexQuotaAccount, CodexQuotaWindow } from './quota-service.ts'
import { fmtDuration } from './usage-format.ts'
import { windowLabel, windowsOf } from './UsageQuotaGrid.tsx'

/** One account's soonest reset-card expiry, when the server disclosed one. */
function soonestReset(account: CodexQuotaAccount): number | undefined {
  return (account.resetCredits?.credits ?? [])
    .map(credit => credit.expiresAt)
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right)[0]
}

/** @param win - one rolling window. @returns a short relative reset label, when known. */
function resetIn(win: CodexQuotaWindow): string | undefined {
  if (win.resetAt === undefined) return undefined
  const left = win.resetAt * 1000 - Date.now()
  return left > 0 ? fmtDuration(left) : undefined
}

function WindowCell({ win, t }: { win: CodexQuotaWindow | undefined; t: OpenAICodexSettingsInjected['t'] }) {
  if (win === undefined) return <div className="cc-account-window cc-account-window-empty">{t('usageNoData')}</div>
  const percent = Math.max(0, Math.min(100, Math.round(win.remainingPercent)))
  const reset = resetIn(win)
  return <div className="cc-account-window">
    <div className="cc-account-window-line">
      <span className="cc-account-window-label">{windowLabel(win.windowSeconds)}</span>
      <span className="cc-account-window-value">{t('ov.quota.remaining', { p: percent })}</span>
    </div>
    <span className="cc-account-meter" data-low={percent <= 20 ? 'true' : undefined} aria-hidden="true">
      <span style={{ width: percent + '%' }} />
    </span>
    {reset === undefined ? null : <span className="cc-account-window-reset">{t('ov.quota.resetIn', { d: reset })}</span>}
  </div>
}

/**
 * Render every signed-in account as a compact card: rolling windows, reset-card count
 * and a collapsed exact-expiry list. This replaces the long per-account paragraph list
 * in the sidebar dialog; the Settings page keeps its detailed `AccountUsage` block.
 */
export function CompactAccountUsage({ accounts, quota, t }: {
  accounts: AccountSnapshot['accounts']
  quota: CodexQuota
  t: OpenAICodexSettingsInjected['t']
}) {
  const rows = quota.accounts ?? []
  if (rows.length === 0) return null
  const updatedAt = formatOpenAICodexTimestamp(t('dateLocale'), quota.fetchedAt)
  return <section className="cc-account-summary" aria-label={t('accountUsageHeading')}>
    <div className="cc-account-summary-head">
      <h3>{t('accountUsageHeading')}</h3>
      {updatedAt === undefined ? null : <span>{t('usageUpdatedAt', { time: updatedAt })}</span>}
    </div>
    <div className="cc-account-grid">
      {rows.map(account => {
        const name = accounts.find(candidate => candidate.accountKey === account.accountKey)?.displayName ?? account.label
        const windows = windowsOf(account)
        const nearest = soonestReset(account)
        const shortDate = nearest === undefined ? undefined : new Intl.DateTimeFormat(t('dateLocale'), { month: '2-digit', day: '2-digit' }).format(nearest * 1000)
        const credits = [...(account.resetCredits?.credits ?? [])]
          .sort((left, right) => (left.expiresAt ?? Number.MAX_SAFE_INTEGER) - (right.expiresAt ?? Number.MAX_SAFE_INTEGER))
        return <article className="cc-account-card" key={account.accountKey} data-active={account.active ? 'true' : undefined}>
          <div className="cc-account-card-head">
            <strong title={name === '' ? t('ov.quota.accountCurrent') : name}>{name === '' ? t('ov.quota.accountCurrent') : name}</strong>
            {account.active ? <span className="cc-account-badge">{t('ov.quota.active')}</span> : null}
            {account.unavailable === true || account.errorCode !== undefined
              ? <span className="cc-account-error">{t('ov.quota.readFailed')}</span>
              : null}
          </div>
          <div className="cc-account-windows">
            {windows.length === 0
              ? <WindowCell win={undefined} t={t} />
              : windows.map(win => <WindowCell key={win.windowSeconds} win={win} t={t} />)}
          </div>
          {account.resetCredits === undefined ? null : <div className="cc-account-resets">
            <span>{t('resetCardsAvailable', { count: account.resetCredits.availableCount })}</span>
            {shortDate === undefined ? null : <span className="cc-account-soonest">{t('ov.dash.nearest', { date: shortDate })}</span>}
          </div>}
          {credits.length === 0 ? null : <details className="cc-account-details">
            <summary>{t('ov.dash.resetDetails')}</summary>
            {credits.map((credit, index) => {
              const expires = formatOpenAICodexResetAt(t('dateLocale'), credit.expiresAt)
              return <div className="cc-account-detail-row" key={`${credit.id}-${String(index)}`}>
                <span>{credit.title ?? t('resetCardUnnamed')}</span>
                <span>{expires === undefined ? t('resetCardNoExpiry') : t('resetCardExpiry', { time: expires })}</span>
              </div>
            })}
          </details>}
        </article>
      })}
    </div>
  </section>
}
