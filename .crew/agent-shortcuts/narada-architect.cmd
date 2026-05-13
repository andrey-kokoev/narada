@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "SITE_ROOT=%SCRIPT_DIR%..\.."
set "CARRIER=%SITE_ROOT%\tools\operator-surface-carriers\windows-glue\Start-NaradaArchitect.ps1"

if /I "%~1"=="--no-codex" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CARRIER%" -NoCodex
  exit /b %ERRORLEVEL%
)

start "Narada Architect" powershell.exe -NoExit -ExecutionPolicy Bypass -File "%CARRIER%"
exit /b 0
