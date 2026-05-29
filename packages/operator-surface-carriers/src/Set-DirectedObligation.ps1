param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [ValidateSet("review_request", "builder_handoff", "inbox_handoff", "local_followup_nudge")]
    [string]$Kind = "local_followup_nudge",
    [string]$TargetIdentity,
    [string]$TargetRole,
    [string]$SourceKind = "agent_report",
    [string]$SourceRef,
    [int]$TaskNumber = 0,
    [string]$TaskId,
    [string]$ReportId,
    [string]$Summary,
    [string]$PayloadJson,
    [string]$DedupeKey,
    [string]$ConsumptionRuleJson,
    [string]$ObligationsPath,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([string]$Json)
    if ([string]::IsNullOrWhiteSpace($Json)) { return $null }
    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Json | ConvertFrom-Json -Depth 100 }
    return $Json | ConvertFrom-Json
}

function Write-JsonFile {
    param([string]$Path, [object]$Value)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $json = $Value | ConvertTo-Json -Depth 100
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Read-JsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($Path))
}

function Get-StableHash {
    param([string]$Value)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
        return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join "").Substring(0, 16)
    } finally {
        $sha.Dispose()
    }
}

if (-not $TargetIdentity -and -not $TargetRole) { throw "target_required" }
if ($TargetIdentity -and $TargetRole) { throw "target_must_be_identity_or_role_not_both" }
if (-not $SourceRef) { throw "source_ref_required" }
if (-not (Test-Path -LiteralPath $UserSiteRoot)) { throw "user_site_root_missing: $UserSiteRoot" }
$UserSiteRoot = (Resolve-Path -LiteralPath $UserSiteRoot).Path
if (-not $ObligationsPath) { $ObligationsPath = Join-Path $UserSiteRoot "operator-surfaces\directed-obligations.json" }

$store = Read-JsonFile $ObligationsPath
if (-not $store) {
    $store = [pscustomobject][ordered]@{
        schema = "narada.operator_surfaces.directed_obligations.v0"
        owner_site_id = "narada-andrey"
        obligations = @()
    }
}

$target = if ($TargetIdentity) {
    [ordered]@{ kind = "identity"; value = $TargetIdentity }
} else {
    [ordered]@{ kind = "role"; value = $TargetRole }
}

$payload = if ($PayloadJson) { ConvertFrom-NaradaJson $PayloadJson } else { [ordered]@{} }
if ($TaskNumber -gt 0) { $payload.task_number = $TaskNumber }
if ($TaskId) { $payload.task_id = $TaskId }
if ($ReportId) { $payload.report_id = $ReportId }
if ($Summary) { $payload.summary = $Summary }

if (-not $DedupeKey) {
    $DedupeKey = "{0}:{1}:{2}:{3}:{4}" -f $Kind, $target.kind, $target.value, $SourceKind, $SourceRef
    if ($TaskNumber -gt 0) { $DedupeKey = "${DedupeKey}:task-$TaskNumber" }
}

$now = Get-Date -Format "o"
$obligation = [ordered]@{
    obligation_id = "obl_" + (Get-StableHash $DedupeKey)
    kind = $Kind
    target = $target
    source = [ordered]@{
        kind = $SourceKind
        ref = $SourceRef
    }
    payload = $payload
    status = "open"
    created_at = $now
    updated_at = $now
    freshness = [ordered]@{}
    dedupe_key = $DedupeKey
    consumption_rule = if ($ConsumptionRuleJson) { ConvertFrom-NaradaJson $ConsumptionRuleJson } else { [ordered]@{ kind = "manual" } }
}
if ($TaskNumber -gt 0) { $obligation.task_number = $TaskNumber }
if ($ReportId) { $obligation.report_id = $ReportId }

$items = New-Object System.Collections.Generic.List[object]
$replaced = $false
foreach ($existing in @($store.obligations)) {
    if ([string]$existing.dedupe_key -eq $DedupeKey -or [string]$existing.obligation_id -eq [string]$obligation.obligation_id) {
        $existingCreated = if ($existing.created_at) { [string]$existing.created_at } else { $now }
        $obligation.created_at = $existingCreated
        $items.Add([pscustomobject]$obligation)
        $replaced = $true
    } else {
        $items.Add($existing)
    }
}
if (-not $replaced) { $items.Add([pscustomobject]$obligation) }
$store.obligations = @($items.ToArray())

Write-JsonFile -Path $ObligationsPath -Value $store

$result = [pscustomobject][ordered]@{
    status = if ($replaced) { "updated" } else { "created" }
    path = $ObligationsPath
    obligation = $obligation
}

if ($PassThru) { $result | ConvertTo-Json -Depth 80 } else { $result }
