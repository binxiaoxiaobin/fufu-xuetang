# Copy the big media folder (~554 MB) from the DEV machine to the home server.
#
# Assets are deliberately NOT tracked by git (too large, and the server writes
# into this folder at runtime). Run this from the DEV machine when assets change:
#
#     .\scripts\sync-assets.ps1 -Target "\\HOMEPC\fufu\frontend\assets"
#     .\scripts\sync-assets.ps1 -Target "D:\fufu\frontend\assets"    (same machine)
#
# Options:
#     -Target   path to the assets folder on the server (required)
#     -Source   defaults to .\frontend\assets
#     -DryRun   list what would be copied, change nothing
#
# WHY robocopy /E AND NOT /MIR:
#   The server writes into this folder while running - generated TTS audio under
#   audio\tts\ (scripts/tts_build.py OUT_DIR) and admin uploads under content\.
#   /MIR mirrors the source and purges anything missing from it, which would
#   delete all of those on every run. /E copies and updates but never deletes.
#   Consequence to remember: a file deleted on the DEV machine stays on the
#   server until you remove it by hand.
#
# ASCII output on purpose: this file has no BOM, so non-ASCII would be garbled
# by Windows PowerShell 5.1.

param(
  [Parameter(Mandatory = $true)]
  [string]$Target,
  [string]$Source,
  [switch]$DryRun
)

# NOTE: 'Continue', not 'Stop' - see lib-common.ps1 for why.
$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot 'lib-common.ps1')

$root = Split-Path -Parent $PSScriptRoot
if (-not $Source) { $Source = Join-Path $root 'frontend\assets' }

if (-not (Test-Path $Source)) { throw "Source not found: $Source" }

$targetParent = Split-Path -Parent $Target
if (-not (Test-Path $targetParent)) {
  Write-Host ''
  Write-Host "  Cannot reach $targetParent" -ForegroundColor Yellow
  Write-Host '  Checklist:' -ForegroundColor White
  Write-Host '    1. Both PCs are on the same network.'
  Write-Host '    2. On the server, share the project folder:'
  Write-Host '         right-click the folder -> Properties -> Sharing -> Advanced Sharing'
  Write-Host '         share name: fufu, then check permissions.'
  Write-Host '    3. Windows Firewall on the server allows File and Printer Sharing (Private).'
  Write-Host '    4. You can open \\HOMEPC in File Explorer.'
  Write-Host '    5. A local path also works: -Target "D:\fufu\frontend\assets"'
  Write-Host ''
  throw "Target parent not reachable: $targetParent"
}

New-Item -ItemType Directory -Force -Path $Target | Out-Null

$srcSize = (Get-ChildItem $Source -Recurse -File -ErrorAction SilentlyContinue |
  Measure-Object Length -Sum).Sum
Write-Host ''
Write-Host '  Asset sync' -ForegroundColor Green
Write-Host "  from: $Source"
Write-Host "  to:   $Target"
Write-Host ("  size: {0:N0} MB" -f ($srcSize / 1MB))

$roboArgs = @($Source, $Target, '/E', '/R:2', '/W:2', '/MT:16', '/NP', '/NFL', '/NDL')
if ($DryRun) {
  $roboArgs += '/L'
  Write-Host '  DRY RUN - nothing will be written.' -ForegroundColor Yellow
}
Write-Host ''

$robo = Invoke-Native robocopy @roboArgs
if ($robo.Text) { $robo.Text -split "`n" | ForEach-Object { Write-Dim $_ } }

# robocopy uses bit flags: 0-7 all mean success, 8 and above are real errors.
if ($robo.Code -ge 8) { throw "robocopy failed with exit code $($robo.Code)" }

Write-Host ''
if ($DryRun) {
  Write-Host '  Dry run finished. Re-run without -DryRun to actually copy.' -ForegroundColor Green
}
else {
  Write-Host '  Assets synced.' -ForegroundColor Green
  Write-Host '  Note: files deleted on the DEV machine are NOT removed on the server.' -ForegroundColor Yellow
}
Write-Host ''
