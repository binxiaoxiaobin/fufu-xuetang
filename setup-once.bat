@echo off
rem Double-click to run the one-time setup (MySQL service + firewall for port 8000).
rem Self-elevates through a UAC prompt, then runs setup-once.ps1 in a new window.
setlocal
set "PS1=%~dp0setup-once.ps1"

if not exist "%PS1%" (
  echo ERROR: setup-once.ps1 was not found next to this file.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','%PS1%') -Verb RunAs"
endlocal
