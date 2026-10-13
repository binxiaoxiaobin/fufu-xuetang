# One-time setup for the home server PC (the old computer).
#
# Run this ONCE on the old PC, in an ADMIN PowerShell, from the project root:
#     .\scripts\home-server-setup.ps1 -MysqlPassword "your-mysql-password"
#
# Optional:
#     -MysqlUser fufu                        use a dedicated MySQL account instead of root
#     -PythonPath "C:\Python312\python.exe"  pin the interpreter explicitly
#     -Port 8000
#     -SkipFirewall                          do not add the inbound rule
#     -SkipAutoStart                         do not register the boot task
#     -StartNow                              start the backend right after setup
#
# Everything here is idempotent - running it twice is harmless.
#
# ASCII output on purpose: this file has no BOM, so non-ASCII would be garbled
# by Windows PowerShell 5.1.

param(
  [Parameter(Mandatory = $true)]
  [string]$MysqlPassword,
  [string]$MysqlUser = 'root',
  [string]$MysqlHost = '127.0.0.1',
  [int]$MysqlPort = 3306,
  [string]$Database = 'fufu_learning',
  [string]$PythonPath,
  [int]$Port = 8000,
  [switch]$SkipFirewall,
  [switch]$SkipAutoStart,
  [switch]$StartNow
)

# NOTE: 'Continue', not 'Stop' - see lib-common.ps1 for why.
$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot 'lib-common.ps1')

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host ''
Write-Host '  Fufu Learning - home server setup' -ForegroundColor Green
Write-Host "  project: $root"
Write-Host ''

# --------------------------------------------------------------- admin check
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Please run this in an ADMIN PowerShell (right-click -> Run as administrator).'
}

# ------------------------------------------------------------------- python
Write-Step 'Locating Python'
if ($PythonPath) { $env:FUFU_PYTHON = $PythonPath }
$python = Find-FufuPython
if (-not $python) {
  throw 'Python not found. Install Python 3.9+ (tick "Add Python to PATH") and retry.'
}
$version = Invoke-Native $python --version
if ($version.Code -ne 0) { throw "That Python does not run: $python" }
Write-Ok "Python: $($version.Text)"
Write-Hint $python

Write-Step 'Installing backend requirements'
$req = Join-Path $root 'backend\requirements.txt'
$pip1 = Invoke-Native $python -m pip install --upgrade pip
if ($pip1.Code -ne 0) { Write-Warn 'Upgrading pip failed; continuing anyway.' }
$pip2 = Invoke-Native $python -m pip install -r $req
if ($pip2.Code -ne 0) {
  Write-Warn $pip2.Text
  throw 'pip install failed. Check the Python environment.'
}
Write-Ok 'PyMySQL ready'

# ------------------------------------------------- machine-wide environment
Write-Step 'Writing machine-wide environment variables'
[Environment]::SetEnvironmentVariable('FUFU_MYSQL_HOST', $MysqlHost, 'Machine')
[Environment]::SetEnvironmentVariable('FUFU_MYSQL_PORT', "$MysqlPort", 'Machine')
[Environment]::SetEnvironmentVariable('FUFU_MYSQL_USER', $MysqlUser, 'Machine')
[Environment]::SetEnvironmentVariable('FUFU_MYSQL_PASSWORD', $MysqlPassword, 'Machine')
[Environment]::SetEnvironmentVariable('FUFU_MYSQL_DATABASE', $Database, 'Machine')
[Environment]::SetEnvironmentVariable('FUFU_PYTHON', $python, 'Machine')
# make them visible to this session too
$env:FUFU_MYSQL_HOST = $MysqlHost
$env:FUFU_MYSQL_PORT = "$MysqlPort"
$env:FUFU_MYSQL_USER = $MysqlUser
$env:FUFU_MYSQL_PASSWORD = $MysqlPassword
$env:FUFU_MYSQL_DATABASE = $Database
$env:FUFU_PYTHON = $python
Write-Ok 'FUFU_MYSQL_* and FUFU_PYTHON stored at machine scope'

# --------------------------------------------------------------- database
Write-Step 'Creating the database and importing content (idempotent)'
$init = Invoke-Native $python (Join-Path $root 'scripts\init_backend_db.py')
if ($init.Code -ne 0) {
  Write-Warn $init.Text
  throw 'Database setup failed. Is MySQL running? Is the password correct?'
}
Write-Ok 'database ready'

Write-Step 'Seeding the clay zoo catalog (idempotent)'
$seed = Invoke-Native $python (Join-Path $root 'scripts\seed_zoo_animals.py')
if ($seed.Code -ne 0) { Write-Warn 'Zoo seeding failed - the rest of the app still works.' }
else { Write-Ok 'catalog ready' }

New-Item -ItemType Directory -Force -Path (Join-Path $root 'logs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root 'backups') | Out-Null

# --------------------------------------------------------------- firewall
if (-not $SkipFirewall) {
  Write-Step "Allowing inbound TCP $Port in Windows Firewall"
  $ruleName = "Fufu Learning $Port"
  Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP `
    -LocalPort $Port -Action Allow -Profile Private | Out-Null
  Write-Ok 'rule added (Private networks only)'
}

# --------------------------------------------------------- auto start task
if (-not $SkipAutoStart) {
  Write-Step 'Registering the boot task "FufuLearningServer"'
  $taskName = 'FufuLearningServer'
  $control = Join-Path $root 'scripts\server-control.ps1'
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$control`" -Action start -Background -Port $Port" `
    -WorkingDirectory $root
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $trigger.Delay = 'PT2M'   # give MySQL time to come up first
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' `
    -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $taskPrincipal -Force | Out-Null
  Write-Ok 'task registered (runs at boot as SYSTEM, 2 minute delay)'
  Write-Hint "remove later: Unregister-ScheduledTask -TaskName $taskName -Confirm:`$false"
}

# --------------------------------------------------------------- power plan
Write-Step 'Checking power settings (this PC must not sleep)'
$standby = Invoke-Native powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE
if ($standby.Code -eq 0) {
  $line = ($standby.Text -split "`n" | Select-String 'Current AC Power Setting Index' | Select-Object -First 1)
  if ($line) { Write-Hint $line.ToString().Trim() }
}
Write-Hint 'Set it to never sleep: Settings > System > Power > Screen and sleep'

# ------------------------------------------------------------------- start
if ($StartNow) {
  Write-Step 'Starting the backend now'
  & (Join-Path $root 'scripts\server-control.ps1') -Action restart -Background -Port $Port
}

# ------------------------------------------------------------------- summary
Write-Host ''
Write-Host '  Setup complete.' -ForegroundColor Green
Write-Host ''
Write-Host '  Reachable on the home network at:' -ForegroundColor White
Show-FufuAddress -Port $Port
Write-Host ''
Write-Host '  Next steps:' -ForegroundColor White
Write-Host '    1. Give this PC a fixed IP (router DHCP reservation) so the URL never changes.'
Write-Host '    2. Set power options so it never sleeps.'
Write-Host '    3. Open the URL on your tablet and sign in.'
Write-Host ''
Write-Host '  Daily commands:' -ForegroundColor White
Write-Host '    .\scripts\server-control.ps1 -Action status'
Write-Host '    .\scripts\sync-code.ps1'
Write-Host '    .\scripts\backup-db.ps1'
Write-Host ''
