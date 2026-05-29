param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },
    [Parameter(Mandatory = $true)]
    [string]$PacketPath,
    [Parameter(Mandatory = $true)]
    [string]$ChildIdentity,
    [string]$TargetSiteRoot,
    [string]$RuntimeBindingLocus,
    [switch]$AllowUnadmittedIdentity,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([string]$Json)
    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Json | ConvertFrom-Json -Depth 100
    }
    return $Json | ConvertFrom-Json
}

function ConvertTo-NaradaJson {
    param($Value)
    $command = Get-Command ConvertTo-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Value | ConvertTo-Json -Depth 100
    }
    return $Value | ConvertTo-Json
}

function Add-Finding {
    param([System.Collections.Generic.List[string]]$Findings, [string]$Finding)
    [void]$Findings.Add($Finding)
}

if (-not (Test-Path -LiteralPath $PacketPath)) {
    throw "fork_handoff_packet_not_found: $PacketPath"
}

$packet = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($PacketPath))
$findings = [System.Collections.Generic.List[string]]::new()

if ([string]$packet.schema -ne "narada.operator_surfaces.fork_handoff_packet.v0") {
    Add-Finding $findings "packet_schema_invalid"
}
if ([string]$packet.child_identity -ne $ChildIdentity) {
    Add-Finding $findings "child_identity_conflict: packet=$($packet.child_identity); requested=$ChildIdentity"
}
if ($TargetSiteRoot -and ([string]$packet.target_site_root -ne $TargetSiteRoot)) {
    Add-Finding $findings "target_site_root_conflict: packet=$($packet.target_site_root); requested=$TargetSiteRoot"
}
if ($RuntimeBindingLocus -and ([string]$packet.runtime_binding_locus -ne $RuntimeBindingLocus)) {
    Add-Finding $findings "runtime_binding_locus_conflict: packet=$($packet.runtime_binding_locus); requested=$RuntimeBindingLocus"
}
if ([string]$packet.identity_rule -ne "operator_declared_concrete_identity_outranks_self_inference") {
    Add-Finding $findings "identity_rule_missing_or_invalid"
}
if ([string]$packet.child_identity -match '[\\/:]' -or [string]$packet.child_identity -match '\s') {
    Add-Finding $findings "child_identity_not_concrete"
}

$identityPath = Join-Path $UserSiteRoot "operator-surfaces\identities.json"
$admitted = $false
if (Test-Path -LiteralPath $identityPath) {
    $identities = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($identityPath))
    $admitted = [string]$packet.child_identity -in @($identities.identities | ForEach-Object { [string]$_.identity_name })
}
if (-not $admitted -and -not $AllowUnadmittedIdentity) {
    Add-Finding $findings "child_identity_not_admitted"
}

$status = if ($findings.Count -eq 0) { "adopted" } else { "repair_required" }
$evidenceId = "fork_adoption_{0}_{1}" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
$evidence = [ordered]@{
    schema = "narada.operator_surfaces.fork_adoption_evidence.v0"
    evidence_id = $evidenceId
    observed_at = [datetimeoffset]::UtcNow.ToString("o")
    packet_id = [string]$packet.packet_id
    packet_path = $PacketPath
    parent_identity = [string]$packet.parent_identity
    child_identity = [string]$packet.child_identity
    requested_child_identity = $ChildIdentity
    target_site_root = [string]$packet.target_site_root
    authority_locus = [string]$packet.authority_locus
    runtime_binding_locus = [string]$packet.runtime_binding_locus
    identity_rule = [string]$packet.identity_rule
    child_identity_admitted = $admitted
    status = $status
    findings = @($findings)
    repair = if ($findings.Count -eq 0) { $null } else { "Use the packet child_identity/target_site_root/runtime_binding_locus, or request a corrected fork handoff packet. Do not fall back to --as self while a concrete child identity is declared." }
}

$evidenceDir = Join-Path $PcSiteRoot "runtime\operator-surface-fork-adoptions"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
$evidencePath = Join-Path $evidenceDir ($evidenceId + ".json")
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($evidencePath, (ConvertTo-NaradaJson $evidence), $utf8NoBom)

if ($status -ne "adopted") {
    if ($PassThru) {
        ConvertTo-NaradaJson $evidence
    }
    throw "fork_adoption_repair_required: $($findings -join '; ')"
}

if ($PassThru) {
    ConvertTo-NaradaJson $evidence
} else {
    Write-Host "Fork handoff adopted. Evidence: $evidencePath"
}
