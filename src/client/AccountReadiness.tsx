/** Read-only account evidence in management; navigation never changes the active account. */
import { useSyncExternalStore } from 'react'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
export function AccountReadiness({account, quota, t, navigate}: Required<Pick<OpenAICodexSettingsInjected,'account'|'quota'|'t'>> & {navigate:()=>void}) {
  const state=useSyncExternalStore(account.subscribe,account.getSnapshot,account.getSnapshot)
  const figures=useSyncExternalStore(quota.subscribe,quota.snapshot,quota.snapshot)
  return <section className="cc-manage-card" aria-label={t('accountReadiness')}>
    <h3>{t('accountReadiness')}</h3><p>{t('readinessManualOnly')}</p>
    {state.accounts.length===0 ? <p>{t('usageNoData')}</p> : <ul className="cc-account-readiness">
      {state.accounts.map(saved=>{
        const item=figures?.accounts?.find(a=>a.accountKey===saved.accountKey)
        const reauth=item?.errorCode==='reauth-required' || saved.active && state.status.status==='reauth-required'
        const failed=item?.unavailable===true
        const exhausted=item?.windows.some(w=>w.remainingPercent===0 && (w.resetAt===undefined || w.resetAt*1000>Date.now()))
        const expired=item?.windows.some(w=>w.resetAt!==undefined && w.resetAt*1000<=Date.now())
        const key=reauth?'readinessReauth':item?.errorCode==='rate-limited'?'readinessLimited':failed?'readinessUnavailable':expired?'readinessStale':!item?.windows.length?'readinessUnknown':exhausted?'readinessExhausted':'readinessObserved'
        return <li key={saved.accountKey}><strong>{saved.displayName}</strong>{saved.active ? <span>{t('usingAccount')}</span>:null}
          <span>{t(key)}</span>
          {item?.fetchedAt!==undefined?<small>{t('readinessChecked')}: {new Date(item.fetchedAt).toLocaleString(t('dateLocale'))} {failed?t('readinessRetained'):null}</small>:null}
          {item?.windows.filter(w=>w.resetAt!==undefined).map(w=><small key={w.bucketId+':'+w.windowSeconds}>{t('readinessReset')}: {new Date(w.resetAt!*1000).toLocaleString(t('dateLocale'))}</small>)}
        </li>
      })}
    </ul>}
    <button type="button" onClick={navigate}>{t('readinessManage')}</button>
  </section>
}
