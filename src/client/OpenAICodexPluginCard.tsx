/** Codex management center with a read-only overview and explicit account/settings operations. */
import { AccountReadiness } from './AccountReadiness.tsx'
import { useId, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { OpenAICodexSettings } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import { OpenAICodexConfiguration } from './OpenAICodexConfiguration.tsx'
import { CodexUsageOverview } from './CodexUsagePanel.tsx'

/** Dependencies delivered by the settings registration. */
export type OpenAICodexPluginCardInjected = OpenAICodexSettingsInjected
/** Root framework seats plus management dependencies. */
export type OpenAICodexPluginCardProps = PropsRuntime<'settings.plugins.tab'> & OpenAICodexPluginCardInjected
const MODULES = ['overview', 'account', 'models', 'network', 'capabilities'] as const
const LABELS = { overview: 'managementOverview', account: 'managementAccounts', models: 'modelsModule', network: 'networkModule', capabilities: 'capabilitiesModule' } as const
type Module = (typeof MODULES)[number]

/** Keep one configuration editor mounted so unsaved drafts survive tab changes. */
export function OpenAICodexPluginCard(props: OpenAICodexPluginCardProps) {
  const { t, account, quota, configScope } = props
  const [selected, setSelected] = useState<Module>('overview')
  const prefix = useId()
  return <section className="cc-manage" aria-label={t('managementTitle')}>
    <header className="cc-manage-heading">
      <div><h2>{t('title')}</h2><p>{t('managementIntro')}</p></div>
      <span className="cc-manage-badge">{t('managementBadge')}</span>
    </header>
    <div className="cc-manage-tabs" role="tablist" aria-label={t('settingsModules')}>
      {MODULES.map((module, index) => <button key={module} type="button" role="tab"
        id={prefix + '-' + module + '-tab'} aria-controls={prefix + '-' + module}
        aria-selected={selected === module} tabIndex={selected === module ? 0 : -1}
        onClick={() => { setSelected(module) }} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? MODULES.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + MODULES.length) % MODULES.length
          const next = MODULES[nextIndex]!
          setSelected(next)
          document.getElementById(prefix + '-' + next + '-tab')?.focus()
        }}>{t(LABELS[module])}</button>)}
    </div>
    <div className="cc-manage-body">
      <div id={prefix + '-overview'} role="tabpanel" aria-labelledby={prefix + '-overview-tab'} hidden={selected !== 'overview'}>
        {selected === 'overview' && account && quota
          ? <><CodexUsageOverview t={t} account={account} quota={quota} useSessions={props.useSessions} /><AccountReadiness t={t} account={account} quota={quota} navigate={() => {setSelected('account'); document.getElementById(prefix+'-account-tab')?.focus()}} /></>
          : !account || !quota ? <p role="status">{t('usageNoData')}</p> : null}
      </div>
      <div id={prefix + '-account'} role="tabpanel" aria-labelledby={prefix + '-account-tab'} hidden={selected !== 'account'}>
        {selected === 'account' ? <div className="cc-manage-card"><OpenAICodexSettings {...props} embedded accountOnly management /></div> : null}
      </div>
      <div className="cc-manage-editor">
        <OpenAICodexConfiguration t={t} scope={configScope} {...account === undefined ? {} : { account }} activeModule={selected === 'overview' ? 'account' : selected} panelIdPrefix={prefix} management />
      </div>
    </div>
  </section>
}
