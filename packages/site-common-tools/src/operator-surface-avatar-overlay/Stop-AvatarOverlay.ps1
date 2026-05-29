param(
    [string]$PidFile = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\operator-surface-avatar-overlay.pid"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $PidFile -PathType Leaf)) {
    Write-Host "not running"
    return
}

$pidText = [string](Get-Content -LiteralPath $PidFile -Raw).Trim()
$process = if ($pidText) { Get-Process -Id $pidText -ErrorAction SilentlyContinue } else { $null }
if ($process) {
    Stop-Process -Id $process.Id -Force
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "stopped pid $pidText"
} else {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "not running"
}
