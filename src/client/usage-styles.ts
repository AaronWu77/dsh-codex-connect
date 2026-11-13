/** Styles preserving the original sidebar quota widget layout. */
export const usageStyles = `
.cc-usage-entry { display: flex; align-items: center; gap: 8px; width: calc(100% + 4px); height: 42px; box-sizing: border-box; margin: 0 -2px; border: 0; padding: 0 10px 0 8px; overflow: hidden; background: transparent; border-radius: 12px; color: var(--dsw-alias-label-primary); font-family: inherit; font-size: 14px; line-height: 22px; cursor: pointer; }
.cc-usage-entry:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cc-usage-entry-rail { flex: none; justify-content: center; gap: 0; width: 36px; height: 36px; margin: 0; padding: 0; border-radius: 50%; }
.cc-usage-entry-icon { flex: none; }
.cc-usage-entry-label { flex: 1 1 auto; min-width: 0; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-usage-quota { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; }
.cc-usage-quota-multi { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.cc-usage-quota-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); font: inherit; color: inherit; text-align: left; cursor: pointer; transition: border-color 120ms ease, background 120ms ease; }
.cc-usage-quota-cell:hover { border-color: color-mix(in srgb, var(--cc-usage-accent) 45%, var(--dsw-alias-border-l2)); }
.cc-usage-quota-cell:focus-visible { outline: 2px solid color-mix(in srgb, var(--cc-usage-accent) 60%, transparent); outline-offset: 1px; }
.cc-usage-quota-on { border-color: color-mix(in srgb, var(--cc-usage-accent) 65%, transparent); }
.cc-usage-quota-label { display: flex; align-items: center; gap: 4px; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.cc-usage-quota-value { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-usage-quota-sub { color: var(--dsw-alias-label-tertiary); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-usage-quota-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-usage-quota-rank { flex: none; margin-left: auto; padding: 0 5px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-label-secondary) 14%, transparent); color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 15px; font-variant-numeric: tabular-nums; }
.cc-usage-quota-legend { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.cc-usage-quota-legend-item { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.cc-usage-quota-legend-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-usage-quota-legend .cc-usage-quota-rank { margin-left: 0; }
.cc-usage-quota-detail { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 80%, transparent); }
.cc-usage-quota-detail-head { display: flex; align-items: center; gap: 6px; }
.cc-usage-quota-detail-title { font-weight: 600; color: var(--dsw-alias-label-primary); font-size: 12px; }
.cc-usage-quota-detail-close { margin-left: auto; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 13px; line-height: 1; padding: 2px 5px; border-radius: 6px; }
.cc-usage-quota-detail-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cc-usage-quota-detail-row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
.cc-usage-quota-detail-label { color: var(--dsw-alias-label-secondary); }
.cc-usage-quota-detail-value { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
.cc-usage-quota-detail-action { align-self: flex-start; margin-top: 2px; border: 1px solid color-mix(in srgb, var(--cc-usage-accent) 45%, transparent); color: var(--cc-usage-accent); background: color-mix(in srgb, var(--cc-usage-accent) 10%, transparent); border-radius: 999px; font: inherit; font-size: 11px; padding: 2px 10px; cursor: pointer; }
.cc-usage-quota-detail-action:hover { background: color-mix(in srgb, var(--cc-usage-accent) 18%, transparent); }
.cc-usage-widget { --cc-usage-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--color-blue-500)); display: flex; flex-direction: column; gap: 6px; margin: 2px 0 6px; padding: 8px 9px 9px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l2) 70%, transparent); background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 62%, transparent); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%); box-shadow: var(--dsw-shadow-lv1, 0 2px 10px rgba(0, 0, 0, 0.18)); width: 100%; box-sizing: border-box; min-width: 0; cursor: pointer; transition: background 120ms ease, box-shadow 120ms ease; }
.cc-usage-widget:hover { background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 78%, transparent); box-shadow: var(--dsw-shadow-lv2, 0 4px 16px rgba(0, 0, 0, 0.22)); }
.cc-usage-widget:focus-visible { outline: 2px solid color-mix(in srgb, var(--cc-usage-accent) 60%, transparent); outline-offset: 2px; }
.cc-usage-widget-head { display: flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cc-usage-widget-title { font-weight: 600; }
.cc-usage-widget-more { margin-left: auto; opacity: 0.5; }
.cc-usage-quota-compact { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.cc-usage-quota-account { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; min-width: 0; padding: 5px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, transparent); font: inherit; color: inherit; text-align: left; cursor: pointer; transition: border-color 120ms ease; }
.cc-usage-quota-account:hover { border-color: color-mix(in srgb, var(--cc-usage-accent) 45%, var(--dsw-alias-border-l2)); }
.cc-usage-quota-account-head { display: flex; align-items: center; gap: 4px; min-width: 0; }
.cc-usage-quota-account .cc-usage-quota-rank { margin-left: 0; }
.cc-usage-quota-account-name { font-size: 10px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-usage-quota-account-windows { margin-left: auto; display: flex; align-items: baseline; gap: 10px; flex: none; font-variant-numeric: tabular-nums; }
.cc-usage-quota-window { display: inline-flex; align-items: baseline; gap: 3px; }
.cc-usage-quota-window-label { font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.cc-usage-quota-window-value { font-size: 12px; font-weight: 600; }
.cc-usage-quota-compact .cc-usage-quota-cell { padding: 6px 7px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, transparent); }
.cc-usage-quota-compact .cc-usage-quota-label { font-size: 10px; }
.cc-usage-quota-compact .cc-usage-quota-value { font-size: 13px; }
.cc-usage-quota-compact .cc-usage-quota-sub { font-size: 10px; }
`

