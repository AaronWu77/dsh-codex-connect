# rc.2 candidate validation / rc.2 候选验证

## Scope / 范围

2026-10-17, Windows, Node `24.20.0`. Local Codex Connect `0.1.0-alpha.4.35` targets candidate DSH `0.2.1-rc.2` at Host commit `687f282`. Request and OAuth PI remain exactly `0.87.1`; only the Host event-stream alias changes from `1.0.2` to `1.1.0`. The candidate WebRuntime now exposes an explicit search-route getter/setter used by Codex Connect. This modified checkout does **not** declare alpha.2 compatibility. Historical published entries in [verified-compatibility.json](../verified-compatibility.json) remain historical, not qualification of these modified bytes.

本轮验证涉及隔离候选 Host 与 Codex Connect 目录；未修改活动 Host、其他插件、真实账号、profile 或服务；未自行 install、commit、push、启动 DSH server。Codex 完整 Vitest 已执行；真实 provider/SSH、浏览器/profile 与原生验收仍未执行。Context 与 Codex Connect 的 owning lockfiles 已分别从 clean resolution state 生成，并通过 frozen install 与 peer 检查；候选插件 root 组合 lockfile 也已冻结验证。基线测试使用过系统临时 fixture（由测试清理），后续测试的 `TEMP`/`TMP` 均设为本插件 `.local/rc2-validation-tmp`，离线 built CLI 的 `DSH_HOME` 也在此目录内。代理/usage 测试只使用测试自建并清理的回环 socket，不接入活动服务。

## Changes / 修改

- DSH peer/dev declarations target only rc.2; exact Host PI alias is `1.1.0`, request PI remains `0.87.1`. Explicit test-only `@testing-library/dom` supplies React Testing Library’s required peer.
- Adapter discovery reads each route’s cached provider metadata without capturing an account, refreshing OAuth or sending inference. Request preparation and streaming retain existing account binding, credential checks and withdrawn-model rejection. Host rc.2 generic discovery now resolves API keys, so delegating discovery to it would change this plugin’s behavior.
- Forwarded stream iterators wait for producer/result settlement after the terminal event, so late result failures reach iterator and result consumers. Existing stream/streamSimple normalization, options, cancellation and deferred-fetch behavior stay covered.
- Config form uses rc.2 mirror errors and omits removed `mode`; browser/DOM fixtures supply rc.2 access hooks. Vitest inlines linked Host UI primitives by their real paths and deduplicates React/ReactDOM, without mocking the Modal or weakening assertions. The built management test now reads the standard [client.js](../lib/client.js) artifact rather than an absent historical temporary build.
- Compatibility JSON, doctor and capability diagnostics include the exact Host alias. Strict gates reject alias drift; install/matrix helpers follow the declared Host target. Matching metadata is not live capability evidence. README/INSTALL/design pairing explanations are updated in both README languages.
- The candidate `WebRuntime` owns the explicit search-route getter/setter used by Codex Connect; the plugin restores the prior route and does not depend on the removed `searchProviderId` field.

请求引擎、权限策略、默认自动审批、Fast Mode 默认值、代理不直连回退、多账号捕获、目录 TTL、usage 生产/消费职责均未升级或放宽。未更新测试 expected/snapshot 内容来掩盖失败。

## Executed checks / 已执行检查

All Vitest commands below used `--maxWorkers=1`. Job ids identify this delegated session’s collected command results. The rows below combine focused checks with the final full Codex suite; none establishes real Loader/profile, browser, provider or SSH acceptance.

| Check | Command (test files listed below) | Job / result |
|---|---|---|
| Strict Host + Client types | `pnpm run typecheck` | final `366`: exit 0 |
| Full Codex suite | `pnpm run test` | final `367`: 109 files, 1029 passed / 5 skipped |
| Bridge, adapter, transport, form and alias gate | `pnpm exec vitest run <bridge group> --maxWorkers=1` | `180`: 6 files, 83 passed |
| Accounts, model catalog, proxy, usage and cancellation | `pnpm exec vitest run <account group> --maxWorkers=1` | `193`: 18 files, 144 passed |
| Compatibility, doctor and offline CLI | `pnpm exec vitest run <diagnostic group> --maxWorkers=1` | `194`: 88 passed / 1 fixture failure; `197`: doctor 7/7 passed after fixture completion; all 89 distinct checks passed |
| DOM account/quota/management | `pnpm exec vitest run <DOM group> --maxWorkers=1` | `202`: 68 passed / 1 React-resolution failure / 1 absent-artifact skip; `207`: usage panel 4/4 passed after resolver fix; `210`: current built management 1/1 passed, no skip |
| Plugin Host/Client + declarations | `pnpm run build` | final `368`: exit 0; existing CJS-format recommendation only |
| Metadata + typed source lint | `pnpm run lint` | final `382`: exit 0 |
| Exact installed dependency pairing | `pnpm --silent run check:compatibility` | `204`: exit 0, rc.2 / request 0.87.1 / Host alias 1.1.0 |
| Workflow/install-checker unit contracts | `pnpm run check:canary-workflow` | `205`: exit 0, 60 workflow + 62 checker assertions; mocked canary results, **no install/matrix execution** |
| Built offline diagnostics | `node lib/bin.js doctor --json`; `node lib/bin.js capabilities --model gpt-5.6-sol --json` | `211`: doctor exit 0; signed-out capabilities exit 1 as expected, runtime metadata supported, OAuth rejected, inference unknown, probe not requested |
| Package contents, no lifecycle scripts | `pnpm run pack:check` | `217`: exit 0 (60 files); final `225`: exit 0 (61 files, including this report); npm cache confined locally |

