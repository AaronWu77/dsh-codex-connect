# Run from the candidate root after installing its published dependencies.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/rc4-env.ps1"
$env:NODE_OPTIONS = '--require="' + (Join-Path $PSScriptRoot 'rc4-loopback-only.cjs').Replace([char]92,[char]47) + '"'
$env:NO_COLOR = '1'
function Invoke-Rc4Node {
  & node @args
  if ($LASTEXITCODE -ne 0) { throw "Candidate validation failed: $($args[0]) ($LASTEXITCODE)" }
}
Invoke-Rc4Node -e 'const net=require("node:net");try{net.connect(80,"203.0.113.10");process.exit(1)}catch(e){if(e.code!=="RC4_TEST_OFFLINE") throw e}'
Invoke-Rc4Node node_modules/typescript/bin/tsc -p tsconfig.json --pretty false
Invoke-Rc4Node node_modules/typescript/bin/tsc -p tsconfig.client.json --pretty false
Invoke-Rc4Node scripts/check-compatibility.mjs
$specs = @(
  'tests/search.spec.ts'
  'tests/compatibility.spec.ts'
  'tests/bundle-defaults.spec.ts'
  'tests/adapter.spec.ts'
  'tests/adapter-auth-boundary.spec.ts'
  'tests/model-catalog.spec.ts'
  'tests/model-contract.spec.ts'
  'tests/transport-settings.spec.ts'
  'tests/transport.spec.ts'
  'tests/transport-lifecycle.spec.ts'
  'tests/ws-residency.spec.ts'
  'tests/recent-requests.spec.ts'
  'tests/request-lifecycle.spec.ts'
  'tests/provider-proxy-classification.spec.ts'
  'tests/settings-integration.spec.ts'
  'tests/context-window-settings.spec.ts'
  'tests/loader-composition.spec.ts'
  'tests/websocket-loader.spec.ts'
  'tests/websocket-transport.spec.ts'
  'tests/usage-projection.spec.ts'
  'tests/speed-mode-adapter.spec.ts'
  'tests/auto-review-request.spec.ts'
  'tests/openai-codex-speed.client.spec.tsx'
  'tests/codex-usage-panel.client.spec.tsx'
)
Invoke-Rc4Node node_modules/vitest/vitest.mjs run --maxWorkers 4 @specs
Invoke-Rc4Node node_modules/tsdown/dist/run.mjs
Invoke-Rc4Node scripts/check-env-proxy-import.mjs
Invoke-Rc4Node scripts/check-capability-cli.mjs
Invoke-Rc4Node scripts/check-pack.mjs
