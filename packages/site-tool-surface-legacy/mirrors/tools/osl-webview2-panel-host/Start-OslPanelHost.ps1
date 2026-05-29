param(
    [string]$PayloadPath = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\osl-panel-payload.json",
    [string]$PidFile = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\osl-webview2-panel-host.pid"
)

$ErrorActionPreference = "Stop"

$hostExe = Join-Path $PSScriptRoot "app\osl-webview2-panel-host.exe"
if (!(Test-Path $hostExe)) {
    throw "OSL WebView2 panel host executable not found: $hostExe. Run Install-OslPanelHost.ps1 first."
}
$runtimeDir = Split-Path -Parent $PidFile
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

Start-Process -FilePath $hostExe -ArgumentList @(
    "run",
    "--payload", $PayloadPath,
    "--pid-file", $PidFile
) | Out-Null

Write-Host "Started OSL WebView2 panel host for $PayloadPath"
