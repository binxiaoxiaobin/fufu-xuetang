# Fufu Xuetang - tunnel helper (intranet penetration)
#
# What it does: health check, install tunnel tools, start a tunnel.
# It does NOT touch any project source code.
#
# Companion docs (inside publish\):
#   docs\内网穿透部署指南.md   <- full Chinese guide (human readable)
#   docs\tunnel-plan.json      <- machine readable plan (AI can execute it)
#
# Usage:
#   .\scripts\tunnel-setup.ps1                       # health check (default)
#   .\scripts\tunnel-setup.ps1 -Action firewall      # allow port 8000 (admin)
#   .\scripts\tunnel-setup.ps1 -Action install-tailscale
#   .\scripts\tunnel-setup.ps1 -Action tailscale-serve
#   .\scripts\tunnel-setup.ps1 -Action cloudflare-quick
#   .\scripts\tunnel-setup.ps1 -Action cloudflare-service -TunnelToken "<token>"
#
# IMPORTANT: this file is intentionally ASCII only (comments AND output).
# Windows PowerShell 5.1 reads a BOM-less .ps1 as ANSI, so Chinese text in here
# would show up as mojibake. All Chinese documentation lives in the .md file above.
[CmdletBinding()]
param(
  [ValidateSet('check', 'firewall', 'install-tailscale', 'tailscale-serve', 'cloudflare-quick', 'cloudflare-service', 'lan-url')]
  [string]$Action = 'check',
  [int]$Port = 8000,
  [string]$TunnelToken = ''
)

$ErrorActionPreference = 'Continue'

