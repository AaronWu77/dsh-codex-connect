/** Read-only account evidence in management; navigation never changes the active account. */
import { useSyncExternalStore } from 'react'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsKey } from './locales.ts'

/** Props for the readiness summary; navigation is omitted when the list is on screen. */
export interface AccountReadinessProps {
  /** Account state and its subscription. */
  account: Required<Pick<OpenAICodexSettingsInjected, 'account'>>['account']
  /** Per-account quota figures driving the state. */
  quota: Required<Pick<OpenAICodexSettingsInjected, 'quota'>>['quota']
  /** Localized page copy. */
  t: OpenAICodexSettingsInjected['t']
  /** Optional jump to the account list; absent renders no action. */
  navigate?: (() => void) | undefined
  /** Whether to render the section heading. */
  heading?: boolean
}

/**
 * Report which saved accounts need attention, without repeating the limits the
 * account list already shows.
 * @param props - account store, quota service, copy, and optional navigation.
 * @returns the readiness section.
 */
export function AccountReadiness({ account, quota, t, navigate, heading = true }: AccountReadinessProps) {
  const state = useSyncExternalStore(account.subscribe, account.getSnapshot, account.getSnapshot)
  const figures = useSyncExternalStore(quota.subscribe, quota.snapshot, quota.snapshot)
  const entries = state.accounts.map(saved => {
    const item = figures?.accounts?.find(candidate => candidate.accountKey === saved.accountKey)
    const reauth = item?.errorCode === 'reauth-required' || saved.active && state.status.status === 'reauth-required'
    const failed = item?.unavailable === true
    const exhausted = item?.windows.some(w => w.remainingPercent === 0 && (w.resetAt === undefined || w.resetAt * 1000 > Date.now()))
    const expired = item?.windows.some(w => w.resetAt !== undefined && w.resetAt * 1000 <= Date.now())
    const key: OpenAICodexSettingsKey = reauth ? 'readinessReauth' : item?.errorCode === 'rate-limited' ? 'readinessLimited' : failed ? 'readinessUnavailable' : expired ? 'readinessStale' : !item?.windows.length ? 'readinessUnknown' : exhausted ? 'readinessExhausted' : 'readinessObserved'
    return { saved, item, failed, key }
  })
  // The account list already names every account and shows its limits, so this
  // section exists only for accounts that need manual attention.
  const attention = entries.filter(entry => entry.key !== 'readinessObserved' && entry.key !== 'readinessUnavailable' && entry.key !== 'readinessLimited')
  if (attention.length === 0) return null
  return <section className="cc-manage-card" aria-label={t('accountReadiness')}>
    {heading ? <h3>{t('accountReadiness')}</h3> : null}
    <ul className="cc-account-readiness">
      {attention.map(({ saved, item, failed, key }) => <li key={saved.accountKey}>
        <strong>{saved.displayName}</strong>{saved.active ? <span>{t('usingAccount')}</span> : null}
        <span>{t(key)}</span>
        {item?.fetchedAt === undefined ? null : <small>{t('readinessChecked')}: {new Date(item.fetchedAt).toLocaleString(t('dateLocale'))}{failed ? ' ' + t('readinessRetained') : null}</small>}
      </li>)}
    </ul>
    {navigate === undefined ? null : <button type="button" onClick={navigate}>{t('readinessManage')}</button>}
  </section>
}

