/** Explicit, session-owned target and ordered reference selection in the existing result card. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpenAICodexSettingsKey } from './locales.ts'
import type { ImagePresentationMeta } from '../image-presentation.ts'
import { decodeImageInventory, IMAGE_INVENTORY_PATH, IMAGE_INPUT_MAX_COUNT } from '../image-input-contract.ts'
import type { ImageInventoryItem, ImageToolRequest } from '../image-input-contract.ts'
import { requestBody } from './request-json.ts'
import { imageRequestFollowUp } from './image-result-presentation.ts'

const field: CSSProperties = { boxSizing: 'border-box', display: 'block', width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 32, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-base)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, font: 'inherit', padding: 6 }
const detail: CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: '18px' }
const button: CSSProperties = { minHeight: 28, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, padding: '3px 10px', background: 'transparent', color: 'var(--dsw-alias-label-primary)', font: 'inherit', cursor: 'pointer' }

/** Render result choices immediately, then merge authenticated history without changing a selection. */
export function CodexImageEditForm({ decoded, sessionId, pending, followUp, onClose, t }: {
  decoded: ImagePresentationMeta
  sessionId: string
  pending: boolean
  followUp: (text: string) => Promise<boolean>
  onClose: () => void
  t: Translate<OpenAICodexSettingsKey>
}) {
  const initial = useMemo<ImageInventoryItem[]>(() => decoded.images.map(image => ({
    input: image.original === undefined ? { attachmentId: String(image.preview.attachmentId), usePreview: true } : { assetId: image.original.assetId },
    source: image.original === undefined ? 'preview' : 'original', name: image.original?.name ?? image.preview.name ?? String(image.preview.attachmentId),
    width: image.original?.width ?? image.preview.width, height: image.original?.height ?? image.preview.height,
  })), [decoded])
  const [inventory, setInventory] = useState<ImageInventoryItem[]>([])
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState(initial.length === 1 ? JSON.stringify(initial[0]!.input) : '')
  const [instructions, setInstructions] = useState('')
  const [references, setReferences] = useState<Array<{ selection: string; purpose: string }>>([])
  const [allowPreview, setAllowPreview] = useState(false)
  const mounted = useRef(true)
  const sending = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setFailed(false)
    void requestBody(IMAGE_INVENTORY_PATH + '?sessionId=' + encodeURIComponent(sessionId), {
      method: 'GET', credentials: 'same-origin', headers: { accept: 'application/json' }, signal: controller.signal,
    }, async response => {
      if (!response.ok) throw new Error('Image inventory unavailable')
      const items = decodeImageInventory(await response.json())
      if (items === undefined) throw new Error('Invalid image inventory')
      return items
    }).then(({ value }) => { if (!controller.signal.aborted) setInventory(value) })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => { controller.abort() }
  }, [sessionId, attempt])
  const choices = useMemo(() => {
    const map = new Map<string, ImageInventoryItem>()
    for (const item of [...initial, ...inventory]) map.set(JSON.stringify(item.input), item)
    return map
  }, [initial, inventory])
  const target = choices.get(selected)
  const refs = references.map(reference => ({ item: choices.get(reference.selection), purpose: reference.purpose.trim() }))
  const preview = [target, ...refs.map(reference => reference.item)].some(item => item?.source === 'preview')
  const ready = target !== undefined && instructions.trim().length > 0 && (!preview || allowPreview)
    && refs.every((ref, index) => ref.item !== undefined && references[index]!.selection !== selected && ref.purpose.length > 0)
  const optionLabel = (item: ImageInventoryItem): string => {
    const id = 'assetId' in item.input ? item.input.assetId : 'attachment' in item.input ? String(item.input.attachment.attachmentId) : item.input.attachmentId
    return t(item.source === 'original' ? 'imageSourceOriginal' : item.source === 'preview' ? 'imageSourcePreview' : 'imageSourceUpload') + ' · ' + item.name + ' · ' + item.width + ' × ' + item.height + ' · ' + id
  }
  async function send(): Promise<void> {
    if (!ready || target === undefined || pending || sending.current) return
    sending.current = true
    try {
      const request: ImageToolRequest = { operation: 'edit', prompt: instructions.trim(), edit: {
        target: target.input, references: refs.map(reference => ({ image: reference.item!.input, purpose: reference.purpose })),
      } }
      const accepted = await followUp(imageRequestFollowUp(request))
      if (accepted && mounted.current) onClose()
    } finally { sending.current = false }
  }
  return <form aria-label={t('editImage')} style={{ display: 'grid', gap: 8, minWidth: 0 }} onSubmit={event => { event.preventDefault(); void send() }}>
    {failed ? <div role="status" style={detail}>{t('imageInventoryFailed')} <button type="button" style={button} onClick={() => { setAttempt(value => value + 1) }}>{t('loadFailed')}</button></div> : null}
    <label style={detail}>{t('editTarget')}
      <select aria-label={t('editTarget')} value={selected} disabled={pending} style={field}
        onChange={event => { setSelected(event.currentTarget.value); setAllowPreview(false) }}>
        <option value="">{t('selectEditTarget')}</option>
        {[...choices].map(([key, item]) => <option key={key} value={key}>{optionLabel(item)}</option>)}
      </select>
    </label>
    {references.map((reference, index) => <div key={index} style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <label style={detail}>{t('imageReference', { index: index + 1 })}
        <select aria-label={t('imageReference', { index: index + 1 })} style={field} value={reference.selection} disabled={pending}
          onChange={event => { const selection = event.currentTarget.value; setReferences(rows => rows.map((row, at) => at === index ? { ...row, selection } : row)); setAllowPreview(false) }}>
          <option value="">{t('selectEditTarget')}</option>
          {[...choices].map(([key, item]) => <option key={key} value={key} disabled={key === selected}>{optionLabel(item)}</option>)}
        </select>
      </label>
      <label style={detail}>{t('imageReferencePurpose')}
        <input aria-label={t('imageReferencePurpose')} style={field} value={reference.purpose} maxLength={512} disabled={pending}
          onChange={event => { const purpose = event.currentTarget.value; setReferences(rows => rows.map((row, at) => at === index ? { ...row, purpose } : row)) }} />
      </label>
      <button type="button" style={button} disabled={pending} onClick={() => { setReferences(rows => rows.filter((_row, at) => at !== index)) }}>{t('removeImageReference')}</button>
    </div>)}
    <button type="button" style={button} disabled={pending || references.length >= IMAGE_INPUT_MAX_COUNT - 1} onClick={() => { setReferences(rows => [...rows, { selection: '', purpose: '' }]) }}>{t('addImageReference')}</button>
    <label style={detail}>{t('editInstructions')}
      <textarea aria-label={t('editInstructions')} value={instructions} maxLength={28_000} rows={3} style={{ ...field, resize: 'vertical' }} disabled={pending} onChange={event => { setInstructions(event.currentTarget.value) }} />
    </label>
    {preview ? <><span role="status" style={detail}>{t('previewEditNotice')}</span><label style={detail}><input type="checkbox" checked={allowPreview} disabled={pending} onChange={event => { setAllowPreview(event.currentTarget.checked) }} />{t('choosePreviewEdit')}</label></> : null}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="submit" style={button} disabled={!ready || pending}>{pending ? t('actionSending') : t('submitImageEdit')}</button>
      <button type="button" style={button} disabled={pending} onClick={onClose}>{t('cancelImageEdit')}</button>
    </div>
  </form>
}
