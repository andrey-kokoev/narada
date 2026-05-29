param(
    [string]$PcSiteRoot = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2"
)

$ErrorActionPreference = "Stop"

$sourceExe = Join-Path $PSScriptRoot "target\release\narada-window-surface-overlay.exe"
if (-not (Test-Path $sourceExe)) {
    Push-Location $PSScriptRoot
    try {
        cargo build --release
    } finally {
        Pop-Location
    }
}

$targetDir = Join-Path $PcSiteRoot "tools\window-surface-overlay"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$existingExe = Join-Path $targetDir "narada-window-surface-overlay.exe"
if (Test-Path $existingExe) {
    & $existingExe --pid-file (Join-Path $PcSiteRoot "runtime\window-surface-overlay.pid") stop *> $null
    Start-Sleep -Milliseconds 500
}

Copy-Item -Force -Path $sourceExe -Destination (Join-Path $targetDir "narada-window-surface-overlay.exe")
Copy-Item -Force -Path (Join-Path $PSScriptRoot "Start-WindowSurfaceOverlay.ps1") -Destination $targetDir
Copy-Item -Force -Path (Join-Path $PSScriptRoot "Stop-WindowSurfaceOverlay.ps1") -Destination $targetDir
Copy-Item -Force -Path (Join-Path $PSScriptRoot "Inspect-WindowSurfaceOverlay.ps1") -Destination $targetDir

Write-Host "Installed window surface overlay to $targetDir"
