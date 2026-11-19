$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/rc4-env.ps1"
$env:NODE_OPTIONS = '--require="' + (Join-Path $PSScriptRoot 'rc4-loopback-only.cjs').Replace([char]92,[char]47) + '"'
$pkg = Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json -AsHashtable
$archive = (Resolve-Path -LiteralPath "artifacts/$($pkg.name)-$($pkg.version).tgz").Path
$files = @(tar.exe -tf $archive)
if ($LASTEXITCODE) {throw 'Archive listing failed'}
$allowed = '^package/(?:(?:docs/[a-zA-Z0-9_./-]+[.](?:md|i18n[.]yaml))|(?:docs/assets/[a-zA-Z0-9_./-]+[.](?:jpg|png))|(?:docs/licenses/pi-ai-oauth[.]txt)|(?:README[.]i18n[.]yaml)|(?:lib/[a-zA-Z0-9_.-]+[.](?:js|ts))|(?:locale/[a-zA-Z0-9_.-]+[.]json)|(?:LICENSE|NOTICE|README[.]md|INSTALL[.]md|MIGRATION[.]md|VERSIONING[.]md|RC4-CANDIDATE[.]md|icon[.]svg|package[.]json|compatibility[.]json|cordis[.]patch[.]yml))$'
foreach ($name in $files) {
  if ($name -cnotmatch $allowed -or $name -match '(^|/).[.](/|$)|(^|/)[.]env|auth[.]json|credential|token') {throw "Disallowed archive member: $name"}
}
if (@($files | Select-Object -Unique).Count -ne $files.Count) {throw 'Duplicate archive members'}
$audit = Join-Path (Resolve-Path -LiteralPath .tmp).Path ('archive-review-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $audit | Out-Null
tar.exe -xf $archive -C $audit
if ($LASTEXITCODE) {throw 'Archive extraction failed'}
foreach ($name in $files) {
  $item = Get-Item -LiteralPath (Join-Path $audit $name)
  if ($item.LinkType -or $item.PSIsContainer) {throw 'Archive member is not a regular file'}
  $local = $name.Substring(8)
  if ((Get-FileHash -LiteralPath $item.FullName).Hash -ne (Get-FileHash -LiteralPath $local).Hash) {throw "Pack disagrees with candidate tree: $local"}
}
$entry = (Join-Path $audit 'package/lib/index.js').Replace([char]92,[char]47)
node --input-type=module -e 'import {pathToFileURL} from "node:url"; import assert from "node:assert/strict";const plugin=await import(pathToFileURL(process.argv[1]).href);assert.equal(typeof plugin.apply,"function");assert.equal(plugin.SUPPORTED_DSH_PLUGIN_API_VERSION,"0.2.2-rc.4");' $entry
if ($LASTEXITCODE) {throw 'Extracted Host entry import failed'}
$manifest = Get-Content -LiteralPath (Join-Path $audit 'package/package.json') -Raw | ConvertFrom-Json -AsHashtable
if ($manifest.version -ne '0.1.0-alpha.4.35.rc4.3' -or !$manifest.private) {throw 'Candidate manifest version or privacy mismatch'}
'Archive matched candidate source/bundles; entry import passed; ' + $files.Count + ' regular files.'
Get-FileHash -LiteralPath $archive -Algorithm SHA256
