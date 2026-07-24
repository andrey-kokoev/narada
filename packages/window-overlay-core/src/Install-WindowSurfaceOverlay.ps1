param([Parameter(Mandatory = $true)][string]$TargetDirectory)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path $TargetDirectory -Force | Out-Null
$names = @('window-surface-overlay.ps1', 'Start-WindowSurfaceOverlay.ps1', 'Stop-WindowSurfaceOverlay.ps1', 'Inspect-WindowSurfaceOverlay.ps1')
foreach ($name in $names) {
    Copy-Item -Force -Path (Join-Path $PSScriptRoot $name) -Destination (Join-Path $TargetDirectory $name)
}
Write-Output ([pscustomobject]@{
    schema = 'narada.window_surface_overlay.install_result.v1'
    status = 'installed'
    target_directory = $TargetDirectory
    files = $names
} | ConvertTo-Json -Compress)