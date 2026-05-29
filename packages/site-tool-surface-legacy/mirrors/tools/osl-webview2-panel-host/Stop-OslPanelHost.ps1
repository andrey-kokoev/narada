param(
    [string]$PidFile = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\osl-webview2-panel-host.pid"
)

$ErrorActionPreference = "Stop"

$hostExe = Join-Path $PSScriptRoot "app\osl-webview2-panel-host.exe"
if (Test-Path $hostExe) {
    & $hostExe stop | Out-Null
}

if (Test-Path $PidFile) {
    $pidValue = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($pidValue) {
        Stop-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
    }
}

Write-Host "Stopped OSL WebView2 panel host"
