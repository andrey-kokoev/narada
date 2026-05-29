param(
    [string]$PcSiteRoot = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2"
)

$ErrorActionPreference = "Stop"

$targetDir = Join-Path $PcSiteRoot "tools\operator-surface-avatar-overlay"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

foreach ($file in @(
    "operator-surface-avatar-overlay.csproj",
    "Program.cs",
    "Start-AvatarOverlay.ps1",
    "Stop-AvatarOverlay.ps1",
    "Inspect-AvatarOverlay.ps1"
)) {
    Copy-Item -Force -Path (Join-Path $PSScriptRoot $file) -Destination $targetDir
}

Write-Host "Installed avatar overlay companion source to $targetDir"