function Say([string]$text, [string]$color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Head([string]$text) { Write-Host ''; Write-Host ("=== " + $text + " ===") -ForegroundColor Cyan }
function Ok([string]$text) { Write-Host ("  [OK]   " + $text) -ForegroundColor Green }
function Warn([string]$text) { Write-Host ("  [WARN] " + $text) -ForegroundColor Yellow }
function Info([string]$text) { Write-Host ("         " + $text) -ForegroundColor Gray }

# Start-Process based native runner: PowerShell 5.1 turns native stderr into a
# terminating-looking error under $ErrorActionPreference='Stop', and git/cloudflared
# write progress/logs to stderr all the time. Redirecting through the .NET process
# API keeps the PowerShell error stream out of it entirely.
function Invoke-Native {
  param([string]$File, [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  $out = [IO.Path]::GetTempFileName()
  $err = [IO.Path]::GetTempFileName()
  try {
    $quoted = foreach ($a in $Arguments) {
      if ($null -eq $a) { '""' }
      elseif ($a -match '[\s"]') { '"' + ($a -replace '"', '\"') + '"' }
      else { $a }
    }
    $proc = Start-Process -FilePath $File -ArgumentList ($quoted -join ' ') -NoNewWindow -Wait -PassThru `
      -RedirectStandardOutput $out -RedirectStandardError $err
    $text = @(
      (Get-Content $out -Raw -Encoding UTF8 -ErrorAction SilentlyContinue),
      (Get-Content $err -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)
    ) | Where-Object { $_ -and $_.Trim() }
    return [pscustomobject]@{ Code = $proc.ExitCode; Text = ($text -join "`n").Trim() }
  } finally {
    Remove-Item $out, $err -Force -ErrorAction SilentlyContinue
  }
}

function Test-Command([string]$name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# winget on this machine has two quirks that break the obvious command line:
#   1. the msstore source fails certificate pinning -> 0x8a15005e
#      fixes: --source winget  (never touch msstore for winget-repo packages)
#   2. "--id <x> -e" is CASE SENSITIVE here -> use winget's canonical casing
#      (Tailscale.Tailscale, Cloudflare.cloudflared - not the lowercase forms)
# Everything below therefore pins --source winget and uses exact casing.
function Invoke-WingetInstall([string]$Id) {
  if (-not (Test-Command 'winget')) { Warn 'winget not available'; return $null }
  Info "running: winget install --id $Id -e --source winget"
  return Invoke-Native winget install --id $Id -e --source winget `
    --accept-source-agreements --accept-package-agreements
}

# Returns a local path to a SIGNATURE-VERIFIED Tailscale installer, or $null.
# Reuses a cached copy when one is already present (no download).
function Get-TailscaleInstaller {
  $cached = 'D:\MySQL\_rt\tailscale-setup-latest.exe'
  $tmp = Join-Path ([IO.Path]::GetTempPath()) 'tailscale-setup-latest.exe'
  foreach ($p in @($cached, $tmp)) {
    if (Test-Path $p) {
      $s = (Get-AuthenticodeSignature $p).Status
      if ($s -eq 'Valid') { Info "using cached installer: $p"; return $p }
      Warn "ignoring $p (signature: $s)"
    }
  }
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri 'https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe' `
      -OutFile $tmp -UseBasicParsing -ErrorAction Stop
  } catch {
    Warn "download failed: $($_.Exception.Message)"
    return $null
  }
  $s = (Get-AuthenticodeSignature $tmp).Status
  Info ("downloaded {0:N0} bytes | signature: {1}" -f (Get-Item $tmp).Length, $s)
  if ($s -ne 'Valid') { Warn 'REFUSED - signature is not Valid'; return $null }
  return $tmp
}

function Is-Admin {
  try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch { return $false }
}

# ---------------------------------------------------------------- actions

function Do-Check {
  Head "1. is the service running on port $Port"
  $conn = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if ($conn.Count -gt 0) {
    $addrs = ($conn | ForEach-Object { $_.LocalAddress } | Sort-Object -Unique) -join ', '
    Ok "listening on $addrs : $Port"
    if ($addrs -match '^127\.0\.0\.1$') {
      Warn "only bound to 127.0.0.1 - other devices on the LAN cannot reach it"
    }
  } else {
    Warn "nothing is listening on port $Port"
    Info "start it with:  .\start-fufu.ps1 -Password `"<mysql password>`""
    Info "or check state: .\scripts\server-control.ps1 -Action status"
  }

  Head "2. LAN address (use this on your tablet)"
  $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' })
  if ($ips.Count -gt 0) {
    foreach ($ip in $ips) {
      Ok ("http://" + $ip.IPAddress + ":" + $Port + "   (" + $ip.InterfaceAlias + ")")
    }
  } else {
    Warn "no IPv4 address found - are you online?"
  }

  Head "3. firewall rule for port $Port"
  $rules = @(Get-NetFirewallRule -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like "*$Port*" })
  if ($rules.Count -gt 0) {
    foreach ($r in $rules) { Ok ($r.DisplayName + "  enabled=" + $r.Enabled) }
  } else {
    Warn "no inbound firewall rule mentions $Port"
    Info "add one (admin shell):"
    Info "  .\scripts\tunnel-setup.ps1 -Action firewall"
  }

  Head "4. tunnel tools installed?"
  foreach ($tool in @('tailscale', 'cloudflared', 'ngrok', 'frpc')) {
    if (Test-Command $tool) {
      $v = (Invoke-Native $tool --version).Text
      Ok ("$tool  ->  " + ($v -split "`n")[0])
    } else {
      Info "$tool : not installed"
    }
  }

  Head "5. what to do next"
  Info "A) only you / family (phones + tablets):  Tailscale"
  Info "     .\scripts\tunnel-setup.ps1 -Action install-tailscale"
  Info "     .\scripts\tunnel-setup.ps1 -Action tailscale-serve"
  Info "B) share a link with friends:             Cloudflare Tunnel"
  Info "     cloudflared tunnel login"
  Info "     .\scripts\tunnel-setup.ps1 -Action cloudflare-quick   (test)"
  Info "     .\scripts\tunnel-setup.ps1 -Action cloudflare-service -TunnelToken `"<token>`""
  Info "C) you own a server with public IP:        frp  (see the Chinese doc)"
  Info ""
  Info "Full guide: publish\docs\  (open the Chinese .md guide in that folder)"
  Info "Machine readable plan for an AI assistant: publish\docs\tunnel-plan.json"
}

function Do-Firewall {
  if (-not (Is-Admin)) {
    Warn "this action needs an ADMIN PowerShell window"
    Info "right click PowerShell -> Run as administrator, then run it again"
    return
  }
  $name = "FUFU $Port"
  Head "allow inbound TCP $Port"
  # Windows lets several rules share one DisplayName, so collapse duplicates.
  $rules = @(Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)
  if ($rules.Count -gt 1) {
    Warn "found $($rules.Count) rules named '$name' - removing the extras"
    $rules | Select-Object -Skip 1 | ForEach-Object {
      Remove-NetFirewallRule -Name $_.Name -ErrorAction SilentlyContinue
    }
    $rules = @(Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)
  }
  if ($rules.Count -ge 1) {
    Ok "rule '$name' already exists"
  } else {
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
    Ok "rule '$name' created"
  }
  Info "verify:  Get-NetFirewallRule -DisplayName '$name'"
  Info "remove:  Remove-NetFirewallRule -DisplayName '$name'"
}

function Do-InstallTailscale {
  Head "install Tailscale"
  if (Test-Command 'tailscale') { Ok "already installed"; return }

  $r = Invoke-WingetInstall 'Tailscale.Tailscale'
  if ($r) {
    Say $r.Text
    if ($r.Code -eq 0) { Ok "installed. Open a NEW terminal, then run: tailscale up"; return }
    Warn "winget exited with code $($r.Code)"
  }

  # Fallback: skip winget entirely and use the official signed installer.
  Warn "falling back to the official signed installer"
  $exe = Get-TailscaleInstaller
  if (-not $exe) {
    Info "manual download: https://tailscale.com/download/windows"
    return
  }
  Info "launching installer (UAC may prompt)..."
  & $exe
  Ok "installer finished. Open a NEW terminal, then run: tailscale up"
}

function Do-TailscaleServe {
  Head "expose this machine on your tailnet"
  if (-not (Test-Command 'tailscale')) { Warn "tailscale not installed"; return }
  $st = Invoke-Native tailscale status
  Say $st.Text
  Info "running: tailscale serve --bg $Port"
  $r = Invoke-Native tailscale serve --bg $Port
  Say $r.Text
  if ($r.Code -eq 0) {
    Ok "done - the https URL printed above works from any device in your tailnet"
    Info "requires MagicDNS + HTTPS Certificates enabled in the admin console"
  } else {
    Warn "exit code $($r.Code)"
    Info "check flags with: tailscale serve --help"
    Info "plain fallback: use http://<tailscale-ip>:<port> (tailscale ip -4)"
  }
}

function Do-CloudflareQuick {
  Head "cloudflare quick tunnel (temporary URL, for testing)"
  if (-not (Test-Command 'cloudflared')) {
    Warn "cloudflared not installed"
    Info "winget install --id Cloudflare.cloudflared -e --source winget"
    Info "or download: https://github.com/cloudflare/cloudflared/releases"
    return
  }
  Info "this stays in the foreground. Ctrl+C to stop."
  Info "copy the https://xxxx.trycloudflare.com URL it prints, then open it on a phone with WiFi OFF."
  & cloudflared tunnel --url "http://localhost:$Port"
}

function Do-CloudflareService {
  Head "install cloudflared as a Windows service (named tunnel)"
  if (-not (Test-Command 'cloudflared')) { Warn "cloudflared not installed"; return }
  if (-not $TunnelToken) {
    Warn "missing -TunnelToken"
    Info "get the token from the Cloudflare Zero Trust dashboard:"
    Info "  Networks -> Tunnels -> create a tunnel -> connector token"
    Info "then: .\scripts\tunnel-setup.ps1 -Action cloudflare-service -TunnelToken `"<token>`""
    return
  }
  if (-not (Is-Admin)) { Warn "this action needs an ADMIN PowerShell window"; return }
  $r = Invoke-Native cloudflared service install $TunnelToken
  Say $r.Text
  if ($r.Code -eq 0) { Ok "service installed - it starts automatically on boot" }
  else { Warn "exit code $($r.Code)" }
}

function Do-LanUrl {
  $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' })
  foreach ($ip in $ips) { Say ("http://" + $ip.IPAddress + ":" + $Port + "   (" + $ip.InterfaceAlias + ")") }
}

# ---------------------------------------------------------------- dispatch

switch ($Action) {
  'check' { Do-Check }
  'firewall' { Do-Firewall }
  'install-tailscale' { Do-InstallTailscale }
  'tailscale-serve' { Do-TailscaleServe }
  'cloudflare-quick' { Do-CloudflareQuick }
  'cloudflare-service' { Do-CloudflareService }
  'lan-url' { Do-LanUrl }
}
