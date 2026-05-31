# Quiet-by-default test entry point for the Rust agent-tui crate.
param(
  [switch]$Full,
  [switch]$VerboseOutput,
  [string]$Filter = 'mcp_runtime'
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')
$CrateRoot = Join-Path $RepoRoot 'packages\agent-tui'
$VsDevCmd = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'

if (-not (Test-Path -LiteralPath $VsDevCmd)) {
  throw "missing_vsdevcmd:$VsDevCmd"
}

$cargoArgs = @('test')
if (-not $VerboseOutput) {
  $cargoArgs += '--quiet'
}
if (-not $Full) {
  if ([string]::IsNullOrWhiteSpace($Filter)) {
    throw 'focused_test_filter_required'
  }
  $cargoArgs += $Filter
}

$quotedCargoArgs = $cargoArgs | ForEach-Object {
  if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
}
$cargoCommand = 'cargo ' + ($quotedCargoArgs -join ' ')
$testScope = if ($Full) { 'full' } else { "focused:$Filter" }

$cmd = "call `"$VsDevCmd`" -arch=x64 -host_arch=x64 >nul && cd /d `"$CrateRoot`" && cargo fmt -- --check && $cargoCommand"
$output = cmd /d /s /c $cmd 2>&1
$exitCode = $LASTEXITCODE

if ($VerboseOutput -or $exitCode -ne 0) {
  $output | ForEach-Object { Write-Host $_ }
}

if ($exitCode -ne 0) {
  exit $exitCode
}

Write-Host "agent-tui tests passed ($testScope)"

