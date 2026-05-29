param(
    [string]$PayloadPath = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\osl-panel-payload.json",
    [string]$PidFile = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\osl-webview2-panel-host.pid"
)

$ErrorActionPreference = "Stop"

$hostExe = Join-Path $PSScriptRoot "app\osl-webview2-panel-host.exe"
if (!(Test-Path $hostExe)) {
    throw "OSL WebView2 panel host executable not found: $hostExe. Run Install-OslPanelHost.ps1 first."
}
& $hostExe status --payload $PayloadPath --pid-file $PidFile

if (Test-Path $PidFile) {
    $pidValue = Get-Content $PidFile -ErrorAction SilentlyContinue
    Write-Host "pid_file_present=$true pid=$pidValue"
} else {
    Write-Host "pid_file_present=$false"
}
