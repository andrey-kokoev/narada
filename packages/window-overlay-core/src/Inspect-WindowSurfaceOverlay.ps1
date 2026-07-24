param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$StateRoot
)
$ErrorActionPreference = 'Stop'
$documentPath = Join-Path $StateRoot 'document.json'
$pidPath = Join-Path $StateRoot 'overlay.pid'
$document = if (Test-Path $documentPath) { Get-Content -Raw -Path $documentPath | ConvertFrom-Json } else { $null }
$pid = $null
$state = 'stopped'
if (Test-Path $pidPath) {
    $raw = (Get-Content -Raw -Path $pidPath).Trim()
    $candidate = 0
    if ([int]::TryParse($raw, [ref]$candidate)) {
        $process = Get-Process -Id $candidate -ErrorAction SilentlyContinue
        if ($process) { $pid = $candidate; $state = 'running' }
    }
}
[pscustomobject]@{
    schema = 'narada.window_surface_overlay.result.v1'
    id = $Id
    state = $state
    pid = $pid
    state_directory = $StateRoot
    document = $document
} | ConvertTo-Json -Depth 12