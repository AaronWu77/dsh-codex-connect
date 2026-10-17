import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { CodexImageEditForm } from '../../src/client/CodexImageEditForm.tsx'
import { en, zh } from '../../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../../src/client/locales.ts'
import type { ImagePresentationMeta } from '../../src/image-presentation.ts'
import baseCss from '../../../../../packages/client/ui-theme/src/styles/base.css?raw'
import themeCss from '../../../../../packages/client/ui-theme/src/styles/design-platform.css?raw'

const original = { assetId: 'img_' + 'a'.repeat(32), mediaType: 'image/png' as const, width: 4096, height: 2048, bytes: 3, name: 'same.png', sha256: 'b'.repeat(64) }
const preview = { attachmentId: AttachmentId('sha256:preview'), mediaType: 'image/png' as const, width: 100, height: 50, bytes: 3, name: 'same.png' }
const upload = { ...preview, attachmentId: AttachmentId('sha256:upload'), originalDimensions: { width: 200, height: 100 } }
const decoded: ImagePresentationMeta = { kind: 'codex-connect-images', schemaVersion: 1, prompt: 'old result', images: [{ original, preview }] }
let root: Root | undefined
let host: HTMLElement | undefined
let style: HTMLStyleElement | undefined
let priorBodyStyle: string | null
let priorTheme: boolean
function mount(labels: typeof en | typeof zh, image = decoded) {
  priorBodyStyle = document.body.getAttribute('style'); priorTheme = document.body.hasAttribute('data-ds-dark-theme')
  host = document.createElement('div'); host.style.padding = '12px'; document.body.append(host)
  style = document.createElement('style'); style.textContent = baseCss + themeCss; document.head.append(style)
  root = createRoot(host)
  const t = (key: OpenAICodexSettingsKey, params: Record<string, unknown> = {}) => {
    let value: string = labels[key]
    for (const [name, replacement] of Object.entries(params)) value = value.replace('{' + name + '}', String(replacement))
    return value
  }
  const followUp = vi.fn(async (_text: string) => true)
  const close = vi.fn()
  root.render(createElement(CodexImageEditForm, { decoded: image, sessionId: 'current-session', pending: false, followUp, onClose: close, t }))
  return { followUp, close }
}
afterEach(() => {
  root?.unmount(); root = undefined; host?.remove(); style?.remove()
  if (priorBodyStyle === null) document.body.removeAttribute('style'); else if (priorBodyStyle !== undefined) document.body.setAttribute('style', priorBodyStyle)
  document.body.toggleAttribute('data-ds-dark-theme', priorTheme ?? false)
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})
describe('explicit image editing in Chromium', () => {
  it.each([['English', en], ['Chinese', zh]] as const)('keeps exact original and uploaded reference selections at desktop/mobile widths: %s', async (_locale, labels) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ version: 1, items: [
      { input: { attachment: upload }, source: 'attachment', name: upload.name, width: upload.width, height: upload.height },
    ] }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const { followUp } = mount(labels)
    const target = page.getByRole('combobox', { name: labels.editTarget })
    await target.findElement()
    await expect.poll(() => target.element().querySelectorAll('option').length).toBe(3)
    expect(fetch.mock.calls).toHaveLength(1)
    await page.getByRole('button', { name: labels.addImageReference }).click()
    await page.getByRole('combobox', { name: labels.imageReference.replace('{index}', '1') }).selectOptions(JSON.stringify({ attachment: upload }))
    await page.getByRole('textbox', { name: labels.imageReferencePurpose }).fill('colors only')
    await page.getByRole('textbox', { name: labels.editInstructions }).fill('change the background')
    for (const theme of ['light', 'dark']) for (const width of [1100, 390]) {
      document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark')
      await page.viewport(width, 900)
      const form = await page.getByRole('form', { name: labels.editImage }).findElement()
      expect(form.getBoundingClientRect().right).toBeLessThanOrEqual(width)
      for (const field of form.querySelectorAll('input, select, textarea')) expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(width)
    }
    await page.getByRole('button', { name: labels.submitImageEdit }).click()
    await expect.poll(() => followUp.mock.calls.length).toBe(1)
    const text = followUp.mock.calls[0]![0]
    expect(text).toContain('"operation":"edit"')
    expect(text).toContain(original.assetId)
    expect(text).toContain('"attachment":' + JSON.stringify(upload))
    expect(text).toContain('"purpose":"colors only"')
  })
  it('does not submit a legacy preview until explicitly selected, and retains the target on inventory failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    const { followUp } = mount(en, { ...decoded, images: [{ preview }] })
    await page.getByRole('textbox', { name: en.editInstructions }).fill('change the hat')
    await page.getByText(en.imageInventoryFailed).findElement()
    expect(page.getByRole('button', { name: en.submitImageEdit }).element()).toHaveProperty('disabled', true)
    expect(followUp).not.toHaveBeenCalled()
    await page.getByRole('checkbox', { name: en.choosePreviewEdit }).click()
    await page.getByRole('button', { name: en.submitImageEdit }).click()
    await expect.poll(() => followUp.mock.calls.length).toBe(1)
    expect(followUp.mock.calls[0]![0]).toContain('"usePreview":true')
  })
})
