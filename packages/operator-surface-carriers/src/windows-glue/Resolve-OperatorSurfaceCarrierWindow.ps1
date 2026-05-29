#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$CarrierId,
    [Parameter(Mandatory = $true)]
    [string]$BeforeSnapshotPath,
    [Parameter(Mandatory = $true)]
    [string]$AfterSnapshotPath,
    [Parameter(Mandatory = $true)]
    [string]$ClaimPath,
    [int]$ClaimTimeoutSeconds = 10,
    [switch]$SkipLiveClaimProcessCheck,
    [switch]$NoThrow,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([Parameter(ValueFromPipeline = $true)]$Json)
    begin { $chunks = New-Object System.Collections.Generic.List[string] }
    process { if ($null -ne $Json) { $chunks.Add([string]$Json) } }
    end {
        $raw = $chunks -join [Environment]::NewLine
        $command = Get-Command ConvertFrom-Json
        if ($command.Parameters.ContainsKey("Depth")) { return $raw | ConvertFrom-Json -Depth 100 }
        return $raw | ConvertFrom-Json
    }
}

function Read-NaradaJsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return [System.IO.File]::ReadAllText($Path) | ConvertFrom-NaradaJson
}

function Complete-Result {
    param([object]$Result)
    $json = $Result | ConvertTo-Json -Depth 80
    if ($PassThru) {
        Write-Output $json
    } else {
        Write-Host $json
    }
    if ($Result.status -ne "resolved" -and -not $NoThrow) {
        throw "operator_surface_carrier_resolution_failed: $($Result.status)"
    }
}

$deadline = (Get-Date).AddSeconds($ClaimTimeoutSeconds)
$claim = $null
while ((Get-Date) -le $deadline) {
    $claim = Read-NaradaJsonFile -Path $ClaimPath
    if ($null -ne $claim) { break }
    Start-Sleep -Milliseconds 200
}

if ($null -eq $claim) {
    Complete-Result ([ordered]@{
        schema = "narada.operator_surfaces.carrier_resolution.v1"
        status = "missing_claim"
        carrier_id = $CarrierId
        claim_path = $ClaimPath
        title_used_as_binding_proof = $false
    })
    return
}

if ([string]$claim.schema -ne "narada.operator_surfaces.inhabited_carrier_claim.v0" -or [string]$claim.carrier_id -ne $CarrierId) {
    Complete-Result ([ordered]@{
        schema = "narada.operator_surfaces.carrier_resolution.v1"
        status = "claim_mismatch"
        carrier_id = $CarrierId
        claim_path = $ClaimPath
        claim = $claim
        title_used_as_binding_proof = $false
    })
    return
}

if ($claim.single_tab_invariant_asserted -ne $true -or $claim.title_used_as_identity_proof -ne $false) {
    Complete-Result ([ordered]@{
        schema = "narada.operator_surfaces.carrier_resolution.v1"
        status = "claim_policy_refused"
        carrier_id = $CarrierId
        claim_path = $ClaimPath
        claim = $claim
        title_used_as_binding_proof = $false
    })
    return
}

if (-not $SkipLiveClaimProcessCheck) {
    $claimProcess = Get-Process -Id ([int]$claim.process_id) -ErrorAction SilentlyContinue
    if (-not $claimProcess) {
        Complete-Result ([ordered]@{
            schema = "narada.operator_surfaces.carrier_resolution.v1"
            status = "stale_claim_process"
            carrier_id = $CarrierId
            claim_path = $ClaimPath
            claim = $claim
            title_used_as_binding_proof = $false
        })
        return
    }
}

$before = Read-NaradaJsonFile -Path $BeforeSnapshotPath
$after = Read-NaradaJsonFile -Path $AfterSnapshotPath
if ($null -eq $before -or $null -eq $after) {
    Complete-Result ([ordered]@{
        schema = "narada.operator_surfaces.carrier_resolution.v1"
        status = "missing_snapshot"
        carrier_id = $CarrierId
        before_snapshot_path = $BeforeSnapshotPath
        after_snapshot_path = $AfterSnapshotPath
        title_used_as_binding_proof = $false
    })
    return
}

$beforeHwnds = @{}
foreach ($window in @($before.windows)) {
    $beforeHwnds[[string]$window.hwnd] = $true
}

$newWindows = @()
foreach ($window in @($after.windows)) {
    if ($beforeHwnds.ContainsKey([string]$window.hwnd)) { continue }
    if ([string]$window.class -ne "CASCADIA_HOSTING_WINDOW_CLASS") { continue }
    if ($window.visible -ne $true) { continue }
    $newWindows += $window
}

if ($newWindows.Count -eq 0) {
    Complete-Result ([ordered]@{
        schema = "narada.operator_surfaces.carrier_resolution.v1"
        status = "missing_window"
        carrier_id = $CarrierId
        claim = $claim
        title_used_as_binding_proof = $false
    })
    return
}

if ($newWindows.Count -gt 1) {
    Complete-Result ([ordered]@{
        schema = "narada.operator_surfaces.carrier_resolution.v1"
        status = "ambiguous_window"
        carrier_id = $CarrierId
        claim = $claim
        candidate_windows = @($newWindows)
        title_used_as_binding_proof = $false
    })
    return
}

Complete-Result ([ordered]@{
    schema = "narada.operator_surfaces.carrier_resolution.v1"
    status = "resolved"
    carrier_id = $CarrierId
    claim = $claim
    resolved_window = $newWindows[0]
    title_used_as_binding_proof = $false
})
