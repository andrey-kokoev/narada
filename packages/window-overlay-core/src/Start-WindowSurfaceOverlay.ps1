param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [ValidateSet('always', 'windows-terminal')][string]$VisibilityPolicy = 'windows-terminal',
    [int]$RefreshSeconds = 2
)
$ErrorActionPreference = 'Stop'
$hostScript = Join-Path $PSScriptRoot 'window-surface-overlay.ps1'
if (-not (Test-Path $hostScript)) { throw 'window_surface_overlay_host_script_missing' }
New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
$pidPath = Join-Path $StateRoot 'overlay.pid'
$refreshPath = Join-Path $StateRoot 'refresh.signal'
$hostStdoutPath = Join-Path $StateRoot 'host.stdout.log'
$hostStderrPath = Join-Path $StateRoot 'host.stderr.log'
function Get-HostProcess {
    if (-not (Test-Path $pidPath)) { return $null }
    $raw = (Get-Content -Raw -Path $pidPath).Trim()
    $overlayPid = 0
    if (-not [int]::TryParse($raw, [ref]$overlayPid) -or $overlayPid -le 0) { return $null }
    $process = Get-Process -Id $overlayPid -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    try {
        $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$overlayPid" -ErrorAction Stop).CommandLine
        if ($commandLine -notlike '*window-surface-overlay.ps1*') { return $null }
    } catch {
        if ($process.ProcessName -notin @('pwsh', 'powershell')) { return $null }
    }
    return $process
}
$existing = Get-HostProcess
if ($existing) {
    Set-Content -Path $refreshPath -Value ([DateTime]::UtcNow.ToString('o'))
    [pscustomobject]@{ schema = 'narada.window_surface_overlay.result.v1'; id = $Id; state = 'already_running'; pid = $existing.Id; state_directory = $StateRoot } | ConvertTo-Json -Compress
    exit 0
}
if (Test-Path $pidPath) { Remove-Item $pidPath -Force -ErrorAction SilentlyContinue }
$shell = Get-Command pwsh, powershell -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $shell) { throw 'powershell_runtime_not_found' }
$childArgs = @(
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', $hostScript,
    '-Id', $Id,
    '-StateRoot', $StateRoot,
    '-RefreshSeconds', [string]$RefreshSeconds,
    '-VisibilityPolicy', $VisibilityPolicy,
    '-HostProcess'
)
$child = Start-Process -WindowStyle Hidden -FilePath $shell.Source -ArgumentList $childArgs -RedirectStandardOutput $hostStdoutPath -RedirectStandardError $hostStderrPath -PassThru
$deadline = [DateTime]::UtcNow.AddSeconds(5)
$running = $null
do {
    Start-Sleep -Milliseconds 100
    $running = Get-HostProcess
    if ($child.HasExited -and -not $running) {
        $detail = if (Test-Path $hostStderrPath) { (Get-Content -Raw -Path $hostStderrPath).Trim() } else { '' }
        if (-not $detail -and (Test-Path $hostStdoutPath)) { $detail = (Get-Content -Raw -Path $hostStdoutPath).Trim() }
        throw ('window_surface_overlay_host_failed:' + ($detail -replace '\s+', ' ').Trim())
    }
} while (-not $running -and [DateTime]::UtcNow -lt $deadline)
if (-not $running) { throw 'window_surface_overlay_start_timeout' }
[pscustomobject]@{ schema = 'narada.window_surface_overlay.result.v1'; id = $Id; state = 'started'; pid = $running.Id; state_directory = $StateRoot } | ConvertTo-Json -Compress