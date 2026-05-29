# Setup vendor directory from Narada proper built packages
# Run this after building @narada2/task-governance in D:\code\narada

$ErrorActionPreference = "Stop"
$vendor = Join-Path $PSScriptRoot "vendor"
$srcRoot = "D:\code\narada"

$pkgs = @(
    @{name="task-governance"; path="packages\task-governance"},
    @{name="control-plane"; path="packages\layers\control-plane"},
    @{name="intent-zones"; path="packages\intent-zones"},
    @{name="charters"; path="packages\domains\charters"}
)

foreach ($p in $pkgs) {
    $dst = Join-Path $vendor $p.name
    $src = Join-Path $srcRoot $p.path
    if (-not (Test-Path -LiteralPath $src)) { throw "Source missing: $src" }
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    Copy-Item -Path "$src\dist" -Destination $dst -Recurse -Force
    Copy-Item -Path "$src\package.json" -Destination $dst -Force
}

# Rewrite workspace:* to file: references
$tg = Get-Content (Join-Path $vendor "task-governance\package.json") | ConvertFrom-Json
$tg.dependencies.'@narada2/control-plane' = 'file:' + (Join-Path $vendor 'control-plane').Replace('\', '/')
$tg.dependencies.'@narada2/intent-zones' = 'file:' + (Join-Path $vendor 'intent-zones').Replace('\', '/')
$tg | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $vendor "task-governance\package.json")

$cp = Get-Content (Join-Path $vendor "control-plane\package.json") | ConvertFrom-Json
$cp.dependencies.'@narada2/charters' = 'file:' + (Join-Path $vendor 'charters').Replace('\', '/')
$cp | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $vendor "control-plane\package.json")

Write-Host "Vendor setup complete. Run 'pnpm install' in tools/task-lifecycle/"
