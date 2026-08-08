param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [ValidateSet('always', 'terminal-group', 'hidden', 'windows-terminal')][string]$VisibilityPolicy = 'terminal-group',
    [int]$RefreshSeconds = 2,
    [int]$StartupTimeoutSeconds = 30
)
$ErrorActionPreference = 'Stop'
if ($StartupTimeoutSeconds -lt 1 -or $StartupTimeoutSeconds -gt 120) { throw 'window_surface_overlay_startup_timeout_invalid' }
$hostScript = Join-Path $PSScriptRoot 'window-surface-overlay.ps1'
if (-not (Test-Path $hostScript)) { throw 'window_surface_overlay_host_script_missing' }
. (Join-Path $PSScriptRoot 'WindowSurfaceOverlayCoordinator.ps1')
New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
$pidPath = Join-Path $StateRoot 'overlay.pid'
$refreshPath = Join-Path $StateRoot 'refresh.signal'
$visibilityPolicyPath = Join-Path $StateRoot 'visibility.policy'
$hostStdoutPath = Join-Path $StateRoot 'host.stdout.log'
$hostStderrPath = Join-Path $StateRoot 'host.stderr.log'
$surfaceRoot = Get-OverlaySurfaceRoot $StateRoot
function Get-HostProcess {
    if (-not (Test-Path $pidPath)) { return $null }
    $raw = (Get-Content -Raw -Path $pidPath).Trim()
    $overlayPid = 0
    if (-not [int]::TryParse($raw, [ref]$overlayPid) -or $overlayPid -le 0) { return $null }
    $process = Get-Process -Id $overlayPid -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    try {
        $commandLine = [string](Get-CimInstance Win32_Process -Filter "ProcessId=$overlayPid" -ErrorAction Stop).CommandLine
        if ($commandLine) {
            if ($commandLine -notlike '*window-surface-overlay.ps1*') { return $null }
        } elseif ($process.ProcessName -notin @('pwsh', 'powershell')) {
            return $null
        }
    } catch {
        if ($process.ProcessName -notin @('pwsh', 'powershell')) { return $null }
    }
    return $process
}
function Stop-HostForPolicyChange {
    param([Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process)
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    $stillRunning = Get-Process -Id $Process.Id -ErrorAction SilentlyContinue
    while ($stillRunning -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 100
        $stillRunning = Get-Process -Id $Process.Id -ErrorAction SilentlyContinue
    }
    if ($stillRunning) { throw 'window_surface_overlay_policy_change_timeout' }
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
}
$requestedPolicy = Normalize-OverlayVisibilityPolicy $VisibilityPolicy
$selection = Read-OverlayPresencePolicySelection -StateRoot $StateRoot -FallbackPolicy $requestedPolicy
$effectivePolicy = [string]$selection.policy
$storedPolicy = if (Test-Path (Join-Path $StateRoot 'visibility.state.json')) {
    $runtime = Read-OverlaySurfaceJson (Join-Path $StateRoot 'visibility.state.json') $null
    try { if ($runtime -and $runtime.policy) { Normalize-OverlayVisibilityPolicy ([string]$runtime.policy) } else { $effectivePolicy } } catch { $effectivePolicy }
} else { $effectivePolicy }
$existing = Get-HostProcess
if ($existing) {
    if ($storedPolicy -eq $effectivePolicy) {
        Set-Content -Path $refreshPath -Value ([DateTime]::UtcNow.ToString('o'))
        [pscustomobject]@{ schema = 'narada.window_surface_overlay.result.v1'; id = $Id; state = 'already_running'; pid = $existing.Id; state_directory = $StateRoot } | ConvertTo-Json -Compress
        exit 0
    }
    Stop-HostForPolicyChange $existing
}
Set-Content -Path $visibilityPolicyPath -Value $effectivePolicy
Write-OverlayRuntimeState -StateRoot $StateRoot -Id $Id -Policy $effectivePolicy -Lifecycle 'starting' -Visibility 'unknown' -DesiredVisibility 'unknown' -VisibilityReason 'not_projected' -ZOrder 'topmost' -Focus 'inactive'
if (Test-Path $pidPath) { Remove-Item $pidPath -Force -ErrorAction SilentlyContinue }
$shell = Get-Command pwsh, powershell -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $shell) { throw 'powershell_runtime_not_found' }
$childArgs = @(
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', $hostScript,
    '-Id', $Id,
    '-StateRoot', $StateRoot,
    '-RefreshSeconds', [string]$RefreshSeconds,
    '-VisibilityPolicy', $effectivePolicy,
    '-HostProcess'
)
$child = Start-Process -WindowStyle Hidden -FilePath $shell.Source -ArgumentList $childArgs -PassThru
# PresentationFramework can take several seconds to load on a cold PowerShell
# process. Wait for the durable PID and running-state markers within one total
# startup budget instead of giving each phase an independent timeout.
$startupDeadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
$running = $null
do {
    Start-Sleep -Milliseconds 100
    $running = Get-HostProcess
    if ($child.HasExited -and -not $running) {
        $detail = if (Test-Path $hostStderrPath) { (Get-Content -Raw -Path $hostStderrPath).Trim() } else { '' }
        if (-not $detail -and (Test-Path $hostStdoutPath)) { $detail = (Get-Content -Raw -Path $hostStdoutPath).Trim() }
        throw ('window_surface_overlay_host_failed:' + ($detail -replace '\s+', ' ').Trim())
    }
} while (-not $running -and [DateTime]::UtcNow -lt $startupDeadline)
if (-not $running) { throw 'window_surface_overlay_start_timeout' }
$runtimeStatePath = Join-Path $StateRoot 'visibility.state.json'
$runtimeState = $null
do {
    Start-Sleep -Milliseconds 100
    $runtimeState = if (Test-Path -LiteralPath $runtimeStatePath) { Read-OverlaySurfaceJson $runtimeStatePath $null } else { $null }
    if ($runtimeState -and $runtimeState.lifecycle -eq 'failed') {
        throw ('window_surface_overlay_host_failed:' + [string]$runtimeState.detail)
    }
} while ((-not $runtimeState -or $runtimeState.lifecycle -ne 'running') -and [DateTime]::UtcNow -lt $startupDeadline)
if (-not $runtimeState -or $runtimeState.lifecycle -ne 'running') { throw 'window_surface_overlay_runtime_start_timeout' }
[pscustomobject]@{ schema = 'narada.window_surface_overlay.result.v1'; id = $Id; state = 'started'; pid = $running.Id; state_directory = $StateRoot } | ConvertTo-Json -Compress
