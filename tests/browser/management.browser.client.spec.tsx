/// <reference path="./raw-css.d.ts" />
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { OpenAICodexPluginCard } from '../../src/client/OpenAICodexPluginCard.tsx'
import { managementFixture } from '../management-fixture.ts'
import { en, zh } from '../../src/client/locales.ts'
import { managementStyles } from '../../src/client/management-styles.ts'
import { usageStyles, usageDialogStyles } from '../../src/client/usage-styles.ts'
import { resetPlatformBalance } from '../../src/client/balance.ts'
import baseCss from '../../../../../packages/client/ui-theme/src/styles/base.css?raw'
import themeCss from '../../../../../packages/client/ui-theme/src/styles/design-platform.css?raw'
import { vi } from 'vitest'

let root: Root | undefined
let host: HTMLDivElement | undefined
let style: HTMLStyleElement | undefined
let fixture: ReturnType<typeof managementFixture> | undefined
afterEach(() => { root?.unmount(); fixture?.account.dispose(); resetPlatformBalance(); host?.remove(); style?.remove(); document.body.removeAttribute('data-ds-dark-theme'); document.body.style.cssText = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Codex management on fixed host primitives', () => {
  it.each([['English', en], ['Chinese', zh]] as const)('keeps settings usable at narrow widths in both themes: %s', async (locale, labels) => {
    fixture = managementFixture(labels)
    style = document.createElement('style')
    style.textContent = baseCss + themeCss + usageStyles + usageDialogStyles + managementStyles
    document.head.append(style)
    document.body.style.cssText = 'margin: 0; padding: 16px; box-sizing: border-box; background: var(--dsw-alias-bg-layer-1); font-family: var(--dsw-font-family);'
    host = document.createElement('div')
    host.style.cssText = 'width: 100%; max-width: 1000px; min-width: 0; margin: auto;'
    document.body.append(host)
    root = createRoot(host)
    root.render(<OpenAICodexPluginCard {...fixture.props} />)
    await expect.element(page.getByText('¥42.50', { exact: true })).toBeVisible()
    expect(host.querySelectorAll('.cc-manage-tabs > [role="tab"]')).toHaveLength(5)
    for (const theme of ['light', 'dark']) {
      document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark')
      const ink = getComputedStyle(document.body).getPropertyValue('--dsw-alias-label-primary')
      expect(ink.trim()).not.toBe('')
      for (const width of [1440, 390]) {
        await page.viewport(width, 900)
        await page.getByRole('tab', { name: labels.managementOverview, exact: true }).click()
        await expect.element(page.getByText('12.3k', { exact: true })).toBeVisible()
        for (const module of [labels.managementAccounts, labels.modelsModule, labels.networkModule, labels.capabilitiesModule]) {
          await page.getByRole('tab', { name: module, exact: true }).click()
          await expect.element(page.getByRole('tab', { name: module, exact: true })).toHaveAttribute('aria-selected', 'true')
          if (module === labels.modelsModule) {
            await expect.element(page.getByRole('combobox', { name: labels.managementPreviewAccount })).toBeVisible()
            await page.getByRole('combobox', { name: labels.managementPreviewAccount }).selectOptions(fixture.second)
            await expect.element(page.getByText('Personal model', { exact: true })).toBeVisible()
          }
          const center = host.querySelector('.cc-manage')!
          expect(center.scrollWidth).toBeLessThanOrEqual(center.clientWidth + 1)
          expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width + 1)
          if (theme === 'dark' && width === 390) await page.screenshot({ path: '.tmp/management/' + locale + '-' + module.replaceAll('/', '-') + '-dark-390.png' })
        }
        await page.getByRole('tab', { name: labels.managementOverview, exact: true }).click()
        await page.screenshot({ path: '.tmp/management/' + locale + '-' + theme + '-' + width + '.png' })
      }
    }
    await page.viewport(1100, 900)
    await page.getByRole('tab', { name: labels.modelsModule, exact: true }).click()
    const sol = page.getByRole('checkbox', { name: /GPT-5.6 Sol/u })
    await sol.click()
    await page.getByRole('tab', { name: labels.managementAccounts, exact: true }).click()
    await page.getByRole('tab', { name: labels.modelsModule, exact: true }).click()
    await expect.element(sol).not.toBeChecked()
    expect(fixture.mutate).not.toHaveBeenCalled()
    await page.getByRole('button', { name: labels.save, exact: true }).click()
    await vi.waitFor(() => { expect(fixture?.scope.getSnapshot().value?.models).toEqual(['gpt-5.6-luna']) })
  })
})
