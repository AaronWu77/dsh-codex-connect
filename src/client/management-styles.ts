/** Management uses the quota dialog visual tokens without changing the widget. */
export const managementStyles = `
.cc-account-readiness { display:grid; gap:12px; padding:0; list-style:none; }
.cc-account-readiness li { display:flex; flex-wrap:wrap; gap:8px 12px; align-items:baseline; padding:10px 0; border-bottom:1px solid var(--dsw-alias-border-l2); }
.cc-account-readiness small { flex-basis:100%; color:var(--dsw-alias-label-secondary); }
.cc-manage { color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); border-radius: 14px; min-width: 0; max-width: 100%; }
.cc-manage-heading { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 20px; }
.cc-manage h2 { margin: 0; font-size: 18px; line-height: 26px; font-weight: 500; }
.cc-manage h3, .cc-manage strong { font-weight: 500 !important; }
.cc-manage p { margin: 5px 0 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
.cc-manage-badge { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); border-radius: 999px; color: var(--dsw-alias-label-secondary); padding: 4px 10px; font-size: 12px; line-height: 18px; }
.cc-manage-tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(120px, 100%), 1fr)); gap: 6px; margin: 0 20px; padding: 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-2); }
.cc-manage-tabs button { box-sizing: border-box; min-height: 40px; min-width: 0; padding: 8px 10px; border: 1px solid transparent; border-radius: 9px; font: inherit; font-size: 13px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; overflow-wrap: anywhere; }
.cc-manage-tabs button[aria-selected="true"] { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
.cc-manage-tabs button:focus-visible { outline: 2px solid var(--dsw-alias-button-primary-fill); outline-offset: 2px; }
.cc-manage-body { padding: 20px; min-width: 0; container-type: inline-size; }
.cc-manage-body > div, .cc-manage-editor { min-width: 0; }
.cc-manage-card { border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; padding: 16px; background: var(--dsw-alias-bg-layer-1); min-width: 0; }
.cc-manage-editor > section { padding-top: 16px !important; }
.cc-manage [role="tabpanel"][hidden] { display: none !important; }
.cc-manage-actions { gap: 12px; border-top: 1px solid var(--dsw-alias-border-l2); }
.cc-manage-catalog { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; padding: 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-2); }
.cc-manage-catalog h3 { margin: 0; font-size: 14px; line-height: 20px; }
.cc-manage-catalog label { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 13px; }
.cc-manage-catalog select { box-sizing: border-box; width: min(100%, 340px); min-height: 40px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); padding: 8px; font: inherit; }
.cc-manage-catalog ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 0; margin: 0; list-style: none; }
.cc-manage-catalog li { min-width: 0; padding: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.cc-manage-catalog li > div { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 13px; }
.cc-manage-catalog code { display: block; overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary); font-size: 12px; margin-top: 5px; }
.cc-manage-catalog [role="alert"] { color: var(--dsw-alias-state-error-primary); }
@container (max-width: 560px) { .cc-manage-catalog ul { grid-template-columns: minmax(0, 1fr); } }
`
