/** Dense per-account quota table for the sidebar dialog. */
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import { formatOpenAICodexTimestamp } from './OpenAICodexSettings.tsx'
import type { AccountSnapshot } from './account-store.ts'
import type { CodexQuota, CodexQuotaAccount, CodexQuotaWindow } from './quota-service.ts'
import { fmtDuration } from './usage-format.ts'
import { windowLabel } from './UsageQuotaGrid.tsx'

const FIVE_HOURS = 18_000
const SEVEN_DAYS = 604_800

/** @param account - one account. @param seconds - exact window length. @returns its most constrained window, if reported. */
function windowOf(account: CodexQuotaAccount, seconds: number): CodexQuotaWindow | undefined {
  let selected: CodexQuotaWindow | undefined
  for (const window of account.windows) {
    if (window.windowSeconds !== seconds) continue
    if (selected === undefined || window.remainingPercent < selected.remainingPercent) selected = window
  }
  return selected
}

/** @param win - one rolling window. @returns a short relative reset label, when known. */
function resetIn(win: CodexQuotaWindow): string | undefined {
  if (win.resetAt === undefined) return undefined
  const left = win.resetAt * 1000 - Date.now()
  return left > 0 ? fmtDuration(left) : undefined
}

/** One fixed 5h/7d cell: percentage, meter and relative reset, or a quiet dash. */
function QuotaCell({ win, t }: { win: CodexQuotaWindow | undefined; t: OpenAICodexSettingsInjected['t'] }) {
  if (win === undefined) return <div className="cc-account-quota cc-account-quota-empty">—</div>
  const percent = Math.max(0, Math.min(100, Math.round(win.remainingPercent)))
  const reset = resetIn(win)
  return <div className="cc-account-quota">
    <div className="cc-account-quota-line">
      <span className="cc-account-quota-value">{t('ov.quota.remaining', { p: percent })}</span>
      {reset === undefined ? null : <span className="cc-account-quota-reset">{reset}</span>}
    </div>
    <span className="cc-account-meter" data-low={percent <= 20 ? 'true' : undefined} aria-hidden="true">
      <span style={{ width: percent + '%' }} />
    </span>
  </div>
}

/** @param account - one account. @param t - locale. @returns reset count plus the nearest dated card. */
function ResetCell({ account, t }: { account: CodexQuotaAccount; t: OpenAICodexSettingsInjected['t'] }) {
  if (account.resetCredits === undefined) return <div className="cc-account-reset cc-account-quota-empty">—</div>
  const nearest = (account.resetCredits.credits ?? [])
    .map(credit => credit.expiresAt)
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right)[0]
  const date = nearest === undefined
    ? undefined
    : new Intl.DateTimeFormat(t('dateLocale'), { month: '2-digit', day: '2-digit' }).format(nearest * 1000)
  return <div className="cc-account-reset">
    <span className="cc-account-reset-count">{t('ov.dash.cards', { count: account.resetCredits.availableCount })}</span>
    {date === undefined ? null : <span className="cc-account-reset-date">{t('ov.dash.nearest', { date })}</span>}
  </div>
}

/**
 * Render every signed-in account as one aligned row: fixed 5h/7d columns,
 * a quiet reset count and the nearest card expiry. The Settings page keeps its
 * detailed per-account reset-card list; this dialog optimizes for scanning.
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
    <div className="cc-account-table" role="table" aria-label={t('accountUsageHeading')}>
      <div className="cc-account-row cc-account-row-head" role="row">
        <span role="columnheader">{t('ov.dash.account')}</span>
        <span role="columnheader">{windowLabel(FIVE_HOURS)}</span>
        <span role="columnheader">{windowLabel(SEVEN_DAYS)}</span>
        <span role="columnheader">{t('ov.dash.resetCards')}</span>
      </div>
      {rows.map(account => {
        const name = accounts.find(candidate => candidate.accountKey === account.accountKey)?.displayName ?? account.label
        return <div className="cc-account-row" role="row" key={account.accountKey} data-active={account.active ? 'true' : undefined}>
          <div className="cc-account-name" role="cell">
            <strong title={name === '' ? t('ov.quota.accountCurrent') : name}>{name === '' ? t('ov.quota.accountCurrent') : name}</strong>
            {account.active ? <span className="cc-account-badge">{t('ov.quota.active')}</span> : null}
            {account.unavailable === true || account.errorCode !== undefined
              ? <span className="cc-account-error">{t('ov.quota.readFailed')}</span>
              : null}
          </div>
          <div role="cell"><QuotaCell win={windowOf(account, FIVE_HOURS)} t={t} /></div>
          <div role="cell"><QuotaCell win={windowOf(account, SEVEN_DAYS)} t={t} /></div>
          <div role="cell"><ResetCell account={account} t={t} /></div>
        </div>
      })}
    </div>
  </section>
}
