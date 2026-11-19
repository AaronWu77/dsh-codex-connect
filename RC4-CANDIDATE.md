# Codex Connect RC4 candidate from GitHub main

Private candidate **0.1.0-alpha.4.35.rc4.3** from GitHub main [21f7b37f06f1913fd0311fbcf9d843c758c8486f](https://github.com/AaronWu77/dsh-codex-connect/commit/21f7b37f06f1913fd0311fbcf9d843c758c8486f), verified at clone. This is the single commit after [c6c7042](https://github.com/AaronWu77/dsh-codex-connect/commit/c6c704258dd44858f17439e475c656d6670bde4a), the reviewed **rc4.2** baseline. That separate clone and archive were left unchanged. The candidate uses the same locked published peers, not the prior package or the modified lab Host.

## What changed

- Uses published DSH 0.2.2-rc.4 packages, Cordis 4.1.0, Loader and Include 1.1.0, Schemastery 3.19.0, and React 18.3.1. Zod 4.6.6 matches the published Session Projection ABI, and Undici 8.11.2 matches the published RC4 proxy package. Request PI and the plugin’s Host event-stream alias are exact published PI 1.4.0; vendored OAuth code is unchanged. No credential or profile migration was added or performed.
- **Search:** enabling the switch registers *OpenAI Codex* in **Settings → Web search and fetch**; disabling or disposing unregisters it. Codex Connect does not write Web settings or choose a default model. If Codex is explicitly selected, select a different available provider (or the Host’s automatic selection where applicable) before disabling it; otherwise the Host reports that the explicitly configured provider is missing. The fork-only route override and restore logic are deliberately removed.
- **Client:** uses the RC4 Menu’s button `anchorRef` and the published sidebar slot augmentation. Keeps GitHub main’s continuation badge, approximate delta bytes, and first-divergence display.
- **Now upstream:** numerical override validation and retired-model null resets; advertised GPT-6.2 Astra/Sol metadata inheritance; `transport: auto` rejection with a positive resident budget; request-owned WebSocket leases, deferred close, and per-request transport/continuation diagnostics. The same changes from rc4.2 are not layered twice. PI resends the full request after a speed-tier change; old restart tracking was unused and upstream removed it.
- **New in main:** the process-local usage summary counts active model requests and accumulates successful input/cache token totals; the same-origin recent-request route and sidebar show the summary alongside the five recent requests. This release takes the new server/client implementation unchanged.
- **Merge resolutions:** recomputed bilingual README/reference blob hashes from the merged docs; kept main’s `withAuxiliaryPurpose` WebSocket test helper plus the RC4 type-only purpose imports. Main’s adapter, residency registry, and lifecycle/usage changes are intact.
- **Build differences vs. the prior snapshot:** published packages and an npm lock replace the prior Host-junction script and reduced browser typecheck config. The upstream pnpm lock, installation history and release workflow are preserved but are not the RC4 build or acceptance path.

## Rebuild and validate

From the new clone, using Node 24.20.0 and npm 11.19.0:

```powershell
. ./scripts/rc4-env.ps1
npm ci --registry=https://registry.npmjs.org/ --ignore-scripts --no-fund --no-audit
./scripts/validate-rc4.ps1
New-Item -ItemType Directory -Force artifacts | Out-Null
npm pack --ignore-scripts --offline --pack-destination artifacts
```

Tests use candidate-local homes and temp directories, synthetic accounts/replies, and a Node preload that blocks non-loopback DNS and TCP for the test process. Settings/Loader composition checks that enabling and disabling does not rewrite the Web selection. Fixtures cover model streaming and WebSocket lifecycle on loopback, usage projection, and the speed menu in jsdom. Built checks cover dispatcher ownership, offline diagnostics, and the pack manifest. This is not a standalone DSH runtime: no real OAuth, model or search call, real browser acceptance, running profile activation, or DSH source-only shared-cache integration was performed.
