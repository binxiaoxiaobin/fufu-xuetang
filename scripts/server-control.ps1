# Start / stop / restart / inspect the Fufu Learning backend on the home server.
#
# Usage (from the project root):
#     .\scripts\server-control.ps1 -Action status
#     .\scripts\server-control.ps1 -Action start
#     .\scripts\server-control.ps1 -Action start -Background
#     .\scripts\server-control.ps1 -Action restart -Background
#     .\scripts\server-control.ps1 -Action stop
#
# Logs: logs\server.out.log and logs\server.err.log
#
# ASCII output on purpose: this file has no BOM, so non-ASCII would be garbled
# by Windows PowerShell 5.1.

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('start', 'stop', 'restart', 'status')]
  [string]$Action,
  [switch]$Background,
  [int]$Port = 8000
)

# NOTE: 'Continue', not 'Stop' - see lib-common.ps1 for why.
$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot 'lib-common.ps1')

$root = Split-Path -Parent $PSScriptRoot
$self = $MyInvocation.MyCommand.Path
Set-Location $root

# Match on the command line so we never kill an unrelated Python script.
function Get-FufuServerProcesses {
  $all = Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe'" -ErrorAction SilentlyContinue
  return @($all | Where-Object { $_.CommandLine -and $_.CommandLine -like '*server.py*' })
}

function Test-FufuPort {
  $listen = @(netstat -ano -p tcp 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING")
  return ($listen.Count -gt 0)
}

function Assert-FufuDbPassword {
  if (-not $env:FUFU_MYSQL_PASSWORD) {
    throw 'FUFU_MYSQL_PASSWORD is not set. Run scripts\home-server-setup.ps1 once, or set the environment variable.'
  }
}

switch ($Action) {

  'status' {
    $procs = Get-FufuServerProcesses
    if ($procs.Count -eq 0) { Write-Host '  NOT running.' -ForegroundColor Yellow }
    else { Write-Host "  RUNNING  (pid $($procs[0].ProcessId))" -ForegroundColor Green }

    if (Test-FufuPort) { Write-Host "  port $Port is LISTENING" }
    else { Write-Host "  port $Port is not listening" }

    Write-Host '  reachable at:'
    Show-FufuAddress -Port $Port
  }

  'stop' {
    $procs = Get-FufuServerProcesses
    if ($procs.Count -eq 0) {
      Write-Step 'Nothing to stop'
      break
    }
    foreach ($p in $procs) {
      Write-Step "Stopping pid $($p.ProcessId)"
      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 800
    if ((Get-FufuServerProcesses).Count -eq 0) { Write-Ok 'stopped.' }
    else { Write-Warn 'Some processes are still alive; run stop again.' }
  }

  'start' {
    Assert-FufuDbPassword

    $running = Get-FufuServerProcesses
    if ($running.Count -gt 0) {
      Write-Warn "Already running (pid $($running[0].ProcessId)). Use -Action restart."
      break
    }

    $python = Find-FufuPython
    if (-not $python) {
      throw 'Python not found. Run scripts\home-server-setup.ps1 -PythonPath "C:\path\to\python.exe".'
    }

    $logDir = Join-Path $root 'logs'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $outLog = Join-Path $logDir 'server.out.log'
    $errLog = Join-Path $logDir 'server.err.log'

    if ($Background) {
      Write-Step 'Starting in the background'
      # Clear last run's logs so err.log only ever holds the current run.
      Set-Content $outLog '' -Encoding UTF8
      Set-Content $errLog '' -Encoding UTF8

      Start-Process -FilePath $python `
        -ArgumentList (ConvertTo-ArgString @((Join-Path $root 'backend\server.py'))) `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog | Out-Null

      Start-Sleep -Seconds 3
      if ((Get-FufuServerProcesses).Count -gt 0) {
        Write-Ok 'started.'
        Write-Host '  reachable at:'
        Show-FufuAddress -Port $Port
      }
      else {
        Write-Warn 'Process exited immediately. Last lines of logs\server.err.log:'
        if (Test-Path $errLog) {
          Get-Content $errLog -Tail 15 -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Dim $_ }
        }
        # Non-zero exit lets the restart-on-failure setting of the boot task retry.
        exit 1
      }
    }
    else {
      Write-Step "Starting in the foreground on port $Port"
      Write-Dim 'Keep this window open. Press Ctrl+C to stop.'
      Write-Host '  reachable at:'
      Show-FufuAddress -Port $Port
      Write-Host ''
      & $python (Join-Path $root 'backend\server.py')
    }
  }

  'restart' {
    & $self -Action stop -Port $Port
    Start-Sleep -Milliseconds 500
    $params = @{ Action = 'start'; Port = $Port }
    if ($Background) { $params['Background'] = $true }
    & $self @params
  }
}
