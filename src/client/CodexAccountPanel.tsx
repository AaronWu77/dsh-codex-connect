/** Account tab: the saved ChatGPT account list and its immediate actions. */
import { useState } from 'react'
import type { AccountSnapshot, OpenAICodexAccountStore } from './account-store.ts'
import { AccountActions, AccountFeedback } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'

/** Dependencies for the management account panel. */
export interface CodexAccountPanelProps {
  /** Localized page copy. */
  t: OpenAICodexSettingsInjected['t']
  /** Shared account store. */
  store: OpenAICodexAccountStore
  /** Current account snapshot. */
  snapshot: AccountSnapshot
}

/**
 * Render every saved account as one row. The page header owns the active
 * account summary, so this panel starts with the list instead of repeating it.
 * @param props - localized copy, account store, and its current snapshot.
 * @returns the account management panel.
 */
export function CodexAccountPanel({ t, store, snapshot }: CodexAccountPanelProps) {
  const [removeKey, setRemoveKey] = useState<string>()
  const { accounts, busy, operation, status } = snapshot
  const removeAccount = accounts.find(account => account.accountKey === removeKey)
  const replacement = removeAccount?.active === true
    ? accounts.find(account => account.accountKey !== removeAccount.accountKey)
    : undefined
  const authorizing = operation.kind === 'starting-authorization'
    || operation.kind === 'waiting-authorization'
    || operation.kind === 'cancelling-authorization'
    || status.status === 'signing-in'

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
      {accounts.map(account => <li key={account.accountKey} className="cc-account-row" data-active={account.active ? 'true' : undefined}>
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
      </li>)}
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
