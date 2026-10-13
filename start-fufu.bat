@echo off
setlocal
cd /d "%~dp0"
title Fufu XueTang  (close this window to stop the server)

echo.
echo   Fufu XueTang - starting
echo   ================================================
echo.

rem ---------------------------------------------------------------- password
set "FUFU_MYSQL_PASSWORD="
if exist "D:\MySQL\.root-password.txt" for /f "usebackq delims=" %%A in ("D:\MySQL\.root-password.txt") do set "FUFU_MYSQL_PASSWORD=%%A"
if not defined FUFU_MYSQL_PASSWORD set /p FUFU_MYSQL_PASSWORD=  MySQL password: 

rem ---------------------------------------------------------------- mysql up?
netstat -ano -p tcp | findstr /C:":3306" | findstr /C:"LISTENING" >nul
if errorlevel 1 (
  echo   WARNING: nothing is listening on 3306 - MySQL looks down.
  echo   Run setup-once.bat once ^(it registers MySQL as a Windows service^).
  echo.
)

echo   Server is starting. KEEP THIS WINDOW OPEN while the app is in use.
echo   On this computer : http://localhost:8000
echo   On your tablet   : http://192.168.5.72:8000   ^(same WiFi^)
echo.
echo   Press Ctrl+C to stop the server.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-fufu.ps1"

echo.
echo   Server stopped.
pause
