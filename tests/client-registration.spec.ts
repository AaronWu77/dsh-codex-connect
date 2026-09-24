import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('OpenAI Codex browser contribution', () => {
  it('adds an optional Models footer using the same account owner as Plugins', async () => {
    const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(client).toContain("ctx.slots.inject('settings.models.footer'")
    expect(client).toContain("id: 'dsh-codex-connect-account'")
    // The plugin card injects the SHARED owner set (account included); assert the
    // binding set rather than one line layout, which may wrap.
    expect(client).toMatch(/inject: \(\): OpenAICodexPluginCardInjected => \(\{[\s\S]{0,240}?t, configScope, account,/u)
    expect(client).toContain('inject: () => ({ t, account, configScope })')
    expect(client).toContain('account.dispose()')
    expect(client.match(/new OpenAICodexAccountStore\(\)/g)).toHaveLength(1)
    expect(client).not.toContain("ctx.slots.inject('settings.models.provider-card'")
  })
  it('registers as a Plugins settings tab while the Host serves the namespace', async () => {
    const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(client).toContain('ctx.configForms.whileServed([OPENAI_CODEX_SETTINGS_NAMESPACE]')
    expect(client).toContain("name: 'settings.plugins.tab'")
    expect(client).toContain("id: 'codex-connect'")
    expect(client).toContain("label: () => t('title')")
    expect(client).not.toContain("id: 'openai-codex'")
    expect(client).not.toContain('order: 30')
    expect(client).toContain("const configScope = new OpenAICodexConfigForm(")
    expect(client).toContain('ctx.configForms.get<OpenAICodexSettingsConfig>(OPENAI_CODEX_SETTINGS_NAMESPACE)')
    expect(client).toContain('ctx.configForms.describe()')
    expect(client).toContain('OPENAI_CODEX_SETTINGS_NAMESPACE')
    expect(client).not.toContain("namespace: 'web'")
    expect(client).not.toContain("ctx.slots.inject('settings.plugin.item'")
    expect(client).not.toContain("ctx.slots.inject('settings.section'")
  })

  it('registers Fast Mode in the additive right-side Composer list slot', async () => {
    const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(client).toContain("scope.slots.inject('conversation.input.right'")
    expect(client).toContain("name: 'conversation.input.right'")
    expect(client).toContain("id: 'openai-codex-fast-mode'")
    expect(client).toContain('order: 10')
    expect(client).toContain("ctx.inject(['slots', 'modelDirectories']")
    expect(client).toContain('scope.modelDirectories.directoryFor(sessionId)')
    expect(client).not.toContain("'settingsScope', 'modelDirectories'")
    expect(client).toContain("'@deepseek-ai/dsh-client-ui-conversation/client'")
    expect(client).toContain("'@deepseek-ai/dsh-client-ui-model-selection/client'")
  })

  it('keeps the Composer slot to the single Fast Mode registration', async () => {
    const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(client.match(/name: 'conversation\.input\.right'/gu)).toHaveLength(1)
    expect(client).not.toContain("id: 'openai-codex-quota'")
  })

  it('keeps the layout client type import that declares the shared renderer props', async () => {
    const [client, manifest] = await Promise.all([
      readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ])
    // The layout client augments GlobalStandardProps (usePanelInfo); dropping the
    // type import breaks the card props that read it.
    expect(client).toContain("'@deepseek-ai/dsh-client-ui-layout/client'")
    const parsed = JSON.parse(manifest) as { dsh: { client: { inject: string[] } } }
    expect(parsed.dsh.client.inject).toContain('@deepseek-ai/dsh-client-ui-layout')
  })

  it('renders a Codex Connect card and uses OpenAI Codex for the Composer provider', async () => {
    const [clientCard, locales, adapter, accountRoutes] = await Promise.all([
      readFile(new URL('../src/client/OpenAICodexPluginCard.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/client/locales.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/adapter.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/account-routes.ts', import.meta.url), 'utf8'),
    ])
    expect(clientCard).toContain('<li style={{ ...cardStyle, background:')
    expect(clientCard).toContain('aria-expanded={open}')
    expect(locales.match(/title: 'Codex Connect'/gu)).toHaveLength(2)
    expect(accountRoutes).toContain("OPENAI_CODEX_PRIMARY_DISPLAY_NAME = 'OpenAI Codex'")
    expect(adapter).toContain('displayName: OPENAI_CODEX_PRIMARY_DISPLAY_NAME')
  })

  it('registers the image-generation result view independently of the generation toggle', async () => {
    const [client, manifest] = await Promise.all([
      readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ])
    expect(client).toContain("ctx.slots.inject('tool.call.toolview'")
    expect(client).toContain("key: 'codex_connect_image_generate'")
    const parsed = JSON.parse(manifest) as { dsh: { client: { inject: string[] } } }
    expect(parsed.dsh.client.inject).not.toContain('@deepseek-ai/dsh-client-ui-slots')
    expect(parsed.dsh.client.inject).not.toContain('@deepseek-ai/dsh-client-ui-attachment')
  })
})
