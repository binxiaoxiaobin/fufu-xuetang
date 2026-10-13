# Fufu XueTang - one-time setup that needs Administrator rights.
#
# Double-click setup-once.bat next to this file (it self-elevates through UAC).
#
# It does three things, all idempotent - safe to run again:
#   1. register / start MySQL 5.7.33 as the Windows service "MySQL57"
#   2. allow inbound TCP 8000 through Windows Firewall (LAN + tunnel access)
#   3. print the addresses your tablet / phone can use
#
# ASCII-only on purpose: no BOM needed, so Windows PowerShell 5.1 reads it clean.
# PowerShell execution policy does NOT block this file because setup-once.bat
# invokes it with -ExecutionPolicy Bypass.

$ErrorActionPreference = 'Continue'

$Mysqld   = 'D:\MySQL\mysql-5.7.33-winx64\bin\mysqld.exe'
$Defaults = 'D:\MySQL\my.ini'
$Service  = 'MySQL57'
$Port     = 8000
$RuleName = 'Fufu XueTang 8000'

function Say  ([string]$t, [string]$c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Step ([string]$t) { Write-Host ''; Write-Host "==> $t" -ForegroundColor Cyan }

Write-Host ''
Say '  Fufu XueTang - one-time setup' 'Green'
Say '  ------------------------------------------------'
Say ''

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Say '  NOT elevated.' 'Red'
  Say '  Close this and double-click setup-once.bat instead.' 'Yellow'
  Read-Host 'Press Enter to close' | Out-Null
  exit 1
}
Say "  running as administrator: $($id.Name)" 'Green'

# ------------------------------------------------------------------ 1. MySQL
Step 'MySQL 5.7.33 Windows service'
if (-not (Test-Path $Mysqld)) {
  Say "  skipped - not found: $Mysqld" 'Yellow'
} else {
  if (-not (Test-Path $Defaults)) { Say "  WARNING: missing $Defaults" 'Yellow' }

  $svc = Get-Service -Name $Service -ErrorAction SilentlyContinue
  if ($svc) {
    Say "  service already registered (status: $($svc.Status))" 'Green'
  } else {
    $running = @(Get-Process -Name mysqld -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
      Say "  stopping $($running.Count) console mysqld process(es)" 'Yellow'
      $running | Stop-Process -Force
      Start-Sleep -Seconds 3
    }
    & $Mysqld --install $Service "--defaults-file=$Defaults"
    Say "  mysqld --install returned $LASTEXITCODE" 'Gray'
    Start-Sleep -Seconds 2
  }

  $svc = Get-Service -Name $Service -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -ne 'Running') {
    Start-Service -Name $Service
    Start-Sleep -Seconds 8
  }
  $svc = Get-Service -Name $Service -ErrorAction SilentlyContinue
  if ($svc) {
    Say "  MySQL57 status: $($svc.Status)" ($(if ($svc.Status -eq 'Running') { 'Green' } else { 'Red' }))
  } else {
    Say '  MySQL57 could not be registered - see D:\MySQL\data\mysql-error.log' 'Red'
  }
}

