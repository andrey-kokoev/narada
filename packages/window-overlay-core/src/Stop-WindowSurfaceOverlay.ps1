param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$StateRoot
)
$ErrorActionPreference = 'Stop'
$pidPath = Join-Path $StateRoot 'overlay.pid'
if (-not (Test-Path $pidPath)) {
    [pscustomobject]@{ schema = 'narada.window_surface_overlay.result.v1'; id = $Id; state = 'stopped'; pid = $null } | ConvertTo-Json -Compress
    exit 0
}
$raw = (Get-Content -Raw -Path $pidPath).Trim()
$overlayPid = 0
if (-not [int]::TryParse($raw, [ref]$overlayPid) -or $overlayPid -le 0) {
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
    [pscustomobject]@{ schema = 'narada.window_surface_overlay.result.v1'; id = $Id; state = 'stopped'; pid = $null } | ConvertTo-Json -Compress
    exit 0
}
$process = Get-Process -Id $overlayPid -ErrorAction SilentlyContinue
if ($process) {
    try {
        $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$overlayPid" -ErrorAction Stop).CommandLine
        if ($commandLine -notlike '*window-surface-overlay.ps1*') { throw 'overlay_pid_not_owned' }
    } catch {
        if ($_.Exception.Message -eq 'overlay_pid_not_owned') { throw }
    }
    Stop-Process -Id $overlayPid -Force -ErrorAction SilentlyContinue
}
Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
[pscustomobject]@{ schema = 'narada.window_surface_overlay.result.v1'; id = $Id; state = 'stopped'; pid = $overlayPid } | ConvertTo-Json -Compress