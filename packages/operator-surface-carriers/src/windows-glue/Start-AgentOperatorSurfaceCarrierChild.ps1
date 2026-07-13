#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [Parameter(Mandatory = $true)]
    [string]$IdentityName,
    [ValidateSet("codex", "kimi", "narada-agent-runtime-server")]
    [string]$Runtime = "codex",
    [Parameter(Mandatory = $true)]
    [ValidateSet("codex", "kimi", "agent-cli")]
    [string]$Carrier,
    [Parameter(Mandatory = $true)]
    [string]$CarrierId,
    [Parameter(Mandatory = $true)]
    [string]$ClaimPath
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "OperatorSurfaceCarrierLifecycle.ps1")

function Write-NaradaJsonFile {
    param(
        [string]$Path,
        [object]$Value
    )

    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $json = $Value | ConvertTo-Json -Depth 40
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

$claim = [ordered]@{
    schema = "narada.operator_surfaces.inhabited_carrier_claim.v0"
    carrier_id = $CarrierId
    process_id = $PID
    wt_session = $env:WT_SESSION
    identity_name = $IdentityName
    runtime = $Runtime
    runtime_substrate_kind = $Runtime
    carrier_kind = $Carrier
    claimed_at = (Get-Date -Format "o")
    lifecycle_schema = $NaradaOperatorSurfaceCarrierLifecycleSchema
    lifecycle_state = "claim_written"
    lifecycle_history = @("requested", "launching", "claim_written")
    single_tab_invariant_asserted = $true
    title_used_as_identity_proof = $false
}
Write-NaradaJsonFile -Path $ClaimPath -Value $claim

$launcher = Join-Path $UserSiteRoot "andrey-user.ps1"
if (-not (Test-Path -LiteralPath $launcher)) {
    throw "andrey_user_launcher_missing: $launcher"
}

& $launcher agent-start -Agent $IdentityName -Carrier $Carrier -Runtime $Runtime -Exec
exit $LASTEXITCODE
