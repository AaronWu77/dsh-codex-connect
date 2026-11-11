/** Codex Connect management page: account header, module rail, and per-module content. */
import { AccountReadiness } from './AccountReadiness.tsx'
import { useCallback, useId, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { AccountSnapshot } from './account-store.ts'
import { accountStatusLabel, dotStyle } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import { CodexAccountPanel } from './CodexAccountPanel.tsx'
import { CodexManagementOverview } from './CodexManagementOverview.tsx'
import { OpenAICodexConfiguration } from './OpenAICodexConfiguration.tsx'

/** Dependencies delivered by the settings registration. */
export type OpenAICodexPluginCardInjected = OpenAICodexSettingsInjected
/** Root framework seats plus management dependencies. */
export type OpenAICodexPluginCardProps = PropsRuntime<'settings.section'> & OpenAICodexPluginCardInjected

const MODULES = ['overview', 'account', 'models', 'capabilities', 'network'] as const
const LABELS = {
  overview: 'managementOverview',
  account: 'managementAccounts',
  models: 'modelsModule',
  capabilities: 'capabilitiesModule',
  network: 'networkModule',
} as const
const DESCRIPTIONS = {
  overview: 'managementOverviewDescription',
  account: 'managementAccountDescription',
  models: 'managementModelsDescription',
  capabilities: 'managementCapabilitiesDescription',
  network: 'managementNetworkDescription',
} as const
type Module = (typeof MODULES)[number]

/** Stable fallback for hosts that render the page before the account store is injected. */
const EMPTY_ACCOUNT_SNAPSHOT: AccountSnapshot = { status: { status: 'loading' }, busy: false, accounts: [], operation: { kind: 'idle' } }

/** Keep one configuration editor mounted so unsaved drafts survive module switches. */
export function OpenAICodexPluginCard(props: OpenAICodexPluginCardProps) {
  const { t, account, quota, configScope, localUsage } = props
  const [selected, setSelected] = useState<Module>('overview')
  const prefix = useId()
  const subscribeAccount = useCallback((listener: () => void) => account?.subscribe(listener) ?? (() => undefined), [account])
  const getAccountSnapshot = useCallback(() => account?.getSnapshot() ?? EMPTY_ACCOUNT_SNAPSHOT, [account])
  const snapshot = useSyncExternalStore(subscribeAccount, getAccountSnapshot)
  const subscribeConfig = useCallback((listener: () => void) => configScope?.subscribe(listener) ?? (() => undefined), [configScope])
  const getConfigSnapshot = useCallback(() => configScope?.getSnapshot(), [configScope])
  const configSnapshot = useSyncExternalStore(subscribeConfig, getConfigSnapshot)
  const config = configSnapshot?.value
  const active = snapshot.accounts.find(candidate => candidate.active)
  const accountName = active?.displayName ?? t('accountHeading')
  const accountMeta = active?.maskedEmail ?? (snapshot.accounts.length === 0 ? undefined : t('defaultAccountDetail'))
  const statusLabel = accountStatusLabel(snapshot.status.status, t)
  const openAccounts = (): void => {
    setSelected('account')
    document.getElementById(prefix + '-account-tab')?.focus()
  }
  const capabilityCount = config === undefined
    ? 0
    : [config.enableSearch, config.enableImageTool, config.enableImageGeneration, config.enableAutoReview].filter(Boolean).length
  const summary = (module: Module): string => {
    if (module === 'overview') return statusLabel
    if (module === 'account') return t('savedAccounts') + ' · ' + String(snapshot.accounts.length)
    if (module === 'models') return config?.models === undefined
      ? t('modelsModuleDefault')
      : t('modelsModuleSelected', { count: config.models.length })
    if (module === 'network') return t(config?.enableProxy === true ? 'networkModuleProxy' : 'networkModuleDirect')
    return t('capabilitiesModuleEnabled', { count: capabilityCount })
  }
  const tabCount = (module: Module): string | undefined => {
    if (module === 'account') return String(snapshot.accounts.length)
    if (module === 'models') return config?.models === undefined ? undefined : String(config.models.length)
    if (module === 'capabilities') return config === undefined ? undefined : String(capabilityCount)
    return undefined
  }
  const selectModule = (module: Module): void => {
    setSelected(module)
    document.getElementById(prefix + '-' + module + '-tab')?.focus()
  }

  return <section className="cc-page cc-manage" aria-label={t('managementTitle')}>
    <header className="cc-page-header">
      <div className="cc-page-account">
        <span className="cc-page-avatar" aria-hidden="true">{(active?.displayName.trim()[0] ?? 'C').toUpperCase()}</span>
        <span className="cc-page-account-copy">
          <span className="cc-page-account-title">
            <strong>{accountName}</strong>
            <span className="cc-page-account-status" role="status">
              <span aria-hidden="true" style={dotStyle(snapshot.status.status)} />
              {statusLabel}
            </span>
          </span>
          {accountMeta === undefined ? null : <span className="cc-page-account-meta" title={accountMeta}>{accountMeta}</span>}
        </span>
      </div>
      {selected === 'account' ? null : (
        <button type="button" className="cc-page-action" onClick={openAccounts}>{t('manageAccounts')}</button>
      )}
    </header>
    <div className="cc-tabs" role="tablist" aria-label={t('settingsModules')}>
      {MODULES.map((module, index) => {
        const count = tabCount(module)
        return <button key={module} type="button" role="tab"
          id={prefix + '-' + module + '-tab'} aria-label={t(LABELS[module])} aria-controls={prefix + '-' + module}
          aria-selected={selected === module} tabIndex={selected === module ? 0 : -1}
          title={summary(module)}
          className="cc-tab"
          onClick={() => { setSelected(module) }}
          onKeyDown={event => {
            if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const nextIndex = event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? MODULES.length - 1
                : (index + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + MODULES.length) % MODULES.length
            selectModule(MODULES[nextIndex]!)
          }}>
          <span>{t(LABELS[module])}</span>
          {count === undefined ? null : <span className="cc-tab-count" aria-hidden="true">{count}</span>}
        </button>
      })}
    </div>
    <main className="cc-content">
      <header className="cc-content-header">
        <h2 className="cc-content-title">{t(LABELS[selected])}</h2>
        <p className="cc-content-subtitle">{t(DESCRIPTIONS[selected])}</p>
      </header>
      <div id={prefix + '-overview'} role="tabpanel" aria-labelledby={prefix + '-overview-tab'} hidden={selected !== 'overview'}>
        {selected === 'overview' && account && quota
          ? <><CodexManagementOverview t={t} quota={quota} {...localUsage === undefined ? {} : { localUsage }} /><details className="cc-manage-diagnostics">
              <summary>{t('accountReadiness')}</summary><AccountReadiness t={t} account={account} quota={quota} heading={false} navigate={() => { selectModule('account') }} />
            </details></>
          : !account || !quota ? <p role="status">{t('usageNoData')}</p> : null}
      </div>
      <div id={prefix + '-account'} role="tabpanel" aria-labelledby={prefix + '-account-tab'} hidden={selected !== 'account'}>
        {selected === 'account'
          ? account === undefined
            ? <p role="status">{t('usageNoData')}</p>
            : <CodexAccountPanel t={t} store={account} snapshot={snapshot} />
          : null}
      </div>
      <div className="cc-content-config">
        <OpenAICodexConfiguration
          t={t}
          scope={configScope}
          {...account === undefined ? {} : { account }}
          activeModule={selected === 'overview' || selected === 'account' ? 'account' : selected}
          panelIdPrefix={prefix}
          management
          flush
        />
      </div>
    </main>
  </section>
}