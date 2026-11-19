/** Account-scoped metadata preview; never activates an account or changes a model selection. */
import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import type { OpenAICodexAccountStore } from './account-store.ts'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import { decodeOpenAICodexModelCatalog, OPENAI_CODEX_MODEL_CATALOG_PATH } from '../model-contract.ts'
import type { OpenAICodexModelCatalogEntry } from '../model-contract.ts'
import { BrowserRequestTimeoutError, requestJson } from './request-json.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'

type Preview = { accountKey: string; status: 'loading' | 'failed' | 'ready'; models?: OpenAICodexModelCatalogEntry[]; error?: OpenAICodexSettingsKey }

function statusMessage(status: number): OpenAICodexSettingsKey {
  switch (status) {
    case 401: return 'managementCatalogAuthRequired'
    case 403: return 'managementCatalogForbidden'
    case 404: return 'managementCatalogAccountRemoved'
    case 503: return 'managementCatalogUnavailable'
    default: return 'managementCatalogFailed'
  }
}

/** Bound reads follow the selected account; late results cannot overwrite a newer selection. */
export function AccountModelCatalog({ t, account, active, refreshRevision = 0 }: { t: OpenAICodexSettingsInjected['t']; account: OpenAICodexAccountStore; active: boolean; refreshRevision?: number }) {
  const snapshot = useSyncExternalStore(account.subscribe, account.getSnapshot)
  const [selection, setSelection] = useState<string>()
  const selected = snapshot.accounts.find(candidate => candidate.accountKey === selection)
    ?? snapshot.accounts.find(candidate => candidate.active) ?? snapshot.accounts[0]
  const accountKey = selected?.accountKey
  const [preview, setPreview] = useState<Preview>()
  const [retry, setRetry] = useState(0)
  const selectId = useId()
  useEffect(() => {
    if (!active || accountKey === undefined) return
    const controller = new AbortController()
    setPreview(previous => ({ accountKey, status: 'loading', ...(previous?.accountKey === accountKey && previous.models !== undefined ? { models: previous.models } : {}) }))
    const fail = (error: OpenAICodexSettingsKey): void => {
      if (!controller.signal.aborted) setPreview(previous => ({ accountKey, status: 'failed', error, ...(previous?.accountKey === accountKey && previous.models !== undefined ? { models: previous.models } : {}) }))
    }
    void (async () => {
      try {
        const { response, value } = await requestJson(OPENAI_CODEX_MODEL_CATALOG_PATH + '?accountKey=' + encodeURIComponent(accountKey), { method: 'GET', credentials: 'same-origin', signal: controller.signal })
        if (!response.ok) { fail(statusMessage(response.status)); return }
        const models = decodeOpenAICodexModelCatalog(value)
        if (models === undefined) { fail('managementCatalogInvalid'); return }
        if (!controller.signal.aborted) setPreview({ accountKey, status: 'ready', models })
      } catch (error) {
        fail(error instanceof BrowserRequestTimeoutError ? 'managementCatalogTimeout' : 'managementCatalogFailed')
      }
    })()
    return () => { controller.abort() }
  }, [accountKey, active, retry, refreshRevision])
  const current = preview?.accountKey === accountKey ? preview : undefined
  return <section className="cc-manage-catalog" aria-label={t('managementAccountCatalog')}>
    <div><h3>{t('managementAccountCatalog')}</h3><p>{t('managementAccountCatalogHelp')}</p></div>
    {snapshot.accounts.length === 0 ? <p role="status">{t('managementCatalogLogin')}</p> : <>
      <label htmlFor={selectId}>{t('managementPreviewAccount')}
        <select id={selectId} value={accountKey} onChange={event => { setSelection(event.currentTarget.value) }}>
          {snapshot.accounts.map(candidate => <option key={candidate.accountKey} value={candidate.accountKey}>{candidate.displayName}</option>)}
        </select>
      </label>
      {current === undefined || current.status === 'loading' ? <p role="status">{t('modelCatalogLoading')}</p> : null}
      {current?.status === 'failed' ? <div role="alert"><p>{t(current.error ?? 'managementCatalogFailed')}</p><button type="button" onClick={() => { setRetry(value => value + 1) }}>{t('managementCatalogRetry')}</button></div> : null}
      {current?.models !== undefined && current.status !== 'ready' ? <p role="status">{t('managementCatalogRetained')}</p> : null}
      {current?.models !== undefined ? current.models.length === 0 ? <p>{t('managementCatalogEmpty')}</p> : <ul>
        {current.models.map(model => <li key={model.id}>
          <div><strong>{model.name}</strong><span>{t(model.available === false ? 'managementModelUnavailable' : model.available === true ? 'managementModelAvailable' : 'catalogSourceBundled')}</span></div>
          <code>{model.id}</code>
          <p>{t('contextTokens')}: {new Intl.NumberFormat(t('dateLocale')).format(model.contextWindow)} · {t('maxTokensLabel')}: {new Intl.NumberFormat(t('dateLocale')).format(model.maxTokens)}</p>
          {model.available === false ? <p>{t('managementModelUnavailableReason')}</p> : null}
        </li>)}
      </ul> : null}
    </>}
  </section>
}
