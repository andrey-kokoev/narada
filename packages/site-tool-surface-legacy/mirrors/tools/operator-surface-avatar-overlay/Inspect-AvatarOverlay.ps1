param(
    [string]$RuntimePath = $(Join-Path $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }) 'operator-surfaces\avatar-overlay-runtime.json'),
    [string]$PidFile = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\operator-surface-avatar-overlay.pid"
)

$ErrorActionPreference = "Stop"

$pidText = $null
$running = $false
if (Test-Path -LiteralPath $PidFile -PathType Leaf) {
    $pidText = [string](Get-Content -LiteralPath $PidFile -Raw).Trim()
    $running = $null -ne (Get-Process -Id $pidText -ErrorAction SilentlyContinue)
}

$runtime = $null
if (Test-Path -LiteralPath $RuntimePath -PathType Leaf) {
    $runtime = Get-Content -LiteralPath $RuntimePath -Raw | ConvertFrom-Json
}

[ordered]@{
    schema = "narada.operator_surface.avatar_overlay.inspect.v0"
    running = $running
    pid = $pidText
    runtime_path = $RuntimePath
    runtime_exists = (Test-Path -LiteralPath $RuntimePath -PathType Leaf)
    entry_count = if ($runtime) { @($runtime.entries).Count } else { 0 }
    visible_count = if ($runtime) { @($runtime.entries | Where-Object { $_.visible -eq $true }).Count } else { 0 }
    diagnostics = if ($runtime) { @($runtime.diagnostics) } else { @() }
} | ConvertTo-Json -Depth 20
