[CmdletBinding()]
param(
  [string]$SiteRoot = "D:\code\narada",
  [switch]$DryRun,
  [switch]$NoCodex
)

$ErrorActionPreference = "Stop"

function Write-JsonLine {
  param([hashtable]$Object)
  $Object | ConvertTo-Json -Depth 12
}

$resolvedSiteRoot = (Resolve-Path -LiteralPath $SiteRoot).Path
$verifier = Join-Path $resolvedSiteRoot "tools\operator-surface-carriers\crew-launch-intent-sequence-verifier.mjs"
$planner = Join-Path $resolvedSiteRoot "tools\operator-surface-carriers\crew-launch-focus-bind-request-planner.mjs"
$evidenceDir = Join-Path $resolvedSiteRoot ".narada\crew\launch-executions"
$requestPath = Join-Path $resolvedSiteRoot ".narada\crew\launch-requests\narada-proper.crew.architect.startup-request.v0.launch-focus-bind-request.v0.json"

if (-not (Test-Path -LiteralPath $verifier)) { throw "launch_sequence_verifier_missing:$verifier" }
if (-not (Test-Path -LiteralPath $planner)) { throw "launch_request_planner_missing:$planner" }
if (-not (Test-Path -LiteralPath $requestPath)) { throw "launch_request_missing:$requestPath" }

$verifyJson = & node $verifier --site-root $resolvedSiteRoot
if ($LASTEXITCODE -ne 0) { throw "launch_sequence_verification_failed" }
$verify = $verifyJson | ConvertFrom-Json
if ($verify.status -ne "verified") { throw "launch_sequence_not_verified:$($verify.status)" }

$requestVerifyJson = & node $planner --site-root $resolvedSiteRoot --mode verify
if ($LASTEXITCODE -ne 0) { throw "launch_request_verification_failed" }
$requestVerify = $requestVerifyJson | ConvertFrom-Json
if ($requestVerify.status -ne "verified") { throw "launch_request_not_verified:$($requestVerify.status)" }

$pwshSurface = Join-Path $resolvedSiteRoot "narada.ps1"
$agentStart = $pwshSurface
if (-not (Test-Path -LiteralPath $pwshSurface)) { throw "narada_pwsh_surface_missing:$pwshSurface" }
$startedAt = (Get-Date).ToUniversalTime().ToString("o")
$evidence = [ordered]@{
  schema = "narada.crew_startup_shortcut.launch_execution_evidence.v0"
  status = $(if ($DryRun -or $NoCodex) { "verified_no_launch" } else { "launching_codex" })
  carrier_id = "narada-proper.carrier.crew-launch-focus-bind.v0"
  site_root = $resolvedSiteRoot
  sequence_path = (Join-Path $resolvedSiteRoot ".narada\crew\architect.launch-intent-sequence.json")
  request_path = $requestPath
  agent_start_carrier = $agentStart
  agent_start_command = ".\narada.ps1 agent-start -Agent narada.architect -Runtime codex -Exec"
  started_at = $startedAt
  dry_run = [bool]$DryRun
  no_codex = [bool]$NoCodex
  sequence_verification_status = $verify.status
  request_verification_status = $requestVerify.status
  not_claimed = @(
    "operator-surface runtime binding",
    "operator-surface runtime copying",
    "Desktop shortcut placement",
    "Start Menu shortcut placement",
    "source Site runtime state import",
    "native shell fallback"
  )
}

New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMddTHHmmss"
$evidencePath = Join-Path $evidenceDir "$stamp-narada-architect-launch-evidence.json"
$evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $evidencePath -Encoding UTF8

if ($DryRun -or $NoCodex) {
  $agentStartDryRun = & $pwshSurface agent-start -Agent narada.architect -Runtime codex -DryRun -Json
  if ($LASTEXITCODE -ne 0) { throw "agent_start_dry_run_failed" }
  Write-JsonLine @{ status = "verified_no_launch"; evidence_path = $evidencePath; agent_start_dry_run = ($agentStartDryRun | ConvertFrom-Json) }
  exit 0
}

Set-Location -LiteralPath $resolvedSiteRoot
Write-Host "Narada architect launch preflight verified."
Write-Host "Evidence: $evidencePath"
Write-Host "Starting Narada proper agent-start carrier in $resolvedSiteRoot"
& $pwshSurface agent-start -Agent narada.architect -Runtime codex -Exec
