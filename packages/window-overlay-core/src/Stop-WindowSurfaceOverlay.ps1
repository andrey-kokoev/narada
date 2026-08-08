param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$StateRoot
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'WindowSurfaceOverlayCoordinator.ps1')
$pidPath = Join-Path $StateRoot 'overlay.pid'
$focusPath = Join-Path $StateRoot 'focus.signal'
$surfaceRoot = Split-Path -Parent -Path $StateRoot
function Write-StoppedOverlayState {
    $runtime = Read-OverlaySurfaceJson (Join-Path $StateRoot 'visibility.state.json') $null
    $policy = if ($runtime -and $runtime.policy) {
        try { Normalize-OverlayVisibilityPolicy ([string]$runtime.policy) } catch { 'terminal-group' }
    } else { (Read-OverlayPresencePolicySelection -StateRoot $StateRoot -FallbackPolicy 'terminal-group').policy }
    $reason = if ($runtime -and $runtime.visibility_reason) { [string]$runtime.visibility_reason } else { 'not_projected' }
    $zOrder = if ($runtime -and $runtime.z_order) { [string]$runtime.z_order } else { 'topmost' }
    $revision = if ($runtime -and $runtime.surface_revision) { [int]$runtime.surface_revision } else { $null }
    try {
        Write-OverlayRuntimeState -StateRoot $StateRoot -Id $Id -Policy $policy -Lifecycle 'stopped' -Visibility 'hidden' -DesiredVisibility 'hidden' -VisibilityReason $reason -ZOrder $zOrder -Focus 'inactive' -ProcessId $null -SurfaceRevision $revision
    } catch {}
}
if (-not (Test-Path $pidPath)) {
    Remove-Item $focusPath -Force -ErrorAction SilentlyContinue
    Write-StoppedOverlayState
    Clear-OverlayFocusOwner -SurfaceRoot $surfaceRoot -Id $Id
    [pscustomobject]@{ schema = 'narada.window_surface_overlay.result.v1'; id = $Id; state = 'stopped'; pid = $null } | ConvertTo-Json -Compress
    exit 0
}
$raw = (Get-Content -Raw -Path $pidPath).Trim()
$overlayPid = 0
if (-not [int]::TryParse($raw, [ref]$overlayPid) -or $overlayPid -le 0) {
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
    Remove-Item $focusPath -Force -ErrorAction SilentlyContinue
    Write-StoppedOverlayState
    Clear-OverlayFocusOwner -SurfaceRoot $surfaceRoot -Id $Id
    [pscustomobject]@{ schema = 'narada.window_surface_overlay.result.v1'; id = $Id; state = 'stopped'; pid = $null } | ConvertTo-Json -Compress
    exit 0
}
$process = Get-Process -Id $overlayPid -ErrorAction SilentlyContinue
if ($process) {
    try {
        $commandLine = [string](Get-CimInstance Win32_Process -Filter "ProcessId=$overlayPid" -ErrorAction Stop).CommandLine
        if ($commandLine) {
            if ($commandLine -notlike '*window-surface-overlay.ps1*') { throw 'overlay_pid_not_owned' }
        } elseif ($process.ProcessName -notin @('pwsh', 'powershell')) {
            throw 'overlay_pid_not_owned'
        }
    } catch {
        if ($_.Exception.Message -eq 'overlay_pid_not_owned') { throw }
    }
    Stop-Process -Id $overlayPid -Force -ErrorAction SilentlyContinue
}
Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
Remove-Item $focusPath -Force -ErrorAction SilentlyContinue
Write-StoppedOverlayState
Clear-OverlayFocusOwner -SurfaceRoot $surfaceRoot -Id $Id
[pscustomobject]@{ schema = 'narada.window_surface_overlay.result.v1'; id = $Id; state = 'stopped'; pid = $overlayPid } | ConvertTo-Json -Compress