/** Dialog layout complements shared modal focus, dismissal and safe-area behavior. */
export const usageDialogStyles = `
.cc-usage-dialog { width: min(940px, calc(100vw - 32px)); max-width: calc(100vw - 32px); }
.cc-usage-dialog-content { overflow-y: auto; max-height: calc(100dvh - 100px); box-sizing: border-box; padding-right: 20px; }
.cc-usage-panel { --cc-usage-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--color-blue-500)); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.cc-usage-status { display: flex; align-items: center; gap: 9px; }
.cc-usage-top { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.4fr); gap: 10px; align-items: start; }
.cc-usage-top-single { grid-template-columns: 1fr; }
.cc-usage-summary { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.cc-usage-summary h3 { margin: 0; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; }
.cc-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.cc-summary-tile { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); font: inherit; color: inherit; text-align: left; cursor: pointer; transition: border-color 120ms ease, background 120ms ease; }
.cc-summary-tile:hover { border-color: color-mix(in srgb, var(--cc-usage-accent) 45%, var(--dsw-alias-border-l2)); }
.cc-summary-tile:focus-visible { outline: 2px solid color-mix(in srgb, var(--cc-usage-accent) 60%, transparent); outline-offset: 1px; }
.cc-summary-label { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cc-summary-value { color: var(--dsw-alias-label-primary); font-size: 18px; font-weight: 650; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-summary-sub { color: var(--dsw-alias-label-tertiary); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 820px) {
  .cc-usage-top { grid-template-columns: 1fr; }
}
.cc-account-summary { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.cc-account-summary-head { display: flex; align-items: baseline; gap: 10px; }
.cc-account-summary-head h3 { margin: 0; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; }
.cc-account-summary-head span { margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.cc-account-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.cc-account-card { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.cc-account-card[data-active="true"] { border-color: color-mix(in srgb, var(--cc-usage-accent) 45%, var(--dsw-alias-border-l2)); }
.cc-account-card-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.cc-account-card-head strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 600; }
.cc-account-badge { flex: none; padding: 0 6px; border-radius: 999px; background: color-mix(in srgb, var(--cc-usage-accent) 12%, transparent); color: var(--cc-usage-accent); font-size: 10px; line-height: 16px; }
.cc-account-error { margin-left: auto; color: var(--dsw-alias-state-error-primary, #d92d20); font-size: 10px; }
.cc-account-windows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.cc-account-window { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cc-account-window-line { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; }
.cc-account-window-label { color: var(--dsw-alias-label-tertiary); }
.cc-account-window-value { color: var(--dsw-alias-label-primary); font-weight: 600; white-space: nowrap; }
.cc-account-window-reset { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.cc-account-window-empty { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.cc-account-meter { height: 4px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-label-secondary) 14%, transparent); }
.cc-account-meter span { display: block; height: 100%; border-radius: inherit; background: var(--cc-usage-accent); }
.cc-account-meter[data-low="true"] span { background: var(--dsw-alias-state-warning-primary, #d97706); }
.cc-account-resets { display: flex; align-items: baseline; gap: 8px; padding-top: 6px; border-top: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cc-account-soonest { margin-left: auto; color: var(--dsw-alias-label-tertiary); }
.cc-account-details { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cc-account-details summary { color: var(--dsw-alias-label-tertiary); cursor: pointer; }
.cc-account-detail-row { display: flex; gap: 8px; padding: 3px 0; }
.cc-account-detail-row span:last-child { margin-left: auto; color: var(--dsw-alias-label-tertiary); }
@media (max-width: 720px) {
  .cc-account-grid { grid-template-columns: 1fr; }
}
.cc-recent { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding-top: 4px; border-top: 1px solid var(--dsw-alias-border-l2); }
.cc-recent-head { display: flex; align-items: baseline; gap: 10px; }
.cc-recent-title { margin: 0; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; }
.cc-recent-limit { margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.cc-recent-list { display: flex; flex-direction: column; gap: 8px; }
.cc-recent-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "lead metrics" "key metrics" "meta meta"; gap: 4px 12px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.cc-recent-row[data-outcome="error"] { border-color: color-mix(in srgb, var(--dsw-alias-status-danger, #dc2626) 35%, var(--dsw-alias-border-l2)); }
.cc-recent-lead { grid-area: lead; display: flex; align-items: center; gap: 8px; min-width: 0; }
.cc-recent-transport { flex: none; padding: 1px 7px; border-radius: 999px; font-size: 10px; line-height: 16px; font-weight: 600; }
.cc-recent-transport-ws { color: var(--cc-usage-accent); background: color-mix(in srgb, var(--cc-usage-accent) 14%, transparent); }
.cc-recent-transport-sse { color: var(--dsw-alias-status-warning, #b45309); background: color-mix(in srgb, var(--dsw-alias-status-warning, #d97706) 16%, transparent); }
.cc-recent-model { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; }
.cc-recent-time { margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 11px; font-variant-numeric: tabular-nums; }
.cc-recent-outcome { flex: none; color: var(--dsw-alias-status-danger, #dc2626); background: color-mix(in srgb, var(--dsw-alias-status-danger, #dc2626) 12%, transparent); border-radius: 999px; padding: 1px 6px; font-size: 10px; line-height: 15px; }
.cc-recent-outcome[data-outcome="aborted"] { color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent); }
.cc-recent-key { grid-area: key; display: flex; align-items: baseline; gap: 6px; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cc-recent-key-label { color: var(--dsw-alias-label-tertiary); }
.cc-recent-key-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-recent-metrics { grid-area: metrics; display: grid; grid-template-columns: repeat(2, minmax(62px, auto)); gap: 2px 12px; align-content: start; }
.cc-recent-metric { display: flex; align-items: baseline; gap: 4px; font-variant-numeric: tabular-nums; }
.cc-recent-metric-label { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.cc-recent-metric-value { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 600; }
.cc-recent-meta { grid-area: meta; display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cc-recent-meta b { color: var(--dsw-alias-label-primary); font-weight: 600; }
.cc-recent-note { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.cc-recent-empty-hint { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.cc-recent-inline-failure { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cc-recent-inline-failure .cc-usage-quota-detail-action { margin-left: auto; }
@media (max-width: 620px) {
  .cc-recent-row { grid-template-columns: minmax(0, 1fr); grid-template-areas: "lead" "key" "metrics" "meta"; }
  .cc-recent-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cc-recent-time { margin-left: 0; }
}
`
