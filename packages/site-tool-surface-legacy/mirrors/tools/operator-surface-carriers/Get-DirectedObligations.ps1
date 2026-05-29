param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$IdentityName,
    [string]$Role,
    [string]$ObligationsPath,
    [string]$IdentityRegistryPath,
    [string]$WorkboardFixturePath,
    [string]$WorkboardJson,
    [string]$TaskDbPath,
    [string]$NowIso,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([Parameter(ValueFromPipeline = $true)]$Json)
    begin { $chunks = New-Object System.Collections.Generic.List[string] }
    process { if ($null -ne $Json) { $chunks.Add([string]$Json) } }
    end {
        $raw = $chunks -join [Environment]::NewLine
        if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
        $command = Get-Command ConvertFrom-Json
        if ($command.Parameters.ContainsKey("Depth")) { return $raw | ConvertFrom-Json -Depth 100 }
        return $raw | ConvertFrom-Json
    }
}

function Get-Array {
    param($Value)
    if ($null -eq $Value) { return @() }
    if ($Value -is [System.Array]) { return @($Value) }
    return @($Value)
}

function Get-PropertyValue {
    param($Object, [string[]]$Names)
    if ($null -eq $Object) { return $null }
    foreach ($name in $Names) {
        if ($Object -and $Object.PSObject.Properties.Name -contains $name) { return $Object.$name }
    }
    return $null
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

function Read-JsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return [System.IO.File]::ReadAllText($Path) | ConvertFrom-NaradaJson
}

function Get-IdentityName {
    param($Identity)
    $id = Get-PropertyValue $Identity @("identity_id", "identity_name")
    if ($id) { return [string]$id }
    return $null
}

function Get-IdentityRole {
    param($Identity)
    $role = Get-PropertyValue $Identity @("role")
    if ($role) { return [string]$role }
    $roleMetadata = Get-PropertyValue $Identity @("role_metadata")
    $role = Get-PropertyValue $roleMetadata @("role")
    if ($role) { return [string]$role }
    return $null
}

function Get-TaskNumber {
    param($Object)
    $value = Get-PropertyValue $Object @("task_number", "taskNumber", "number", "task")
    if ($null -eq $value) { return $null }
    $parsed = 0
    if ([int]::TryParse([string]$value, [ref]$parsed)) { return $parsed }
    return $null
}

function Read-Workboard {
    if ($WorkboardJson) { return $WorkboardJson | ConvertFrom-NaradaJson }
    if (-not $WorkboardFixturePath) { return $null }
    return Read-JsonFile $WorkboardFixturePath
}

function Get-TaskStatusFromDb {
    param([int]$TaskNumber)
    if (-not $TaskDbPath -or -not (Test-Path -LiteralPath $TaskDbPath)) { return $null }
    $sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
    if (-not $sqlite) { return $null }
    $raw = & $sqlite.Source -noheader -batch $TaskDbPath "select status from task_lifecycle where task_number = $TaskNumber limit 1;" 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    if ($raw) { return [string](@($raw)[0]) }
    return $null
}

function Get-TaskStatusForConsumption {
    param($Workboard, [int]$TaskNumber)
    if ($TaskNumber -le 0) { return $null }
    if ($null -ne $Workboard) {
        $all = @()
        foreach ($name in @("pending_reviews", "in_progress", "local_followups", "tasks")) {
            $all += @(Get-Array (Get-PropertyValue $Workboard @($name)))
        }
        $task = @($all | Where-Object { (Get-TaskNumber $_) -eq $TaskNumber } | Select-Object -First 1)[0]
        if ($task) { return [string](Get-PropertyValue $task @("status")) }
    }
    return Get-TaskStatusFromDb -TaskNumber $TaskNumber
}

