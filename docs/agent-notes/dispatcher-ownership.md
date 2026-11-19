# Host dispatcher preservation

Undici v1 and v2 dispatchers retain separate protocol slots. Initialization preserves an existing host v1 dispatcher without assigning it to the incompatible v2 slot. A separate runtime chunk initializes before provider evaluation. The HTTP helper uses CommonJS loading because Node 26's node:http ESM facade initializes built-in Undici during module linking, before preservation code can execute.

During proxy ownership, unrelated v1 requests use their original dispatcher; scoped requests use Undici's v1 bridge. Unrelated v2 requests use their original v2 dispatcher. Reacquisition captures third-party replacements in a new immutable wrapper, so third-party wrappers retaining an older dispatcher do not form cycles. Final disposal restores only objects still owned by the plugin and preserves independent v1 and v2 replacements.

Fresh-process checks cover custom legacy dispatchers and environment proxies. Node 22 and 24 native fetch consumes v1; Node 26 native fetch consumes v2, so the legacy protocol is also exercised directly. This change does not add operation deadlines or change proxy drain limits.
