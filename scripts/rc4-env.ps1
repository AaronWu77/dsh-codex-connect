# Run or dot-source from the candidate repository. Registry access is install-only.
$rc4Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$rc4Scratch = Join-Path $rc4Root '.tmp'
foreach ($folder in 'home', 'temp', 'appdata', 'localappdata', 'cache') {
  New-Item -ItemType Directory -Force -Path (Join-Path $rc4Scratch $folder) | Out-Null
}
Get-ChildItem Env: | Where-Object {
  $_.Name -match '(?i)(KEY|TOKEN|SECRET|PASSWORD|PROXY|NPM_CONFIG|NODE_OPTIONS|NODE_PATH|OPENAI|CODEX|ANTHROPIC|DEEPSEEK|^DSH_)'
} | Remove-Item
$env:HOME = Join-Path $rc4Scratch 'home'
$env:USERPROFILE = $env:HOME
$env:DSH_HOME = $env:HOME
$env:CODEX_HOME = $env:HOME
$env:APPDATA = Join-Path $rc4Scratch 'appdata'
$env:LOCALAPPDATA = Join-Path $rc4Scratch 'localappdata'
$env:TEMP = Join-Path $rc4Scratch 'temp'
$env:TMP = $env:TEMP
$env:NPM_CONFIG_USERCONFIG = Join-Path $rc4Scratch 'user.npmrc'
$env:NPM_CONFIG_GLOBALCONFIG = Join-Path $rc4Scratch 'global.npmrc'
$env:NPM_CONFIG_CACHE = Join-Path $rc4Scratch 'cache'