# ------------------------------------------------------------------ 2. firewall
Step "Firewall rule for inbound TCP $Port"
# Windows allows several rules to share one DisplayName, so a previous buggy
# run can leave duplicates behind. Collapse them back to exactly one.
$rules = @(Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue)
if ($rules.Count -gt 1) {
  Say "  found $($rules.Count) duplicate rules - removing extras" 'Yellow'
  $rules | Select-Object -Skip 1 | ForEach-Object {
    Remove-NetFirewallRule -Name $_.Name -ErrorAction SilentlyContinue
  }
  $rules = @(Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue)
}
if ($rules.Count -ge 1) {
  Say '  rule already exists' 'Green'
} else {
  try {
    New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Protocol TCP `
      -LocalPort $Port -Action Allow -Profile Any -ErrorAction Stop | Out-Null
    Say '  rule created' 'Green'
  } catch {
    Say "  FAILED: $($_.Exception.Message)" 'Red'
  }
}
# ------------------------------------------------------------------ 3. tunnel (optional)
Step 'Optional: Tailscale - reach the app from OUTSIDE your home WiFi'
Say '  (needed only if you want to use it while away from home)' 'DarkGray'
$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if ($ts) {
  Say '  Tailscale is already installed.' 'Green'
  Say '  Next: open a terminal and run  tailscale up  (browser login).' 'DarkGray'
} else {
  $ans = Read-Host '  Install Tailscale now? (y/N)'
  if ($ans -match '^(?i)y') {
    $installed = $false

    # Two known landmines with winget on this machine:
    #  1. the msstore source fails cert pinning -> 0x8a15005e
    #     => pin the command to --source winget
    #  2. "--id ... -e" matched case-sensitively here, so use the canonical casing
    $wg = Get-Command winget -ErrorAction SilentlyContinue
    if ($wg) {
      Say '  Running: winget install --id Tailscale.Tailscale -e --source winget' 'Gray'
      & winget install --id Tailscale.Tailscale -e --source winget `
          --accept-source-agreements --accept-package-agreements
      Say "  winget returned $LASTEXITCODE" 'Gray'
      if ($LASTEXITCODE -eq 0) { $installed = $true }
    } else {
      Say '  winget not available.' 'Yellow'
    }

    # Fallback: winget is flaky here, so pull the official signed installer
    # straight from pkgs.tailscale.com and run it.
    if (-not $installed) {
      Say '  Falling back to the official signed installer...' 'Yellow'
      $dst = 'D:\MySQL\_rt\tailscale-setup-latest.exe'
      $dir = Split-Path $dst -Parent
      if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
      try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri 'https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe' `
          -OutFile $dst -UseBasicParsing -ErrorAction Stop
        $sig = Get-AuthenticodeSignature $dst
        Say ("  downloaded {0:N0} bytes | signature: {1}" -f (Get-Item $dst).Length, $sig.Status) 'Gray'
        if ($sig.Status -eq 'Valid') {
          Say '  launching installer (UAC may prompt)...' 'Gray'
          & $dst
          $installed = $true
        } else {
          Say "  REFUSED to run - signature is $($sig.Status), not Valid" 'Red'
        }
      } catch {
        Say "  download failed: $($_.Exception.Message)" 'Red'
        Say '  manual download: https://tailscale.com/download/windows' 'Yellow'
      }
    }

    if ($installed) {
      Say ''
      Say '  AFTER it finishes:' 'Green'
      Say '    1. open a NEW terminal and run     tailscale up' 'Green'
      Say '    2. on your phone/tablet install Tailscale and log in with the SAME account' 'Green'
      Say '    3. open  http://<tailscale-ip>:8000   (get it with: tailscale ip -4)' 'Green'
    }
  } else {
    Say '  skipped. Full guide: publish\docs\ (open the Chinese .md file)' 'DarkGray'
  }
}

# ------------------------------------------------------------------ 4. report
Step 'Where to open the app'
$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' })
if ($ips.Count -eq 0) { Say '  no LAN IPv4 found (are you on WiFi?)' 'Yellow' }
foreach ($ip in $ips) {
  Say ("  http://{0}:{1}   [{2}]" -f $ip.IPAddress, $Port, $ip.InterfaceAlias) 'Green'
}

$listen = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -eq $Port })
if ($listen.Count -gt 0) {
  Say ''
  Say "  port $Port is LISTENING" 'Green'
  Say '  If the page does not load on your tablet, make sure the Fufu server' 'DarkGray'
  Say '  is running (double-click start-fufu.bat) and that both devices share' 'DarkGray'
  Say '  the same WiFi.' 'DarkGray'
} else {
  Say ''
  Say "  port $Port is NOT listening yet - double-click start-fufu.bat to start it." 'Yellow'
}

Write-Host ''
Say '  Done. This window can be closed.' 'Green'
Write-Host ''
Read-Host 'Press Enter to close' | Out-Null
