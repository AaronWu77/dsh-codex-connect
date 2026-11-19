/** Account tab: saved ChatGPT accounts with their Codex limits and immediate actions. */
import { useCallback, useState, useSyncExternalStore } from 'react'
import type { AccountSnapshot, OpenAICodexAccountStore } from './account-store.ts'
import { AccountActions, AccountFeedback } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import type { CodexQuotaService } from './quota-service.ts'
import { fmtDuration } from './usage-format.ts'
import { accountsOf, windowLabel, windowsOf } from './UsageQuotaGrid.tsx'

/** Dependencies for the management account panel. */
export interface CodexAccountPanelProps {
  /** Localized page copy. */
  t: OpenAICodexSettingsInjected['t']
  /** Shared account store. */
  store: OpenAICodexAccountStore
  /** Current account snapshot. */
  snapshot: AccountSnapshot
  /** Shared per-account quota service; absent renders accounts without limits. */
  quota?: CodexQuotaService
}

/**
 * Render every saved account as one row carrying its own Codex limits, so the
 * account name, active badge, and window progress appear exactly once.
 * @param props - localized copy, account store, its snapshot, and the quota service.
 * @returns the account management panel.
 */
export function CodexAccountPanel({ t, store, snapshot, quota }: CodexAccountPanelProps) {
  const [removeKey, setRemoveKey] = useState<string>()
  const subscribeQuota = useCallback((listener: () => void) => quota?.subscribe(listener) ?? (() => undefined), [quota])
  const getQuota = useCallback(() => quota?.snapshot() ?? null, [quota])
  const quotaSnapshot = useSyncExternalStore(subscribeQuota, getQuota)
  const figures = accountsOf(quotaSnapshot)
  const { accounts, busy, operation, status } = snapshot
  const removeAccount = accounts.find(account => account.accountKey === removeKey)
  const replacement = removeAccount?.active === true
    ? accounts.find(account => account.accountKey !== removeAccount.accountKey)
    : undefined
  const authorizing = operation.kind === 'starting-authorization'
    || operation.kind === 'waiting-authorization'
    || operation.kind === 'cancelling-authorization'
    || status.status === 'signing-in'
  const resetIn = (resetAt: number | undefined): string | undefined => {
    if (resetAt === undefined) return undefined
    const left = resetAt * 1000 - Date.now()
    return left > 0 ? fmtDuration(left) : undefined
  }

  if (accounts.length === 0) {
    return <div className="cc-account-panel">
      <div className="cc-account-empty">
        <h3>{t('accountHeading')}</h3>
        <p>{t('managementAccountDescription')}</p>
        <AccountActions t={t} store={store} snapshot={snapshot} />
      </div>
      <AccountFeedback t={t} snapshot={snapshot} store={store} />
    </div>
  }

  return <div className="cc-account-panel">
    <div className="cc-account-panel-head">
      <div>
        <h3>{t('savedAccounts')} <span className="cc-account-count">{accounts.length}</span></h3>
      </div>
      <button type="button" className="cc-primary-button" disabled={busy || authorizing} onClick={() => { void store.signIn() }}>
        {operation.kind === 'starting-authorization' ? t('working') : t('addAccount')}
      </button>
    </div>
    {authorizing ? <div className="cc-account-auth">
      <AccountActions t={t} store={store} snapshot={snapshot} compact />
      <p>{t('addingAccountKeepsCurrent')}</p>
    </div> : null}
    <ul className="cc-account-list">
      {accounts.map(account => {
        const figure = figures.find(candidate => candidate.accountKey === account.accountKey)
        const windows = figure === undefined ? [] : windowsOf(figure)
        return <li key={account.accountKey} className="cc-account-row" data-active={account.active ? 'true' : undefined}>
          <span className="cc-account-row-avatar" aria-hidden="true">{(account.displayName.trim()[0] ?? 'C').toUpperCase()}</span>
          <span className="cc-account-row-copy">
            <strong>{account.displayName}</strong>
            <span>{account.maskedEmail === undefined ? t('savedAccountDetail') : account.maskedEmail}</span>
          </span>
          <span className="cc-account-row-actions">
            {account.active
              ? <span className="cc-account-badge">{t('usingAccount')}</span>
              : <button type="button" className="cc-row-button" disabled={busy}
                onClick={() => { void store.activate(account.accountKey) }}>
                {operation.kind === 'activating' && operation.accountKey === account.accountKey ? t('working') : t('useAccount')}
              </button>}
            <button type="button" className="cc-row-button cc-row-button-danger" disabled={busy}
              onClick={() => { setRemoveKey(account.accountKey) }}>
              {t('removeAccount')}
            </button>
          </span>
          {quota === undefined ? null : <div className="cc-account-quota" aria-label={t('ov.quota.limits')}>
            {figure?.errorCode === undefined ? null : <p className="cc-codex-empty">{t('ov.quota.readFailed')}</p>}
            {windows.length === 0
              ? figure?.errorCode === undefined
                ? <p className="cc-codex-empty">{figure?.unavailable === true ? t('ov.quota.readFailed') : t('quotaUnavailable')}</p>
                : null
              : <div className="cc-codex-windows">
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
          </div>}
        </li>
      })}
    </ul>
    <div className="cc-account-footer">
      <p>{t('activeAccountHelp')}</p>
      <button type="button" className="cc-row-button cc-row-button-danger" disabled={busy}
        onClick={() => { void store.signOut() }}>
        {operation.kind === 'signing-out' ? t('working') : t('signOutAll')}
      </button>
    </div>
    <AccountFeedback t={t} snapshot={snapshot} store={store} />
    {removeAccount === undefined ? null : <section className="cc-account-remove" role="region" aria-live="polite"
      aria-label={t('removeAccountTitle', { name: removeAccount.displayName })}>
      <strong>{t('removeAccountTitle', { name: removeAccount.displayName })}</strong>
      <p>{accounts.length === 1
        ? t('removeLastAccountCopy')
        : replacement === undefined ? t('removeAccountCopy') : t('removeActiveAccountCopy', { name: replacement.displayName })}</p>
      <div className="cc-account-remove-actions">
        <button type="button" className="cc-row-button" onClick={() => { setRemoveKey(undefined) }}>{t('cancel')}</button>
        <button type="button" className="cc-row-button cc-row-button-danger" disabled={busy}
          onClick={() => { void store.remove(removeAccount.accountKey, replacement?.accountKey) }}>
          {operation.kind === 'removing' ? t('working') : t('confirmRemove')}
        </button>
      </div>
    </section>}
  </div>
}