function Resolve-Target {
    param($Obligation, $Identities)
    $target = Get-PropertyValue $Obligation @("target")
    $kind = [string](Get-PropertyValue $target @("kind"))
    $value = [string](Get-PropertyValue $target @("value"))

    if ([string]::IsNullOrWhiteSpace($kind)) {
        $legacyIdentity = Get-PropertyValue $Obligation @("target_identity", "target_identity_name", "target_agent_id", "to_identity", "reviewer_identity", "reviewer")
        $legacyRole = Get-PropertyValue $Obligation @("target_role", "role")
        if ($legacyIdentity) {
            $kind = "identity"
            $value = [string]$legacyIdentity
        } elseif ($legacyRole) {
            $kind = "role"
            $value = [string]$legacyRole
        }
    }

    if ($kind -eq "identity") {
        $identity = @($Identities | Where-Object { (Get-IdentityName $_) -eq $value } | Select-Object -First 1)[0]
        return [ordered]@{
            kind = "identity"
            value = $value
            resolved_identities = if ($identity) { @($value) } else { @() }
            resolution_status = if ($identity) { "resolved" } else { "unknown_identity" }
        }
    }

    if ($kind -eq "role") {
        $matches = @($Identities | Where-Object { (Get-IdentityRole $_) -eq $value } | ForEach-Object { Get-IdentityName $_ })
        return [ordered]@{
            kind = "role"
            value = $value
            resolved_identities = @($matches)
            resolution_status = if ($matches.Count -eq 1) { "resolved" } elseif ($matches.Count -eq 0) { "unknown_role" } else { "ambiguous_role" }
        }
    }

    [ordered]@{
        kind = if ($kind) { $kind } else { "missing" }
        value = if ($value) { $value } else { $null }
        resolved_identities = @()
        resolution_status = "missing_target"
    }
}

function Test-TargetsRequest {
    param($ResolvedTarget)
    if (-not $IdentityName -and -not $Role) { return $true }
    if ($IdentityName -and (@($ResolvedTarget.resolved_identities) -contains $IdentityName)) { return $true }
    if ($Role -and [string]$ResolvedTarget.kind -eq "role" -and [string]$ResolvedTarget.value -eq $Role) { return $true }
    return $false
}

if (-not (Test-Path -LiteralPath $UserSiteRoot)) { throw "user_site_root_missing: $UserSiteRoot" }
$UserSiteRoot = (Resolve-Path -LiteralPath $UserSiteRoot).Path
if (-not $ObligationsPath) { $ObligationsPath = Join-Path $UserSiteRoot "operator-surfaces\directed-obligations.json" }
if (-not $IdentityRegistryPath) { $IdentityRegistryPath = Join-Path $UserSiteRoot "operator-surfaces\identities.json" }
$now = if ($NowIso) { [datetime]::Parse($NowIso) } else { Get-Date }

$identityRegistry = Read-JsonFile $IdentityRegistryPath
if (-not $identityRegistry) { throw "identity_registry_missing: $IdentityRegistryPath" }
$identities = @(Get-Array $identityRegistry.identities)
$store = Read-JsonFile $ObligationsPath
if (-not $store) {
    $store = [pscustomobject][ordered]@{
        schema = "narada.operator_surfaces.directed_obligations.v0"
        owner_site_id = [string]$identityRegistry.owner_site_id
        obligations = @()
    }
}
$workboard = Read-Workboard

$normalized = New-Object System.Collections.Generic.List[object]
$targeted = New-Object System.Collections.Generic.List[object]
$diagnostics = New-Object System.Collections.Generic.List[object]

