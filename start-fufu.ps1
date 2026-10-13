# One-step launcher for the Fufu Learning app (backend + clay zoo catalog).
#
# Usage, from the project root:
#     .\start-fufu.ps1 -Password "your-mysql-password"
#
# If -Password is omitted, FUFU_MYSQL_PASSWORD from the environment is used;
# otherwise you are prompted (input hidden).
#
# Other switches:
#     -InitOnly    prepare the database and animal catalog, then exit
#     -SkipInit    skip schema setup (database already prepared)
#     -SkipSeed    skip the zoo animal catalog script
#     -Port 8000   port to listen on (informational check only)
#
# NOTE: output is intentionally ASCII-only so the file does not need a BOM.

param(
  [string]$Password,
  [int]$Port = 8000,
  [switch]$InitOnly,
  [switch]$SkipInit,
  [switch]$SkipSeed
)

$ErrorActionPreference = 'Stop'
$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
Set-Location $root

function Write-Step([string]$text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Write-Hint([string]$text) { Write-Host "    $text" -ForegroundColor DarkGray }

Write-Host ''
Write-Host '  Fufu Learning' -ForegroundColor Green
Write-Host "  project: $root"
Write-Host ''

# ---------------------------------------------------------------- password
if (-not $Password) { $Password = $env:FUFU_MYSQL_PASSWORD }
if (-not $Password) {
  $secure = Read-Host -Prompt 'MySQL password (FUFU_MYSQL_PASSWORD)' -AsSecureString
  $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
if (-not $Password) { throw 'MySQL password is required. Pass -Password or set FUFU_MYSQL_PASSWORD.' }
$env:FUFU_MYSQL_PASSWORD = $Password

# ---------------------------------------------------------------- python
Write-Step 'Looking for Python'
$python = $null
foreach ($candidate in @('python', 'python3', 'py')) {
  $found = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($found) { $python = $found.Source; break }
}
if (-not $python) { throw 'Python not found. Install Python 3.9+ and make sure "python" is on PATH.' }
Write-Hint (& $python --version 2>&1 | Out-String).Trim()

Write-Step 'Checking PyMySQL'
& $python -c "import pymysql" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Hint 'PyMySQL missing, installing backend requirements'
  & $python -m pip install -r (Join-Path $root 'backend\requirements.txt')
  if ($LASTEXITCODE -ne 0) { throw 'pip install failed. Fix the Python environment and retry.' }
}

# ---------------------------------------------------------------- database
if (-not $SkipInit) {
  Write-Step 'Preparing database (create / upgrade tables, import content)'
  & $python (Join-Path $root 'scripts\init_backend_db.py')
  if ($LASTEXITCODE -ne 0) { throw 'Database setup failed. Check that MySQL is running and the password is correct.' }
}

if (-not $SkipSeed) {
  Write-Step 'Seeding the clay zoo animal catalog (idempotent)'
  & $python (Join-Path $root 'scripts\seed_zoo_animals.py')
  if ($LASTEXITCODE -ne 0) { throw 'Zoo catalog seeding failed.' }
}

if ($InitOnly) {
  Write-Host ''
  Write-Host '  Database ready. Run this script again without -InitOnly to start the server.' -ForegroundColor Green
  Write-Host ''
  return
}

# ---------------------------------------------------------------- port check
$listening = @(netstat -ano -p tcp 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING")
if ($listening.Count -gt 0) {
  Write-Host ''
  Write-Host "  WARNING: port $Port is already in use - the server will fail to bind." -ForegroundColor Yellow
  Write-Hint 'Close the program using that port, or edit the port in backend/server.py.'
  Write-Host ''
}

# ---------------------------------------------------------------- run
Write-Step "Starting the server on http://localhost:$Port"
Write-Hint 'Keep this window open while the app is in use. Press Ctrl+C to stop.'
Write-Host ''
& $python (Join-Path $root 'backend\server.py')
