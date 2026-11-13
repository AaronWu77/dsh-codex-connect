# Local feature integration

English | [中文](local-feature-update.zh.md)

## Scope

This private candidate adds local Auto-review checks, requested speed and reasoning defaults, and original-only recovery after image preview persistence fails. It preserves the customized DSH rc.2 integration, PI-AI 1.4.0 request and Host aliases, OAuth source 0.84.4, per-account routes, live model catalog, management UI, and the Sol Off/Minimal restrictions. It is not an upstream release or an instruction to replace the running plugin.

## Local review

Auto-review stays off until enabled with the existing disclosure. Its separate `autoReviewLocalPolicy` defaults to `manual`: remote advice can deny an eligible action, but a remote allow cannot authorize it. Explicit `workspace-read` or `workspace-files` grants only the corresponding ordinary-file operations inside the original workspace. Shell, recursive searches, sensitive configuration or credential paths, ambiguous targets and unsupported execution worlds stay with the Host human chain. The current execution directory cannot enlarge the original scope. See [Auto-review](auto-review.md).

## Requested speed and reasoning

| Setting | Values | Meaning |
|---|---|---|
| `newSessionSpeedMode` | `standard`, `fast`, `ultrafast`, omitted/null | New top-level conversation preference. |
| `newSubagentSpeedMode` | Same | Independent new ordinary-subagent preference. |
| `reasoningEffort` | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, omitted/null | Fallback only when the request has no explicit effort. |

An explicit speed preference wins over the corresponding legacy Fast boolean. Omitted/null speed preferences use that legacy default; null masks an inherited preference. Existing or resumed conversations are not reseeded. A manual Composer command wins over startup intent. Unsupported reasoning levels fail before authentication and network requests; Sol Off and Minimal remain unavailable.

Standard removes the plugin priority/ultrafast hint, Fast requests `priority`, and Ultrafast requests `ultrafast`. Ultrafast is admitted only for exact `gpt-6-astra` or `gpt-6.1-sol` on a registered, signed-in account route. Account entitlement, actual served tier, speed and quota effects remain unknown. A refusal never causes a new plugin downgrade, provider/account switch, or replay; the existing Host retry policy is unchanged.

Conversation choices live only in the current plugin instance. Model/account changes expire an Ultrafast choice until explicit reselection. At bounded capacity, pending or selected Ultrafast intent is retained and conflicting admission fails visibly instead of silently becoming Standard. A plugin or server restart clears conversation choices; profile defaults remain in Host settings. Title and compaction requests do not inherit a paid conversation hint.

## Saved originals without previews

The complete image batch passes signature, size and Host image validation before originals are persisted. If preview storage then fails, a successful version-3 result retains authenticated original downloads, an explicit degraded-preview notice and exact original edit references. It does not generate another image to restore a preview. Native and PTC readers accept the new result while keeping older preview formats readable.

This recovery covers non-cancelled preview persistence failures. A cancelled call remains cancelled under the current Host ABORTED rules and can still remove saved originals; cancellation recovery is not implemented. Process crashes or failure to publish the final result are not claimed recoverable. A missing/invalid original is never promoted to a successful recovery.

## Applying the candidate

Do not copy its dependency view or built libraries into a running process. Review the recorded source diff and use an external maintenance window after a separate application decision. Preserve the six-plugin workspace and existing dependency pins; runtime peers explicitly declare the current DSH fs-local and working-directory services as optional; fs-local already had a development pin, and working-directory adds the matching development declaration. The external fs-local peer keeps the local-execution class check in the Host execution world. Rebuild Host and Client plugin artifacts, then restart the original profile and refresh the existing GUI. Do not reuse the old PI-AI Apply plan for these changes.

Real-account Auto-review, Ultrafast eligibility and real image generation remain separate operator acceptance. Keyless tests, synthetic transport checks and source review do not establish those service outcomes.