foreach ($obligation in (Get-Array $store.obligations)) {
    $kind = [string](Get-PropertyValue $obligation @("kind"))
    $status = [string](Get-PropertyValue $obligation @("status"))
    if ([string]::IsNullOrWhiteSpace($status)) { $status = "open" }
    $target = Resolve-Target -Obligation $obligation -Identities $identities
    $source = Get-PropertyValue $obligation @("source")
    $payload = Get-PropertyValue $obligation @("payload")
    $taskNumber = Get-TaskNumber $obligation
    if (-not $taskNumber) { $taskNumber = Get-TaskNumber $payload }
    $consumptionRule = Get-PropertyValue $obligation @("consumption_rule")
    $effectiveStatus = $status
    $consumptionReason = $null
    if ($status -eq "open" -and $consumptionRule) {
        $ruleKind = [string](Get-PropertyValue $consumptionRule @("kind"))
        if ($ruleKind -eq "task_status_not_in") {
            $ruleTask = Get-TaskNumber $consumptionRule
            if (-not $ruleTask) { $ruleTask = $taskNumber }
            $openStatuses = @(Get-Array (Get-PropertyValue $consumptionRule @("open_statuses", "statuses")))
            if ($openStatuses.Count -eq 0) { $openStatuses = @("in_review") }
            $actualStatus = Get-TaskStatusForConsumption -Workboard $workboard -TaskNumber $ruleTask
            if ($actualStatus -and -not (@($openStatuses) -contains $actualStatus)) {
                $effectiveStatus = "consumed"
                $consumptionReason = "task_status_changed"
            } elseif (-not $actualStatus -and ($workboard -or ($TaskDbPath -and (Test-Path -LiteralPath $TaskDbPath)))) {
                $effectiveStatus = "consumed"
                $consumptionReason = "task_absent_from_workboard"
            }
        }
    }

    $freshness = Get-PropertyValue $obligation @("freshness")
    $notBefore = Get-PropertyValue $freshness @("not_before")
    $expiresAt = Get-PropertyValue $freshness @("expires_at")
    $notBeforeOk = $true
    $expired = $false
    if ($notBefore) {
        $notBeforeTime = [datetime]::Parse([string]$notBefore)
        $notBeforeOk = $now -ge $notBeforeTime
    }
    if ($expiresAt) {
        $expiresTime = [datetime]::Parse([string]$expiresAt)
        $expired = $now -gt $expiresTime
    }

    if ($target.resolution_status -in @("ambiguous_role", "unknown_role", "unknown_identity", "missing_target")) {
        $diagnostics.Add([ordered]@{
            kind = "directed_obligation_target_unresolved"
            obligation_id = Get-PropertyValue $obligation @("obligation_id")
            resolution_status = $target.resolution_status
            target = $target
        })
    }

    $id = [string](Get-PropertyValue $obligation @("obligation_id", "id"))
    $dedupe = [string](Get-PropertyValue $obligation @("dedupe_key"))
    if ([string]::IsNullOrWhiteSpace($dedupe)) {
        $dedupe = "{0}:{1}:{2}" -f $kind, $target.kind, $target.value
        if ($taskNumber) { $dedupe = "${dedupe}:task-$taskNumber" }
    }
    if ([string]::IsNullOrWhiteSpace($id)) { $id = "obl_" + (Get-StableHash $dedupe) }

    $record = [pscustomobject][ordered]@{
        obligation_id = $id
        kind = $kind
        status = $status
        effective_status = if ($expired -and $effectiveStatus -eq "open") { "expired" } else { $effectiveStatus }
        source = $source
        target = $target
        payload = $payload
        task_number = if ($taskNumber) { [int]$taskNumber } else { $null }
        report_id = Get-PropertyValue $obligation @("report_id", "source_report_id")
        created_at = [string](Get-PropertyValue $obligation @("created_at"))
        updated_at = [string](Get-PropertyValue $obligation @("updated_at"))
        freshness = $freshness
        due = ($effectiveStatus -eq "open" -and $notBeforeOk -and -not $expired -and $target.resolution_status -eq "resolved")
        dedupe_key = $dedupe
        consumption_rule = $consumptionRule
        consumption_reason = $consumptionReason
        authority = [ordered]@{
            site_owns_obligation = $true
            task_lifecycle_owns_task_status = $true
            projections_are_authority = $false
        }
    }
    $normalized.Add($record)
    if (Test-TargetsRequest -ResolvedTarget $target) { $targeted.Add($record) }
}

$result = [pscustomobject][ordered]@{
    schema = "narada.operator_surfaces.directed_obligations.view.v0"
    generated_at = $now.ToString("o")
    owner_site_id = [string]$store.owner_site_id
    source_path = $ObligationsPath
    identity_registry_path = $IdentityRegistryPath
    target_identity = if ($IdentityName) { $IdentityName } else { $null }
    target_role = if ($Role) { $Role } else { $null }
    obligations = @($normalized.ToArray())
    targeted_obligations = @($targeted.ToArray())
    due_obligations = @($targeted.ToArray() | Where-Object { $_.due -eq $true })
    diagnostics = @($diagnostics.ToArray())
}

if ($PassThru) { $result | ConvertTo-Json -Depth 80 } else { $result }
