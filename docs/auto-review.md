# Auto-review

English | [中文](auto-review.zh.md)

Auto-review supplies advice for eligible ordinary file operations; the Host retains approval policy, sandboxing and execution permissions. The feature is off by default. Registered Codex account routes use their own captured account for the complete review request; an unavailable binding never falls back to another account.

## Local authorization

Enable Auto-review through the existing profile disclosure. Separately choose `autoReviewLocalPolicy`: `manual` grants no standing file authority, `workspace-read` permits eligible ordinary file reads, and `workspace-files` also permits bounded ordinary file writes inside the original workspace. A remote allow cannot create this authority. Existing profiles default to manual even when their reviewer was already enabled.

Preflight reads metadata from the agent’s current filesystem and working-directory services, not the Host process directory. It requires a proven host-local execution world, canonical containment in the original workspace, ordinary non-link targets and unambiguous arguments. Sensitive credential, security and agent-configuration files, shell, recursive search and unsupported operations remain human-owned. Windows editor paths must be fully qualified. Final rechecks reduce stale-target risk but cannot eliminate a later filesystem race.

## Decisions and exact retries

- Remote high/critical risk, insufficient or unknown authorization, unavailable metadata, missing credentials, malformed responses and transport failures do not authorize execution.
- A structured deny rejects the action and injects secret-filtered rationale with a no-circumvention instruction. Three consecutive denials, or ten in the latest fifty reviews of a turn, stop that turn.
- A timeout permits one repeat of the exact review, not execution of the action. Cancellation and plugin disposal prevent late decisions; account commands revoke pending retries and cancel in-flight review.
- `/approve <full-denial-id>` must come through the real human command interface and authorize one locally eligible exact retry. The recorded command must finish successfully. The same tool, arguments, provider, effective directory, local scope and target observation must still match. Sensitive or high-risk actions cannot use this override. A mismatch or intervening disabled approval boundary consumes/revokes the grant.
- The command logs a plugin notice, not a synthetic human follow-up. Continue or retry through the normal conversation/tool interface; the command does not launch a model turn itself.

Native tool calls and current PTC start records provide action evidence. Missing, duplicate or mismatched dispatch evidence delegates to a human. Approval and command lifecycle records remain owned by Harness; this integration does not rewrite Session history or add a private required event.

## Disclosure and limits

Review requests send bounded recent conversation text, relevant tool evidence, arguments and the planned action to `chatgpt.com`. Stored credentials are used only for normal authentication; hidden reasoning is not review context. Best-effort redaction is not a complete secret detector. Retained complete human text is evidence, never a local authorization grant.

The input limits are 20,000 UTF-8 bytes for narrative, 10,000 for tool context, 5,000 per narrative entry, 1,000 per tool entry and forty recent non-user entries. Requests include omission and truncation facts. OpenAI does not promise the hidden reviewer OAuth route as a stable public API. Synthetic checks do not establish real-account availability. See the [local integration reference](local-feature-update.md) and [OpenAI Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review).
