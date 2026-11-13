/** Management page layout, account rows, and the shared diagnostic surfaces. */
export const managementStyles = `
.cc-account-readiness { display: grid; gap: 12px; padding: 0; list-style: none; }
.cc-account-readiness li { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: baseline; padding: 10px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.cc-account-readiness small { flex-basis: 100%; color: var(--dsw-alias-label-secondary); }

/* Page shell: no outer card; the host settings page provides the frame and width. */
.cc-page { color: var(--dsw-alias-label-primary); min-width: 0; width: 100%; box-sizing: border-box; }
.cc-page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 16px; padding: 0 0 14px; }
.cc-page-account { display: flex; align-items: center; min-width: 0; gap: 10px; flex: 1 1 240px; }
.cc-page-avatar { display: grid; place-items: center; flex: 0 0 auto; width: 36px; height: 36px; border-radius: 50%; background: var(--dsw-alias-bg-layer-2); font-size: 14px; font-weight: 500; }
.cc-page-account-copy { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.cc-page-account-title { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; }
.cc-page-account-title strong { font-size: 15px; line-height: 22px; font-weight: 500; }
.cc-page-account-status { display: inline-flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.cc-page-account-meta { overflow: hidden; max-width: 100%; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.cc-page-action { box-sizing: border-box; min-height: 32px; padding: 5px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.cc-page-action:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cc-page-action:focus-visible { outline: 2px solid var(--dsw-alias-button-primary-fill); outline-offset: 2px; }

/* Horizontal module tabs leave the full content width to the host frame. */
.cc-tabs { position: sticky; top: 0; z-index: 2; display: flex; gap: 2px; overflow-x: auto; border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); scrollbar-width: none; }
.cc-tabs::-webkit-scrollbar { display: none; }
.cc-tab { position: relative; display: inline-flex; flex: 0 0 auto; align-items: center; gap: 6px; padding: 8px 11px 9px; border: 0; border-radius: 6px 6px 0 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; line-height: 20px; white-space: nowrap; cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.cc-tab:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cc-tab[aria-selected="true"] { color: var(--dsw-alias-label-primary); font-weight: 500; }
.cc-tab[aria-selected="true"]::after { content: ""; position: absolute; right: 10px; bottom: 0; left: 10px; height: 2px; border-radius: 2px 2px 0 0; background: var(--dsw-alias-label-primary); }
.cc-tab:focus-visible { outline: 2px solid var(--dsw-alias-button-primary-fill); outline-offset: -2px; }
.cc-tab-count { min-width: 18px; padding: 0 5px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 11px; font-weight: 400; line-height: 18px; text-align: center; font-variant-numeric: tabular-nums; }

/* Content pane. */
.cc-content { min-width: 0; padding-top: 20px; }
.cc-content-header { margin: 0 0 20px; }
.cc-content-title { margin: 0; color: var(--dsw-alias-label-primary); font-size: 18px; line-height: 26px; font-weight: 500; }
.cc-content-subtitle { max-width: 72ch; margin: 4px 0 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.cc-content-config { min-width: 0; }
.cc-page [role="tabpanel"][hidden] { display: none !important; }

/* Account tab. */
.cc-account-panel { display: flex; flex-direction: column; gap: 16px; }
.cc-account-panel-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.cc-account-panel-head h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 14px; line-height: 20px; font-weight: 500; }
.cc-account-count { min-width: 20px; padding: 0 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 18px; text-align: center; }
.cc-primary-button { box-sizing: border-box; min-height: 34px; padding: 6px 14px; border: 1px solid var(--dsw-alias-button-primary-fill); border-radius: 8px; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); font: inherit; font-size: 13px; cursor: pointer; }
.cc-primary-button:disabled { opacity: 0.55; cursor: default; }
.cc-account-list { margin: 0; padding: 0; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); list-style: none; }
.cc-account-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 12px 14px; border-top: 1px solid var(--dsw-alias-border-l2); }
.cc-account-row:first-child { border-top: 0; }
.cc-account-row[data-active="true"] { background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 55%, transparent); }
.cc-account-row-avatar { display: grid; place-items: center; flex: 0 0 auto; width: 36px; height: 36px; border-radius: 50%; background: var(--dsw-alias-bg-layer-2); font-size: 13px; font-weight: 500; }
.cc-account-row-copy { display: flex; flex-direction: column; min-width: 0; gap: 2px; flex: 1 1 180px; }
.cc-account-row-copy strong { overflow: hidden; font-size: 13px; line-height: 20px; font-weight: 500; text-overflow: ellipsis; }
.cc-account-row-copy span { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.cc-account-row-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; flex: 0 0 auto; margin-left: auto; }
.cc-account-badge { padding: 0 8px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 20px; }
.cc-row-button { box-sizing: border-box; min-height: 30px; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.cc-row-button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cc-row-button:disabled { opacity: 0.5; cursor: default; }
.cc-row-button-danger { color: var(--dsw-alias-state-error-primary); }
.cc-account-footer { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-2); }
.cc-account-footer p { max-width: 60ch; margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.cc-account-auth { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; }
.cc-account-auth p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.cc-account-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-2); }
.cc-account-empty h3 { margin: 0; font-size: 14px; font-weight: 500; }
.cc-account-empty p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.cc-account-remove { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 10px; }
.cc-account-remove strong { font-size: 13px; font-weight: 500; }
.cc-account-remove p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.cc-account-remove-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* Shared diagnostics and configuration surfaces. */
.cc-manage-card { min-width: 0; padding: 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); }
.cc-manage-card h3, .cc-manage-card strong { font-weight: 500; }
.cc-manage-card p { margin: 5px 0 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
.cc-manage-diagnostics { margin-top: 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.cc-manage-diagnostics summary { padding: 11px 14px; color: var(--dsw-alias-label-primary); font-size: 13px; cursor: pointer; }
.cc-manage-diagnostics[open] summary { border-bottom: 1px solid var(--dsw-alias-border-l2); }
.cc-manage-diagnostics > .cc-manage-card { border: 0; border-radius: 0; background: transparent; }
.cc-manage-actions { gap: 12px; border-top: 1px solid var(--dsw-alias-border-l2); }
.cc-manage-catalog { display: flex; flex-direction: column; gap: 12px; margin-top: 18px; padding: 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-2); }
.cc-manage-catalog h3 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 500; }
.cc-manage-catalog p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.cc-manage-catalog label { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 13px; }
.cc-manage-catalog select { box-sizing: border-box; width: min(100%, 340px); min-height: 40px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); padding: 8px; font: inherit; }
.cc-manage-catalog ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 0; margin: 0; list-style: none; }
.cc-manage-catalog li { min-width: 0; padding: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.cc-manage-catalog li > div { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 13px; }
.cc-manage-catalog code { display: block; overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary); font-size: 12px; margin-top: 5px; }
.cc-manage-catalog [role="alert"] { color: var(--dsw-alias-state-error-primary); }
@container (max-width: 560px) { .cc-manage-catalog ul { grid-template-columns: minmax(0, 1fr); } }

/* Grouped management overview. */
.cc-codex-overview { display: flex; flex-direction: column; gap: 24px; }
.cc-codex-section { display: flex; flex-direction: column; gap: 10px; }
.cc-codex-section h3 { margin: 0; color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 20px; font-weight: 500; }
.cc-codex-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.cc-codex-card { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 14px 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); }
.cc-codex-card-label { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.cc-codex-card-value { color: var(--dsw-alias-label-primary); font-size: 22px; line-height: 30px; font-weight: 500; font-variant-numeric: tabular-nums; }
.cc-codex-card-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.cc-codex-limits { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
.cc-codex-account { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 14px 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.cc-codex-account[data-active="true"] { background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 55%, var(--dsw-alias-bg-layer-1)); }
.cc-codex-account-head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; font-size: 14px; line-height: 20px; }
.cc-codex-badge { padding: 0 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 18px; }
.cc-codex-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; }
.cc-codex-windows { display: flex; flex-direction: column; }
.cc-codex-window { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; align-items: baseline; gap: 4px 12px; padding: 8px 0; border-top: 1px solid var(--dsw-alias-border-l2); font-size: 13px; line-height: 20px; }
.cc-codex-window:first-child { border-top: 0; }
.cc-codex-window-label { color: var(--dsw-alias-label-secondary); }
.cc-codex-window-value { color: var(--dsw-alias-label-primary); font-weight: 500; font-variant-numeric: tabular-nums; }
.cc-codex-window-reset { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; text-align: right; }
.cc-codex-meter { grid-column: 1 / -1; height: 3px; overflow: hidden; border-radius: 999px; background: var(--dsw-alias-border-l2); }
.cc-codex-meter > span { display: block; height: 100%; border-radius: inherit; background: var(--dsw-alias-state-success-primary, var(--dsw-alias-button-primary-fill)); }
.cc-codex-meter[data-low="true"] > span { background: var(--dsw-alias-state-error-primary); }
.cc-codex-empty { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }

/* Kept for the standalone account surface and its direct component tests. */
.cc-settings-layout { grid-template-columns: minmax(176px, 220px) minmax(0, 1fr); }
.cc-settings-main { min-width: 0; width: 100%; box-sizing: border-box; }

@media (max-width: 720px) {
  .cc-page-header { padding-bottom: 12px; }
  .cc-page-action { min-height: 30px; }
  .cc-tab { padding-inline: 9px; }
  .cc-content { padding-top: 16px; }
  .cc-content-title { font-size: 17px; line-height: 24px; }
  .cc-codex-summary { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .cc-codex-limits { grid-template-columns: minmax(0, 1fr); }
  .cc-settings-layout { grid-template-columns: minmax(0, 1fr); }
  .cc-settings-nav [role="tablist"] { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
}
@media (max-width: 560px) {
  .cc-page-avatar { width: 34px; height: 34px; font-size: 13px; }
  .cc-page-account-title strong { font-size: 14px; line-height: 22px; }
  .cc-account-row-actions { flex-basis: 100%; margin-left: 46px; }
  .cc-codex-window { grid-template-columns: 58px minmax(0, 1fr) auto; gap: 4px 8px; }
}
`