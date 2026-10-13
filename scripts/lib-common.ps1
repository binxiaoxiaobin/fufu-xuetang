# Shared helpers for the Fufu Learning deployment scripts.
# Dot-source it:  . (Join-Path $PSScriptRoot 'lib-common.ps1')
#
# ASCII output on purpose: this file has no BOM, so non-ASCII would be garbled
# by Windows PowerShell 5.1.

function Write-Step([string]$t) { Write-Host "==> $t" -ForegroundColor Cyan }
function Write-Ok([string]$t) { Write-Host "    $t" -ForegroundColor Green }
function Write-Warn([string]$t) { Write-Host "    $t" -ForegroundColor Yellow }
function Write-Dim([string]$t) { Write-Host "      $t" -ForegroundColor DarkGray }
function Write-Hint([string]$t) { Write-Host "    $t" -ForegroundColor DarkGray }

# Builds a single argument string for Start-Process, quoting anything with
# whitespace or a double quote. Start-Process -ArgumentList takes a flat string
# and does NOT quote for you, so an unquoted path like
#   C:\Program Files\...\requirements.txt
# would arrive as two separate arguments.
function ConvertTo-ArgString {
  param([string[]]$Arguments)
  $parts = foreach ($a in $Arguments) {
    if ($null -eq $a -or $a -eq '') { '""' }
    elseif ($a -match '[\s"]') { '"' + ($a -replace '"', '\"') + '"' }
    else { $a }
  }
  return ($parts -join ' ')
}

# Runs a native program and returns @{ Code = exit code; Text = stdout+stderr }.
#
# WHY Start-Process WITH .NET REDIRECTION INSTEAD OF the obvious
#   (& $exe @args 2>&1 | Out-String)
# Because under Windows PowerShell 5.1 that obvious form still promotes
# everything git writes to stderr into a NativeCommandError record, which is
# printed to the console as a red block that looks like a crash - on every
# single successful `git pull`, since git reports progress on stderr. Redirecting
# with `2>` to a file does not help either. Going through Start-Process hands
# the streams to the .NET process API, so PowerShell's error stream is never
# involved and the console stays clean.
function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$File,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )
  $outFile = [IO.Path]::GetTempFileName()
  $errFile = [IO.Path]::GetTempFileName()
  try {
    $proc = Start-Process -FilePath $File `
      -ArgumentList (ConvertTo-ArgString $Arguments) `
      -NoNewWindow -Wait -PassThru `
      -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    $stdout = Get-Content $outFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    $stderr = Get-Content $errFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    $both = @($stdout, $stderr) | Where-Object { $_ -and $_.Trim() }
    return [pscustomobject]@{ Code = $proc.ExitCode; Text = ($both -join "`n").Trim() }
  }
  finally {
    Remove-Item $outFile, $errFile -Force -ErrorAction SilentlyContinue
  }
}

# Locates a usable Python interpreter. FUFU_PYTHON is written at machine scope
# by home-server-setup.ps1 so the boot task (running as SYSTEM) can find an
# interpreter that was installed "for this user only".
function Find-FufuPython {
  if ($env:FUFU_PYTHON -and (Test-Path $env:FUFU_PYTHON)) { return $env:FUFU_PYTHON }
  foreach ($c in @('python', 'python3', 'py')) {
    $found = Get-Command $c -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
  }
  return $null
}

# Prints every non-loopback IPv4 address with the app port.
function Show-FufuAddress {
  param([int]$Port = 8000)
  $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress)
  if ($ips.Count -eq 0) {
    Write-Dim 'no non-loopback IPv4 address found'
    return
  }
  foreach ($ip in $ips) { Write-Host "    http://${ip}:$Port" -ForegroundColor Green }
}
