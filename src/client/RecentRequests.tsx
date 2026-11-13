/** Recent Codex request summaries inside the sidebar usage dialog. */
import { useId, useSyncExternalStore } from 'react'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import type { RecentRequestKind, RecentRequestView, RecentRequestsStore } from './recent-requests.ts'

interface RecentRequestsProps {
  t: OpenAICodexSettingsInjected['t']
  store: RecentRequestsStore
}

/** @param value - token count. @param locale - display locale. @returns compact token text. */
function formatTokens(value: number, locale: string): string {
  if (value === 0) return '0'
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

/** @param value - byte count. @returns a binary byte label. */
function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MiB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${value} B`
}

/** @param value - epoch milliseconds. @param locale - display locale. @returns local clock time. */
function formatTime(value: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(value)
}

/** Locale keys for the request-purpose tag. */
const KIND_KEYS: Record<RecentRequestKind, 'ov.recent.kind.conversation' | 'ov.recent.kind.title' | 'ov.recent.kind.compaction' | 'ov.recent.kind.subagent' | 'ov.recent.kind.autoReview'> = {
  conversation: 'ov.recent.kind.conversation',
  title: 'ov.recent.kind.title',
  compaction: 'ov.recent.kind.compaction',
  subagent: 'ov.recent.kind.subagent',
  'auto-review': 'ov.recent.kind.autoReview',
}

function Metric({ label, value }: { label: string; value: string }) {
  return <span className="cc-recent-metric">
    <span className="cc-recent-metric-label">{label}</span>
    <span className="cc-recent-metric-value">{value}</span>
  </span>
}

function Row({ request, t, locale }: { request: RecentRequestView; t: RecentRequestsProps['t']; locale: string }) {
  return <article className="cc-recent-row" data-outcome={request.outcome}>
    <div className="cc-recent-lead">
      <span className={`cc-recent-transport cc-recent-transport-${request.transport}`}>
        {t(request.transport === 'ws' ? 'ov.recent.transport.ws' : 'ov.recent.transport.sse')}
      </span>
      <span className="cc-recent-model" title={request.model}>{request.model}</span>
      <span className="cc-recent-kind" data-kind={request.kind}>{t(KIND_KEYS[request.kind])}</span>
      {request.outcome === 'ok' ? null : <span className="cc-recent-outcome" data-outcome={request.outcome}>
        {t(request.outcome === 'error' ? 'ov.recent.outcome.error' : 'ov.recent.outcome.aborted')}
      </span>}
      <time className="cc-recent-time" dateTime={new Date(request.startedAt).toISOString()}>{formatTime(request.startedAt, locale)}</time>
    </div>
    <div className="cc-recent-key">
      <span className="cc-recent-key-label">{t('ov.recent.key')}</span>
      <span className="cc-recent-key-value" title={request.routeLabel}>{request.routeLabel}</span>
    </div>
    <div className="cc-recent-metrics" aria-label={t('ov.recent.metrics')}>
      <Metric label={t('ov.recent.in')} value={formatTokens(request.inputTokens, locale)} />
      <Metric label={t('ov.recent.out')} value={formatTokens(request.outputTokens, locale)} />
      <Metric label={t('ov.recent.cacheW')} value={formatTokens(request.cacheWriteTokens, locale)} />
      <Metric label={t('ov.recent.cacheR')} value={formatTokens(request.cacheReadTokens, locale)} />
    </div>
    <div className="cc-recent-meta">
      <span>{t('ov.recent.reasoning')} <b>{request.reasoning ?? '—'}</b></span>
      <span>{t('ov.recent.body')} <b>{request.bodyBytes === undefined ? '—' : formatBytes(request.bodyBytes)}</b></span>
    </div>
  </article>
}

/**
 * Render the bounded recent-request list, its empty/loading/failure states and the
 * scope note; the Parent dialog owns visibility and refresh cadence.
 */
export function RecentRequests({ t, store }: RecentRequestsProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.snapshot)
  const locale = t('dateLocale')
  const titleId = useId()
  const requests = snapshot.requests
  return <section className="cc-recent" aria-labelledby={titleId}>
    <div className="cc-recent-head">
      <h3 id={titleId} className="cc-recent-title">{t('ov.recent.title')}</h3>
      <span className="cc-recent-limit">{t('ov.recent.limit')}</span>
    </div>
    {snapshot.state === 'loading' && requests.length === 0
      ? <div className="cc-codex-empty" role="status">{t('ov.recent.loading')}</div>
      : null}
    {snapshot.state === 'failed' && requests.length === 0
      ? <div className="cc-codex-empty" role="status">
        <div>{t('ov.recent.failed')}</div>
        <button type="button" className="cc-usage-quota-detail-action" onClick={() => { void store.refresh() }}>{t('ov.recent.retry')}</button>
      </div>
      : null}
    {snapshot.state === 'ready' && requests.length === 0
      ? <div className="cc-codex-empty" role="status">
        <div>{t('ov.recent.empty')}</div>
        <div className="cc-recent-empty-hint">{t('ov.recent.emptyHint')}</div>
      </div>
      : null}
    {snapshot.state === 'failed' && requests.length > 0
      ? <div className="cc-recent-inline-failure" role="status">
        <span>{t('ov.recent.failed')}</span>
        <button type="button" className="cc-usage-quota-detail-action" onClick={() => { void store.refresh() }}>{t('ov.recent.retry')}</button>
      </div>
      : null}
    {requests.length > 0
      ? <div className="cc-recent-list">
        {requests.map(request => <Row key={request.id} request={request} t={t} locale={locale} />)}
      </div>
      : null}
    <p className="cc-recent-note">{t('ov.recent.note')}</p>
  </section>
}
