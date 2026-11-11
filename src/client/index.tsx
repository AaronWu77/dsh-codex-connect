/** Browser half: OpenAI Codex account management inside Plugin configuration. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the conversation input-region SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls ctx.modelDirectories and its session directory contract.
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { OpenAICodexSettingsConfig } from '../settings-contract.ts'
import { OPENAI_CODEX_SETTINGS_NAMESPACE } from '../settings-contract.ts'
import { OpenAICodexPluginCard } from './OpenAICodexPluginCard.tsx'
import { CodexSettingsIcon } from './CodexSettingsIcon.tsx'
import type { OpenAICodexPluginCardInjected } from './OpenAICodexPluginCard.tsx'
import { OpenAICodexFastModeToggle } from './OpenAICodexFastModeToggle.tsx'
import type { OpenAICodexFastModeToggleInjected } from './OpenAICodexFastModeToggle.tsx'
import { en, zh } from './locales.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'
import { CodexImageToolView } from './CodexImageToolView.tsx'
import type { CodexImageToolViewInjected } from './CodexImageToolView.tsx'
import { OpenAICodexAccountStore } from './account-store.ts'
import { createCodexQuotaService } from './quota-service.ts'
import { OpenAICodexModelsCard } from './OpenAICodexModelsCard.tsx'
import { OpenAICodexConfigForm } from './config-form.ts'
import { CodexUsageCapsule, CodexUsagePanel, CodexUsagePanelStore } from './CodexUsagePanel.tsx'
import type { CodexUsageInjected } from './CodexUsagePanel.tsx'
import { usageStyles, usageDialogStyles } from './usage-styles.ts'
import { managementStyles } from './management-styles.ts'
import { LocalUsageStore } from './usage-warmup.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  /**
   * Declared by the sidebar package at runtime. This plugin depends on that package
   * but its `./client` types do not resolve from the installed copy, so the shape is
   * repeated here until that dependency resolves.
   */
  interface SlotMap {
    /** Frame-wide sidebar footer actions. */
    'sidebar.footer.action': { kind: 'list'; scope: 'root' }
  }

  interface LocaleNamespaceMap {
    /** OpenAI Codex account page copy. */
    'settings.openai-codex': OpenAICodexSettingsKey
  }
}

/** Stable browser-plugin name. */
export const name = 'dsh-codex-connect-client'
/** Client services required by the Plugin configuration contribution. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.session', 'configForms', 'sessions']

export function apply(ctx: ClientContext): void {
  const namespace = 'settings.openai-codex'
  const account = new OpenAICodexAccountStore()
  ctx.effect(() => () => { account.dispose() }, 'dsh-codex-connect: account observation')
  // Cross-plugin quota face: other client plugins read the signed-in account's
  // rolling windows and reset cards through ctx.get('codexQuota').
  const panel = new CodexUsagePanelStore()
  ctx.provide('codexUsagePanel', { open: () => { panel.show() } })
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = usageStyles + usageDialogStyles + managementStyles
    document.head.append(style)
    return () => { style.remove() }
  }, 'dsh-codex-connect: usage styles')
  const quota = createCodexQuotaService(account)
  ctx.provide('codexQuota', quota)
  const localUsage = new LocalUsageStore()
  ctx.effect(() => () => localUsage.dispose(), 'dsh-codex-connect: local usage observation')
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'dsh-codex-connect: settings copy')
  const t = ctx.locale.bind(namespace) as OpenAICodexPluginCardInjected['t']
  const describe = ctx.configForms.describe()
  // A client-plugin reload can race the settings describe read. Retry from the
  // reloaded plugin rather than requiring a full page refresh.
  void describe.ensure()
  const configScope = new OpenAICodexConfigForm(
    ctx.configForms.get<OpenAICodexSettingsConfig>(OPENAI_CODEX_SETTINGS_NAMESPACE),
    describe,
  )
  // A first-class Settings page: the configuration is a peer of General, Models
  // and Agent presets instead of a tab nested under the built-in plugins list.
  ctx.effect(() => ctx.configForms.whileServed([OPENAI_CODEX_SETTINGS_NAMESPACE], () => {
    const disposeSection = ctx.slots.register({
      name: 'settings.section',
      id: 'codex-connect',
      order: 12,
      locale: namespace,
      label: () => t('title'),
      inject: (): OpenAICodexPluginCardInjected => ({
        t, configScope, account, quota, localUsage,
        onOpenUsage: () => { panel.show() },
      }),
    }, OpenAICodexPluginCard)
    const disposeIcon = ctx.slots.register({
      name: 'settings.section.icon',
      id: 'codex-connect',
      label: () => t('title'),
    }, CodexSettingsIcon)
    return () => { disposeIcon(); disposeSection() }
  }), 'dsh-codex-connect: settings page while served')

  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer',
    id: 'dsh-codex-connect-account',
    order: 100,
    inject: () => ({ t, account, configScope }),
  }, OpenAICodexModelsCard))

  const usageInjected = (): CodexUsageInjected => ({ t, account, quota, panel, localUsage })

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'codex-connect-usage',
    order: 11,
    locale: namespace,
    inject: usageInjected,
  }, CodexUsageCapsule))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'codex-connect-usage',
    order: 20,
    locale: namespace,
    inject: usageInjected,
  }, CodexUsagePanel))

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'codex_connect_image_generate',
    locale: namespace,
    inject: (): CodexImageToolViewInjected => ({ sessions: ctx.sessions, configScope }),
  }, CodexImageToolView))

  ctx.inject(['slots', 'modelDirectories'], (scope: ClientContext) => {
    scope.slots.inject('conversation.input.right', () => scope.slots.register({
      name: 'conversation.input.right',
      id: 'openai-codex-fast-mode',
      order: 10,
      locale: namespace,
      inject: (sessionId): OpenAICodexFastModeToggleInjected => ({
        directory: scope.modelDirectories.directoryFor(sessionId).store,
        account,
      }),
    }, OpenAICodexFastModeToggle))
  })
}