Bridge group: [pi-host-bridge.spec.ts](../tests/pi-host-bridge.spec.ts), [adapter.spec.ts](../tests/adapter.spec.ts), [adapter-auth-boundary.spec.ts](../tests/adapter-auth-boundary.spec.ts), [transport.spec.ts](../tests/transport.spec.ts), [host-pi-gate.spec.ts](../tests/host-pi-gate.spec.ts), [config-form.client.spec.ts](../tests/config-form.client.spec.ts).

Account group: [account-profile.spec.ts](../tests/account-profile.spec.ts), [account-routes.spec.ts](../tests/account-routes.spec.ts), [multi-account-routes.spec.ts](../tests/multi-account-routes.spec.ts), [request-account.spec.ts](../tests/request-account.spec.ts), [store.spec.ts](../tests/store.spec.ts), [model-catalog.spec.ts](../tests/model-catalog.spec.ts), [model-contract.spec.ts](../tests/model-contract.spec.ts), [provider-proxy.spec.ts](../tests/provider-proxy.spec.ts), [provider-proxy-classification.spec.ts](../tests/provider-proxy-classification.spec.ts), [proxy-routes.spec.ts](../tests/proxy-routes.spec.ts), [proxy-shutdown.spec.ts](../tests/proxy-shutdown.spec.ts), [usage.spec.ts](../tests/usage.spec.ts), [usage-response-lifecycle.spec.ts](../tests/usage-response-lifecycle.spec.ts), [usage-ledger.client.spec.ts](../tests/usage-ledger.client.spec.ts), [usage-warmup.client.spec.ts](../tests/usage-warmup.client.spec.ts), [oauth-cancel-commit.spec.ts](../tests/oauth-cancel-commit.spec.ts), [oauth-provider-cancellation.spec.ts](../tests/oauth-provider-cancellation.spec.ts), [auth-refresh-safety.spec.ts](../tests/auth-refresh-safety.spec.ts).

Diagnostic group: [compatibility.spec.ts](../tests/compatibility.spec.ts), [doctor.spec.ts](../tests/doctor.spec.ts), [capability-diagnostics.spec.ts](../tests/capability-diagnostics.spec.ts), [capability-cli.spec.ts](../tests/capability-cli.spec.ts), [auto-review-cli.spec.ts](../tests/auto-review-cli.spec.ts), [bin.spec.ts](../tests/bin.spec.ts), [install-version-guidance.spec.ts](../tests/install-version-guidance.spec.ts).

DOM group: [account-store.client.spec.tsx](../tests/account-store.client.spec.tsx), [account-model-catalog.client.spec.tsx](../tests/account-model-catalog.client.spec.tsx), [account-cancel-snapshot.client.spec.tsx](../tests/account-cancel-snapshot.client.spec.tsx), [account-request-timeout.client.spec.tsx](../tests/account-request-timeout.client.spec.tsx), [codex-usage-panel.client.spec.tsx](../tests/codex-usage-panel.client.spec.tsx), [quota-service.client.spec.tsx](../tests/quota-service.client.spec.tsx), [openai-codex-plugin-card.client.spec.tsx](../tests/openai-codex-plugin-card.client.spec.tsx), [management-bundle.client.spec.tsx](../tests/management-bundle.client.spec.tsx).

## Failures and repairs / 失败与修复

- Baseline `174` typecheck failed on PI `1.0.2` versus Host `1.1.0` branded context and changed settings API; `175` had 6 adapter discovery failures (33 passed). The former alias stream tests were not PI1.1 qualification. Exact alias alignment, metadata-only discovery and settings API adaptation resolved these without changing the request engine.
- The final Codex run exposed the removed `searchProviderId` field and stale exact provider-directory assertions. The candidate WebRuntime getter/setter and route-ownership tests now use the rc.2 API; settings assertions retain the core fields and verify rc.2 endpoint/OAuth metadata.

- `179` reached the Client compiler and exposed the missing DOM peer plus obsolete test props. The parent installed the explicitly declared test peer; fixtures now use rc.2 props, and `192`/`219` pass.
- `194` doctor mismatch fixture omitted the newly required Host alias, correctly producing `unknown`. The fixture now supplies the alias; the original `unverified` expectation is unchanged, and `197` passes.
- `202` linked Host Modal loaded a second React copy. Resolver deduplication and real-path inlining fixed `207`; original UI snapshots/assertions pass unchanged. The skipped historical artifact path was replaced by the current build path, and `210` passes the module handoff/disposal check.

## Remaining acceptance / 未验证事项

No real OAuth login/refresh, inference, model entitlement, image endpoint, Auto-review provider call, real browser, active GUI/profile, SSH, restart/fork continuation or live Context/Codex parity acceptance was performed. Mock account/proxy/usage checks and built jsdom handoff do not establish these. Optional capabilities remain off by default. Fresh install and isolated DSH matrix scripts were not run because they install packages and create profiles; their static/checker validation is not a matrix pass. Candidate-root frozen install passed; final artifact manifest and remaining runtime acceptance are separate evidence.

未把 rc.2 添加到历史“已验证发布配对”清单，也不声称此候选与 alpha.2 双版本兼容；真实授权、推理及浏览器/profile 验收需要后续单独授权与证据。
