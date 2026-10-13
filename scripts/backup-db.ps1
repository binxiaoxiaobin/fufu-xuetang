# Back up the Fufu Learning MySQL database to .\backups\.
#
# Run on the home server:
#     .\scripts\backup-db.ps1
#
# Options:
#     -Keep 30                                how many dumps to retain (default 14)
#     -MysqlDumpPath "C:\...\mysqldump.exe"   pin the binary if auto-detect fails
#
# Uses the FUFU_MYSQL_* environment variables written by home-server-setup.ps1.
# The password goes through a temporary defaults file rather than the command
# line, so it never appears in the process list.
#
# Schedule it once with:
#     $a = New-ScheduledTaskAction -Execute 'powershell.exe' `
#            -Argument '-NoProfile -ExecutionPolicy Bypass -File "D:\fufu\scripts\backup-db.ps1"' `
#            -WorkingDirectory 'D:\fufu'
#     $t = New-ScheduledTaskTrigger -Daily -At 3am
#     Register-ScheduledTask -TaskName 'FufuLearningBackup' -Action $a -Trigger $t -Force
#
# ASCII output on purpose: this file has no BOM, so non-ASCII would be garbled
# by Windows PowerShell 5.1.

param(
  [int]$Keep = 14,
  [string]$MysqlDumpPath
)

# NOTE: 'Continue', not 'Stop' - see lib-common.ps1 for why.
$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot 'lib-common.ps1')

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$hostName = if ($env:FUFU_MYSQL_HOST) { $env:FUFU_MYSQL_HOST } else { '127.0.0.1' }
$port = if ($env:FUFU_MYSQL_PORT) { $env:FUFU_MYSQL_PORT } else { '3306' }
$user = if ($env:FUFU_MYSQL_USER) { $env:FUFU_MYSQL_USER } else { 'root' }
$database = if ($env:FUFU_MYSQL_DATABASE) { $env:FUFU_MYSQL_DATABASE } else { 'fufu_learning' }
$password = $env:FUFU_MYSQL_PASSWORD

if (-not $password) {
  throw 'FUFU_MYSQL_PASSWORD is not set. Run scripts\home-server-setup.ps1 first.'
}

# ------------------------------------------------------------- locate mysqldump
if (-not $MysqlDumpPath) {
  $candidate = Get-Command mysqldump -ErrorAction SilentlyContinue
  if ($candidate) { $MysqlDumpPath = $candidate.Source }
}
if (-not $MysqlDumpPath) {
  $searchRoots = @("$env:ProgramFiles\MySQL", "$env:ProgramFiles\MariaDB*",
    'C:\xampp\mysql', 'C:\wamp64\bin\mysql')
  foreach ($base in $searchRoots) {
    $hit = Get-ChildItem -Path $base -Filter 'mysqldump.exe' -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($hit) { $MysqlDumpPath = $hit.FullName; break }
  }
}
if (-not $MysqlDumpPath) {
  throw 'mysqldump.exe not found. Pass -MysqlDumpPath, or add the MySQL bin folder to PATH.'
}
Write-Step "Using $MysqlDumpPath"

# ------------------------------------------------------------------- dump
$backupDir = Join-Path $root 'backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$target = Join-Path $backupDir "$database`_$stamp.sql"

Write-Step "Dumping $database -> backups\$database`_$stamp.sql"

# A temporary defaults file keeps the password off the command line.
$cnf = Join-Path $env:TEMP "fufu-dump-$stamp.cnf"
@(
  '[client]',
  "host=$hostName",
  "port=$port",
  "user=$user",
  "password=$password"
) | Set-Content -Path $cnf -Encoding ASCII

try {
  $dump = Invoke-Native $MysqlDumpPath "--defaults-extra-file=$cnf" `
    --single-transaction --routines --events --default-character-set=utf8mb4 `
    "--result-file=$target" $database
  if ($dump.Text) { $dump.Text -split "`n" | ForEach-Object { Write-Dim $_ } }
  if ($dump.Code -ne 0) { throw "mysqldump exited with code $($dump.Code)" }
}
finally {
  Remove-Item $cnf -Force -ErrorAction SilentlyContinue
}

$size = (Get-Item $target).Length
Write-Ok ("{0:N0} KB" -f ($size / 1KB))
if ($size -lt 1024) {
  Write-Warn 'dump is suspiciously small - check that the database actually has data.'
}

# ------------------------------------------------------------------ rotate
Write-Step "Keeping the newest $Keep dumps"
$old = Get-ChildItem $backupDir -Filter "$database`_*.sql" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep
foreach ($f in $old) {
  Remove-Item $f.FullName -Force
  Write-Dim "removed $($f.Name)"
}

Write-Host ''
Write-Host '  Backup complete.' -ForegroundColor Green
Write-Host '  Restore later with:' -ForegroundColor White
Write-Host "    mysql -u $user -p $database < backups\$database`_$stamp.sql"
Write-Host ''
Write-Host '  Tip: copy the backups folder to a USB drive or a cloud folder now and then.' -ForegroundColor DarkGray
Write-Host ''
