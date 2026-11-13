/** Revisioned nonpersistent speed selection; no optimistic success or automatic POST replay. */
import { useEffect, useRef, useState } from 'react'
import { Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { OPENAI_CODEX_SPEED_MODE_PATH, readConversationSpeed } from '../speed-mode-contract.ts'
import type { ConversationSpeedState, OpenAICodexSpeedMode } from '../speed-mode-contract.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'
import { requestJson } from './request-json.ts'

type Translate = (key: OpenAICodexSettingsKey) => string
const MODES = ['standard', 'fast', 'ultrafast'] as const
const ACTIVE_COLOR = '#f97316'

/** Render the compact speed menu in the existing Composer control position. */
export function OpenAICodexSpeedControl({ sessionId, provider, model, t, refreshKey = '', available = true }: {
  sessionId: string; provider: string; model: string; t: Translate; refreshKey?: string; available?: boolean
}) {
  const [selection, setSelection] = useState<ConversationSpeedState>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'unconfirmed'>('loading')
  const [readAttempt, setReadAttempt] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const controller = useRef<AbortController | undefined>(undefined)
  const button = useRef<HTMLButtonElement>(null)
  const anchor = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setStatus('loading'); setMenuOpen(false)
    const query = new URLSearchParams({ sessionId, provider, model })
    void requestJson(OPENAI_CODEX_SPEED_MODE_PATH + '?' + query.toString(), {
      method: 'GET', credentials: 'same-origin', headers: { accept: 'application/json' }, signal: abort.signal,
    }).then(({ response, value }) => {
      if (abort.signal.aborted) return
      const next = response.ok ? readConversationSpeed(value, provider, model) : undefined
      setSelection(next); setStatus(next === undefined ? 'unconfirmed' : 'ready')
    }).catch((_error) => { if (!abort.signal.aborted) setStatus('unconfirmed') })
      .finally(() => { if (controller.current === abort) controller.current = undefined })
    return () => { abort.abort(); if (controller.current === abort) controller.current = undefined }
  }, [sessionId, provider, model, refreshKey, readAttempt])
  useEffect(() => () => { controller.current?.abort() }, [])

  const close = (): void => { setMenuOpen(false); setDetailsOpen(false) }
  const select = (mode: OpenAICodexSpeedMode): void => {
    if (status !== 'ready' || selection === undefined || controller.current !== undefined) return
    close(); button.current?.focus()
    const abort = new AbortController(); controller.current = abort; setStatus('loading')
    void requestJson(OPENAI_CODEX_SPEED_MODE_PATH, {
      method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, provider, model, generation: selection.generation, revision: selection.revision, mode }), signal: abort.signal,
    }).then(({ response, value }) => {
      if (abort.signal.aborted) return
      const next = response.ok ? readConversationSpeed(value, provider, model) : undefined
      if (next !== undefined && next.mode === mode && !next.selectionExpired) { setSelection(next); setStatus('ready') }
      else setStatus('unconfirmed')
    }).catch((_error) => { if (!abort.signal.aborted) setStatus('unconfirmed') })
      .finally(() => { if (controller.current === abort) controller.current = undefined })
  }

  const currentMode = status === 'ready' ? selection?.mode : undefined
  const expired = status === 'ready' && selection?.selectionExpired === true
  const active = !expired && (currentMode === 'fast' || currentMode === 'ultrafast')
  const label = status === 'loading' ? t('speedLoading') : status === 'unconfirmed' ? t('speedRecover')
    : expired ? t('speedSelectionExpired') : currentMode === 'ultrafast' ? t('speedMenuUltrafastTitle')
      : currentMode === 'fast' ? t('speedMenuFastTitle') : t('speedMenuStandardTitle')
  const canUltra = available && selection?.modelSupported === true && selection.hasAccount && selection.selectionAvailable

  return <span ref={anchor} style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
    <Menu open={menuOpen && status === 'ready'} onClose={close} portal align="end" side="top" autoFocus compact
      getAnchorRect={() => anchor.current?.getBoundingClientRect() ?? null}
      anchor={<Tooltip label={label} side="top" align="end" portal disabled={menuOpen}>
        <button ref={button} type="button" aria-label={label} aria-busy={status === 'loading'} aria-pressed={active}
          aria-haspopup="menu" aria-expanded={menuOpen} disabled={status === 'loading'}
          data-openai-codex-speed-menu={expired ? 'expired' : currentMode ?? status}
          onClick={() => {
            if (status === 'unconfirmed') { setReadAttempt(attempt => attempt + 1); return }
            if (menuOpen) close(); else setMenuOpen(true)
          }}
          onKeyDown={event => { if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && status === 'ready') { event.preventDefault(); setMenuOpen(true) } }}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30,
            padding: 0, border: 0, borderRadius: 8, background: 'transparent', color: active || expired ? ACTIVE_COLOR : 'var(--dsw-alias-label-secondary)',
            cursor: status === 'loading' ? 'default' : 'pointer', opacity: status === 'loading' ? 0.6 : 1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M13.1 2.75 5.35 13.1h5.8l-.95 8.15 8.45-11.2h-5.9l.35-7.3Z" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          {expired ? <span aria-hidden="true">!</span> : null}
        </button>
      </Tooltip>}>
      {expired ? <p role="alert" style={{ maxWidth: 240, whiteSpace: 'normal', margin: '4px 8px', fontSize: 12 }}>{t('speedSelectionExpired')}</p> : null}
      {MODES.map(mode => <button key={mode} type="button" role="menuitemradio" aria-checked={!expired && selection?.mode === mode}
        data-speed-mode={mode} disabled={mode === 'ultrafast' && !canUltra} onClick={() => { select(mode) }}
        onKeyDown={event => {
          if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); close(); button.current?.focus() }
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(mode) }
        }}
        style={{ display: 'flex', gap: 8, width: '100%', padding: '6px 8px', border: 0, borderRadius: 6, background: 'transparent',
          color: !expired && selection?.mode === mode ? ACTIVE_COLOR : 'inherit', fontSize: 12, textAlign: 'left' }}>
        <span aria-hidden="true" style={{ width: 14 }}>{!expired && selection?.mode === mode ? '✓' : ''}</span>
        {t(mode === 'standard' ? 'speedStandard' : mode === 'fast' ? 'speedFast' : 'speedUltrafast')}
      </button>)}
      {!canUltra ? <p style={{ maxWidth: 240, whiteSpace: 'normal', margin: '4px 8px', fontSize: 12 }}>{t('ultrafastUnavailable')}</p> : null}
      <button type="button" role="menuitem" aria-expanded={detailsOpen} onClick={() => { setDetailsOpen(open => !open) }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetailsOpen(open => !open) } }}
        style={{ display: 'block', border: 0, background: 'transparent', color: 'inherit', padding: '6px 8px', fontSize: 12 }}>{t('speedDetails')}</button>
      {detailsOpen ? <p style={{ maxWidth: 240, whiteSpace: 'normal', margin: '4px 8px', fontSize: 12, lineHeight: '18px' }}>{t('ultrafastDisclosure')}</p> : null}
    </Menu>
    <span role="status" data-openai-codex-speed-status={status} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>{label}</span>
  </span>
}
