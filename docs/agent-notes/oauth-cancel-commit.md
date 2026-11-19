# OAuth cancellation and credential commits

Credential modification checks cancellation before waiting and immediately before invoking the mutation callback under the file lock. The callback is pi-ai's commit point: cancellation before invocation prevents mutation; cancellation after invocation waits for the mutation result. Cross-process serialization and atomic replacement remain unchanged.

The same cancellation checks apply to captured-account stores used for request authentication. The wrapper forwards operation options and checks cancellation before calling a refresh callback, without updating its request-local credential on rejection.

The regression combines the installed pi-ai login orchestration with the real credential store and file lock. OAuth returns a synthetic credential while another writer holds the lock. Cancellation returns before the lock is released; the queued mutation then rejects without adding or activating an account. A separate control verifies that cancellation after callback invocation does not report failure for a completed commit.

This change does not extend lock wait limits or change callback-server socket shutdown.
