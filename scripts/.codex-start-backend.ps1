$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue) {
  throw 'Port 8000 already has a service. Verify and stop the existing project backend before starting a replacement.'
}
$secret = Read-Host -Prompt 'Local MySQL password' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $env:FUFU_MYSQL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$python = 'C:\Users\rybof\anaconda3\python.exe'
Start-Process -FilePath $python -ArgumentList 'backend/server.py' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'logs/server-8000.out.log') -RedirectStandardError (Join-Path $root 'logs/server-8000.err.log')
Start-Sleep -Seconds 8
try {
  $health = Invoke-RestMethod -Uri 'http://localhost:8000/api/health' -TimeoutSec 10
  Write-Output ('Health endpoint responded: ' + ($health | ConvertTo-Json -Compress -Depth 3))
  $page = Invoke-WebRequest -Uri 'http://localhost:8000/' -TimeoutSec 10 -UseBasicParsing
  Write-Output ('Homepage HTTP ' + [int]$page.StatusCode + ', length ' + $page.RawContentLength)
} catch {
  Write-Output ('Startup check failed: ' + $_.Exception.Message)
  Get-Content -Encoding UTF8 (Join-Path $root 'logs/server-8000.err.log') -Tail 25
  Get-Content -Encoding UTF8 (Join-Path $root 'logs/server-8000.out.log') -Tail 25
  exit 1
}
