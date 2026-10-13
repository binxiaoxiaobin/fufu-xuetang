# Pull the latest code onto the home server and restart the backend.
#
# Run this ON the old PC, from the project root:
#     .\scripts\sync-code.ps1
#
# Options:
#     -NoRestart     pull only, leave the running server alone
#     -Force         restart even if nothing changed
#
# HOW IT DECIDES WHETHER ANYTHING CHANGED:
#   It compares the commit hash of HEAD before and after `git pull --ff-only`.
#   It deliberately does NOT ask `git rev-parse origin/<branch>`, because that
#   relies on the remote-tracking ref, which `git fetch` updates as a separate
#   step and which can end up stale - observed in a sandboxed filesystem, where
#   fetch reported success and moved FETCH_HEAD while refs/remotes/origin/main
#   never changed, making the script wrongly report "already up to date".
#   `pull` is idempotent and cheap, so pulling first and comparing HEAD is both
#   simpler and more reliable.
#
# ASCII output on purpose: this file has no BOM, so non-ASCII would be garbled
# by Windows PowerShell 5.1.

param(
  [switch]$NoRestart,
  [switch]$Force,
  [int]$Port = 8000
)

# NOTE: 'Continue', not 'Stop'. Under PowerShell 5.1 a native command that
# writes to stderr is promoted to a TERMINATING error when ErrorActionPreference
# is 'Stop', which would abort this script for no good reason. Native calls go
# through Invoke-Native (see lib-common.ps1) and are checked explicitly.
$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot 'lib-common.ps1')

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'git not found. Install Git for Windows, or copy the project with scripts\sync-assets.ps1 instead.'
}

Write-Host ''
Write-Host '  Sync' -ForegroundColor Green
Write-Host ''

# --------------------------------------------------------- repo sanity
$inside = Invoke-Native git rev-parse --is-inside-work-tree
if ($inside.Code -ne 0) {
  throw "This folder is not a git repository ($root). Re-deploy with: git clone <url> D:\fufu"
}

$branchResult = Invoke-Native git rev-parse --abbrev-ref HEAD
if ($branchResult.Code -ne 0) { throw "Cannot read the current branch. git said: $($branchResult.Text)" }
Write-Host "  branch: $($branchResult.Text)"

$beforeResult = Invoke-Native git rev-parse HEAD
if ($beforeResult.Code -ne 0) {
  throw "This checkout has no commits yet. Run 'git pull' once manually. git said: $($beforeResult.Text)"
}
$before = $beforeResult.Text

# --------------------------------------------------------- local edits
Write-Step 'Checking for local edits on this machine'
$dirty = Invoke-Native git status --porcelain
if ($dirty.Text) {
  Write-Warn 'This copy has uncommitted local changes:'
  $dirty.Text -split "`n" | Select-Object -First 10 | ForEach-Object { Write-Dim $_ }
  Write-Warn 'Refusing to pull so nothing is lost. Deal with them first:'
  Write-Warn '  git stash          (set aside; recover later with: git stash pop)'
  Write-Warn '  git checkout -- .  (discard the changes)'
  exit 1
}

# --------------------------------------------------------- pull
Write-Step 'Pulling from the remote (fast-forward only)'
$pull = Invoke-Native git pull --ff-only
if ($pull.Text) {
  # Drop git's own "Already up to date." line - we print our own version below,
  # and a stray blank line comes with it.
  $pull.Text -split "`n" |
    Where-Object { $_.Trim() -and $_.Trim() -ne 'Already up to date.' } |
    ForEach-Object { Write-Dim $_ }
}
if ($pull.Code -ne 0) {
  Write-Warn 'pull did not succeed.'
  Write-Warn 'If the history diverged (usually because the dev machine force-pushed or rebased),'
  Write-Warn 'the quickest fix on a server checkout is:'
  Write-Warn "  git fetch origin; git reset --hard origin/$($branchResult.Text)"
  Write-Warn 'That discards local commits on THIS machine - safe here, since you edit on the dev PC.'
  throw 'git pull failed.'
}

$afterResult = Invoke-Native git rev-parse HEAD
if ($afterResult.Code -ne 0) { throw "Cannot read HEAD after pull. git said: $($afterResult.Text)" }
$after = $afterResult.Text

if ($before -eq $after) {
  Write-Ok 'Already up to date.'
  if (-not $Force) {
    Write-Host ''
    exit 0
  }
  Write-Warn '-Force given: restarting anyway.'
}
else {
  Write-Ok "$($before.Substring(0, 7)) -> $($after.Substring(0, 7))"
}

# --------------------------------------------------------- what came in
$changedFiles = ''
if ($before -ne $after) {
  Write-Step 'Commits just applied'
  $log = Invoke-Native git log --oneline --no-decorate "$before..$after"
  if ($log.Text) { $log.Text -split "`n" | Select-Object -First 15 | ForEach-Object { Write-Dim $_ } }

  $diff = Invoke-Native git diff --name-only $before $after
  $changedFiles = $diff.Text
}

# --------------------------------------------------------- dependencies
Write-Step 'Checking whether backend requirements changed'
if ($changedFiles -match 'backend[\\/]requirements\.txt') {
  Write-Warn 'requirements.txt changed - installing'
  $python = Find-FufuPython
  if (-not $python) { Write-Warn 'Python not found; run home-server-setup.ps1 again.' }
  else {
    $pip = Invoke-Native $python -m pip install --quiet -r (Join-Path $root 'backend\requirements.txt')
    if ($pip.Code -ne 0) { Write-Warn "pip failed: $($pip.Text)" }
    else { Write-Ok 'dependencies updated' }
  }
}
else {
  Write-Ok 'no dependency change'
}

if ($changedFiles -match 'frontend[\\/]assets') {
  Write-Warn 'Assets are NOT tracked by git.'
  Write-Warn 'If they changed, run scripts\sync-assets.ps1 from the DEV machine.'
}

# --------------------------------------------------------- restart
if ($NoRestart) {
  Write-Host ''
  Write-Host '  Pulled. Server left running - restart it yourself to apply.' -ForegroundColor Green
  Write-Host ''
  exit 0
}

Write-Step 'Restarting the backend'
& (Join-Path $PSScriptRoot 'server-control.ps1') -Action restart -Background -Port $Port

Write-Host ''
Write-Host '  Done. Refresh the browser (Ctrl+F5 on PC) to pick up front-end changes.' -ForegroundColor Green
Write-Host ''
