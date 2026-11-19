# Public authentication diagnostics

Browser and CLI authentication failures expose only a closed vocabulary of messages. Unknown provider errors and nested causes are not copied into public diagnostics. Numeric usage HTTP statuses remain available without response bodies. This also intentionally removes arbitrary filesystem and provider error detail from these public outputs.

The refresh regression uses the installed pi-ai OAuth implementation and a synthetic malformed response. Separate browser-route and CLI regressions exercise the public sinks. No real credentials or account access are required.
