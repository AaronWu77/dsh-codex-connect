/** Management page layout, account rows, and the shared diagnostic surfaces. */
export const managementStyles = `
/* The account list names every account and shows its limits; this list carries problems only. */
.cc-account-readiness { display: grid; gap: 10px; padding: 0; list-style: none; }
.cc-account-readiness li { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.cc-account-readiness li:last-child { border-bottom: 0; padding-bottom: 0; }
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

/* Tabs stay in the page flow: the host settings page owns the only sticky header. */
.cc-tabs { display: flex; gap: 2px; overflow-x: auto; border-bottom: 1px solid var(--dsw-alias-border-l2); scrollbar-width: none; }
.cc-tabs::-webkit-scrollbar { display: none; }
.cc-tab { position: relative; display: inline-flex; flex: 0 0 auto; align-items: center; gap: 6px; padding: 8px 11px 9px; border: 0; border-radius: 6px 6px 0 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; line-height: 20px; white-space: nowrap; cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.cc-tab:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cc-tab[aria-selected="true"] { color: var(--dsw-alias-label-primary); font-weight: 500; }
.cc-tab[aria-selected="true"]::after { content: ""; position: absolute; right: 10px; bottom: 0; left: 10px; height: 2px; border-radius: 2px 2px 0 0; background: var(--dsw-alias-label-primary); }
.cc-tab:focus-visible { outline: 2px solid var(--dsw-alias-button-primary-fill); outline-offset: -2px; }
/* Counts read as data, not as status pills. */
.cc-tab-count, .cc-account-count { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 18px; font-variant-numeric: tabular-nums; }

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
.cc-account-panel-head h3 { display: flex; align-items: baseline; gap: 8px; margin: 0; font-size: 14px; line-height: 20px; font-weight: 500; }
.cc-primary-button { box-sizing: border-box; min-height: 34px; padding: 6px 14px; border: 1px solid var(--dsw-alias-button-primary-fill); border-radius: 8px; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); font: inherit; font-size: 13px; cursor: pointer; }
.cc-account-list { margin: 0; padding: 0; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); list-style: none; }
.cc-account-row { position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 12px 14px; border-top: 1px solid var(--dsw-alias-border-l2); }
.cc-account-row:first-child { border-top: 0; }
/* The active account is marked once, with an accent rule instead of a competing fill. */
.cc-account-row[data-active="true"] { background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 40%, transparent); box-shadow: inset 3px 0 0 var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-alias-label-primary)); }
.cc-account-row-avatar { display: grid; place-items: center; flex: 0 0 auto; width: 36px; height: 36px; border-radius: 50%; background: var(--dsw-alias-bg-layer-2); font-size: 13px; font-weight: 500; }
.cc-account-row-copy { display: flex; flex-direction: column; min-width: 0; gap: 2px; flex: 1 1 180px; }
.cc-account-row-copy strong { overflow: hidden; font-size: 13px; line-height: 20px; font-weight: 500; text-overflow: ellipsis; }
.cc-account-row-copy span { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.cc-account-row-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; flex: 0 0 auto; margin-left: auto; }
/* Status uses one accented chip; the destructive row action stays quiet until hover. */
.cc-account-badge { padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-alias-label-primary)) 14%, transparent); color: var(--dsw-alias-label-primary); font-size: 11px; line-height: 20px; }
.cc-row-button { box-sizing: border-box; min-height: 30px; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.cc-row-button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cc-row-button-danger { color: var(--dsw-alias-label-secondary); }
.cc-row-button-danger:hover { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l2)); }
/* Disabled controls keep readable text instead of fading the whole button. */
.cc-primary-button:disabled, .cc-row-button:disabled, .cc-page-action:disabled { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-dimmed); cursor: default; }
.cc-account-footer { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); }
.cc-account-footer p { max-width: 60ch; margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
/* Quota sits inside its account row: spacing separates it, not a second rule. */
.cc-account-quota { flex: 1 1 100%; margin-top: 4px; }
.cc-account-auth { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; }
.cc-account-auth p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.cc-account-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-2); }
.cc-account-empty h3 { margin: 0; font-size: 14px; font-weight: 500; }
.cc-account-empty p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
/* A confirmation surface, not an alarm: tinted ground, neutral border, red heading. */
.cc-account-remove { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 6%, transparent); }
.cc-account-remove strong { color: var(--dsw-alias-state-error-primary); font-size: 13px; font-weight: 500; }
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

/* Per-account Codex windows: one visual system for remaining allowance. */
.cc-codex-windows { display: flex; flex-direction: column; }
.cc-codex-window { display: grid; grid-template-columns: minmax(56px, max-content) minmax(0, 1fr) auto; align-items: baseline; gap: 4px 12px; padding: 7px 0; border-top: 1px solid var(--dsw-alias-border-l2); font-size: 13px; line-height: 20px; }
.cc-codex-window:first-child { border-top: 0; padding-top: 0; }
.cc-codex-window-label { color: var(--dsw-alias-label-secondary); }
.cc-codex-window-value { color: var(--dsw-alias-label-primary); font-weight: 500; font-variant-numeric: tabular-nums; }
.cc-codex-window-reset { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; text-align: right; }
/* Two tiers only: remaining allowance, or a critical remainder. */
.cc-codex-meter { grid-column: 1 / -1; height: 6px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
.cc-codex-meter > span { display: block; height: 100%; border-radius: inherit; background: var(--dsw-alias-state-success-primary); }
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
  .cc-settings-layout { grid-template-columns: minmax(0, 1fr); }
  .cc-settings-nav [role="tablist"] { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
}
@media (max-width: 560px) {
  .cc-page-avatar { width: 34px; height: 34px; font-size: 13px; }
  .cc-page-account-title strong { font-size: 14px; line-height: 22px; }
  .cc-account-row-actions { flex-basis: 100%; margin-left: 46px; }
  .cc-codex-window { grid-template-columns: minmax(48px, max-content) minmax(0, 1fr); }
  .cc-codex-window-reset { grid-column: 1 / -1; text-align: left; }
}
`
