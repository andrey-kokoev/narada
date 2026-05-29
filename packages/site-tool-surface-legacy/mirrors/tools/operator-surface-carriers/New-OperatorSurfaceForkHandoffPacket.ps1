param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [Parameter(Mandatory = $true)]
    [string]$ParentIdentity,
    [Parameter(Mandatory = $true)]
    [string]$ChildIdentity,
    [Parameter(Mandatory = $true)]
    [string]$TargetSiteRoot,
    [string]$AuthorityLocus = "unspecified",
    [string]$RuntimeBindingLocus,
    [string[]]$InheritedContextRefs = @(
        "operator-surface identity is durable personal/site-agent id; role is metadata",
        "explicit Operator declaration outranks self inference",
        "User/PC runtime binding split applies",
        "canonical inbox/task/lifecycle surfaces should be used instead of direct state edits"
    ),
    [string[]]$NonInheritedContext = @(
        "parent active task ownership",
        "parent identity",
        "parent roster assignment",
        "parent Site authority unless explicitly crossed"
    ),
    [string[]]$FirstActions = @(
        "validate or admit child identity",
        "bind focused surface explicitly as child identity through owning runtime locus",
        "inspect target Site inbox/workboard/evidence posture",
        "do not use self unless no explicit declared identity exists and exact-one self resolution is proven"
    ),
    [string[]]$KnownHazards = @(
        "path-derived ugly identity may already exist and should be migrated, not multiplied",
        "target Site sync posture may differ from the parent Site",
        "client artifacts outside the Site authority root are not admitted authority by default"
    ),
    [string[]]$SourceEnvelopeIds = @(),
    [string]$OutputPath,
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

function Assert-ConcreteIdentity {
    param([string]$Identity, [string]$Field)
    if ([string]::IsNullOrWhiteSpace($Identity)) {
        throw "$Field is required."
    }
    if ($Identity -match '[\\/:]' -or $Identity -match '\s') {
        throw "$Field must be a concrete identity, not a path or free text: $Identity"
    }
}

Assert-ConcreteIdentity -Identity $ParentIdentity -Field "parent_identity"
Assert-ConcreteIdentity -Identity $ChildIdentity -Field "child_identity"
if ([string]::IsNullOrWhiteSpace($TargetSiteRoot)) {
    throw "target_site_root is required."
}

$labelPath = Join-Path $UserSiteRoot "operator-surfaces\window-labels.json"
if (-not $RuntimeBindingLocus) {
    if (Test-Path -LiteralPath $labelPath) {
        $labels = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($labelPath))
        $RuntimeBindingLocus = [string]$labels.runtime_binding_path
    }
}
if ([string]::IsNullOrWhiteSpace($RuntimeBindingLocus)) {
    throw "runtime_binding_locus could not be inferred; pass -RuntimeBindingLocus."
}

$packetId = "fork_handoff_{0}_{1}" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
$packet = [ordered]@{
    schema = "narada.operator_surfaces.fork_handoff_packet.v0"
    packet_id = $packetId
    created_at = [datetimeoffset]::UtcNow.ToString("o")
    created_by = $ParentIdentity
    parent_identity = $ParentIdentity
    child_identity = $ChildIdentity
    target_site_root = $TargetSiteRoot
    authority_locus = $AuthorityLocus
    runtime_binding_locus = $RuntimeBindingLocus
    identity_rule = "operator_declared_concrete_identity_outranks_self_inference"
    inherited_context_refs = @($InheritedContextRefs)
    non_inherited_context = @($NonInheritedContext)
    first_actions = @($FirstActions)
    known_hazards = @($KnownHazards)
    source_envelope_ids = @($SourceEnvelopeIds)
}

if ($OutputPath) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($OutputPath, (ConvertTo-NaradaJson $packet), $utf8NoBom)
}

if ($PassThru -or -not $OutputPath) {
    ConvertTo-NaradaJson $packet
} else {
    Write-Host "Fork handoff packet written: $OutputPath"
}
