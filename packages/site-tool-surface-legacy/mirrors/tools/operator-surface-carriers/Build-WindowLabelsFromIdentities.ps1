param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$OutputPath = $(Join-Path $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }) 'operator-surfaces\window-labels.json'),
    [string]$RuntimeBindingPath = $(if ($env:NARADA_PC_SITE_ROOT) { Join-Path $env:NARADA_PC_SITE_ROOT "runtime\operator-surface-window-bindings.json" } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\operator-surface-window-bindings.json" }),
    [string]$TaskDbPath = ""
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([string]$Json)

    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Json | ConvertFrom-Json -Depth 80
    }
    return $Json | ConvertFrom-Json
}

function Get-Array {
    param($Value)
    if ($null -eq $Value) { return @() }
    if ($Value -is [System.Array]) { return @($Value) }
    return @($Value)
}

function Get-RosterAgentCapabilities {
    param(
        [object]$Roster,
        [string]$IdentityName
    )

    if (-not $Roster -or [string]::IsNullOrWhiteSpace($IdentityName)) { return @() }
    foreach ($agent in @(Get-Array $Roster.agents)) {
        if ([string]$agent.agent_id -eq $IdentityName) {
            return @(Get-Array $agent.capabilities)
        }
    }
    return @()
}

function Get-ExecutionCapabilityPolicyProjection {
    [ordered]@{
        mcp = "required_for_script_execution_and_lifecycle_mutations"
        shell = "no_standing_native_shell_authority"
        shell_like_actions = "policy_aware_narada_mcp_surface_only"
        source = "AGENTS.md#Agent-Capability-Policy"
    }
}

function Get-OperatorSurfaceIdentityName {
    param([object]$Identity)
    return [string]$Identity.identity_id
}

function Get-OperatorSurfaceSiteId {
    param([object]$Identity)
    return [string]$Identity.site_id
}

function Get-OperatorSurfaceRole {
    param([object]$Identity)
    return [string]$Identity.role
}

function Get-OperatorSurfaceRoleDisplayLabel {
    param(
        [object]$IdentityRegistry,
        [string]$Role
    )

    if ([string]::IsNullOrWhiteSpace($Role)) { return $null }
    if (-not $IdentityRegistry.roles) { return $null }

    $roleProperty = $IdentityRegistry.roles.PSObject.Properties[$Role]
    if (-not $roleProperty -or -not $roleProperty.Value) { return $null }

    $roleInfo = $roleProperty.Value
    if ($roleInfo.PSObject.Properties.Name -contains "label" -and -not [string]::IsNullOrWhiteSpace([string]$roleInfo.label)) {
        return [string]$roleInfo.label
    }

    return $null
}

function Get-OperatorSurfaceAgentDisplayName {
    param([object]$Identity)
    return [string]$Identity.agent_name
}

function Get-OperatorSurfaceStyle {
    param([object]$Identity)

    if ($Identity.label_projection -and $Identity.label_projection.style) {
        return $Identity.label_projection.style
    }
    [ordered]@{
        background_hex = "000000"
        text_hex = "D1D5DB"
        site_text_hex = "93C5FD"
        agent_text_hex = "F9FAFB"
        role_text_hex = "D1D5DB"
    }
}

function Get-ObjectPropertyValue {
    param(
        [object]$Object,
        [string]$Name
    )

    if (-not $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property) { return $null }
    return $property.Value
}

function Get-AvatarMediaType {
    param(
        [object]$Still,
        [string]$Path
    )

    $declared = Get-ObjectPropertyValue -Object $Still -Name "media_type"
    if (-not [string]::IsNullOrWhiteSpace([string]$declared)) { return [string]$declared }

    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".svg" { return "image/svg+xml" }
        ".gif" { return "image/gif" }
        ".png" { return "image/png" }
        ".webp" { return "image/webp" }
        ".jpg" { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        ".webm" { return "video/webm" }
        ".mp4" { return "video/mp4" }
        ".mjs" { return "text/javascript" }
        ".js" { return "text/javascript" }
        ".html" { return "text/html" }
        default { return "application/octet-stream" }
    }
}

function Get-AvatarAssetKind {
    param(
        [object]$Asset,
        [string]$Path,
        [string]$MediaType,
        [string]$AssetKind
    )

    $declared = [string](Get-ObjectPropertyValue -Object $Asset -Name "kind")
    if (-not [string]::IsNullOrWhiteSpace($declared)) { return $declared }

    if ($AssetKind -ne "animated") { return "still" }
    if ($MediaType -eq "image/gif") { return "gif" }
    if ($MediaType -eq "video/webm") { return "webm" }
    if ($MediaType -eq "video/mp4") { return "mp4" }
    if ($MediaType -eq "text/javascript" -or $MediaType -eq "text/html") { return "threejs" }

    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".gif" { return "gif" }
        ".webm" { return "webm" }
        ".mp4" { return "mp4" }
        ".mjs" { return "threejs" }
        ".js" { return "threejs" }
        ".html" { return "threejs" }
        default { return "animated" }
    }
}

function Resolve-SiteRelativePath {
    param(
        [string]$UserSiteRoot,
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    $normalized = $Path.Replace("/", "\")
    if ([System.IO.Path]::IsPathRooted($normalized)) { return $normalized }
    return Join-Path $UserSiteRoot $normalized
}

function Get-AvatarEntry {
    param(
        [object]$AvatarConfig,
        [string]$IdentityName,
        [string]$Role,
        [string]$SiteId
    )

    if (-not $AvatarConfig) { return $null }

    $identityAvatars = Get-ObjectPropertyValue -Object $AvatarConfig -Name "identity_avatars"
    $identityEntry = Get-ObjectPropertyValue -Object $identityAvatars -Name $IdentityName
    if ($identityEntry) {
        return [ordered]@{
            source = "identity"
            source_ref = $IdentityName
            entry = $identityEntry
        }
    }

    $roleDefaults = Get-ObjectPropertyValue -Object $AvatarConfig -Name "role_defaults"
    $roleEntry = Get-ObjectPropertyValue -Object $roleDefaults -Name $Role
    if ($roleEntry) {
        return [ordered]@{
            source = "role_default"
            source_ref = $Role
            entry = $roleEntry
        }
    }

    $siteDefaults = Get-ObjectPropertyValue -Object $AvatarConfig -Name "site_defaults"
    $siteEntry = Get-ObjectPropertyValue -Object $siteDefaults -Name $SiteId
    if ($siteEntry) {
        return [ordered]@{
            source = "site_default"
            source_ref = $SiteId
            entry = $siteEntry
        }
    }

    $siteDefault = Get-ObjectPropertyValue -Object $AvatarConfig -Name "site_default"
    if ($siteDefault) {
        return [ordered]@{
            source = "site_default"
            source_ref = "global"
            entry = $siteDefault
        }
    }

    return $null
}

function Resolve-AvatarAsset {
    param(
        [object]$Asset,
        [string]$UserSiteRoot,
        [string]$IdentityName,
        [string]$AssetKind
    )

    if (-not $Asset) { return $null }
    $path = [string](Get-ObjectPropertyValue -Object $Asset -Name "path")
    if ([string]::IsNullOrWhiteSpace($path)) {
        return [ordered]@{
            path = $null
            absolute_path = $null
            media_type = $null
            transparent_background = $false
            alt = "$IdentityName avatar"
            available = $false
            diagnostic = "avatar_${AssetKind}_path_missing"
        }
    }

    $absolutePath = Resolve-SiteRelativePath -UserSiteRoot $UserSiteRoot -Path $path
    $mediaType = Get-AvatarMediaType -Still $Asset -Path $path
    $transparent = Get-ObjectPropertyValue -Object $Asset -Name "transparent_background"
    $loop = Get-ObjectPropertyValue -Object $Asset -Name "loop"
    $muted = Get-ObjectPropertyValue -Object $Asset -Name "muted"
    $alphaRequired = Get-ObjectPropertyValue -Object $Asset -Name "alpha_required"
    $entrypoint = [string](Get-ObjectPropertyValue -Object $Asset -Name "entrypoint")
    $alt = [string](Get-ObjectPropertyValue -Object $Asset -Name "alt")
    if ([string]::IsNullOrWhiteSpace($alt)) { $alt = "$IdentityName avatar" }

    [ordered]@{
        path = $path
        absolute_path = $absolutePath
        media_type = $mediaType
        kind = Get-AvatarAssetKind -Asset $Asset -Path $path -MediaType $mediaType -AssetKind $AssetKind
        transparent_background = ($transparent -eq $true)
        loop = if ($null -ne $loop) { ($loop -eq $true) } else { $null }
        muted = if ($null -ne $muted) { ($muted -eq $true) } else { $null }
        alpha_required = if ($null -ne $alphaRequired) { ($alphaRequired -eq $true) } else { $null }
        entrypoint = if ([string]::IsNullOrWhiteSpace($entrypoint)) { $null } else { $entrypoint }
        alt = $alt
        available = (Test-Path -LiteralPath $absolutePath -PathType Leaf)
    }
}

function Resolve-AvatarOperatorSurfaceLabel {
    param([object]$Entry)

    $config = Get-ObjectPropertyValue -Object $Entry -Name "operator_surface_label"
    if (-not $config) { return $null }

    $placement = [string](Get-ObjectPropertyValue -Object $config -Name "placement")
    $alignment = [string](Get-ObjectPropertyValue -Object $config -Name "horizontal_alignment")
    $gapPx = Get-ObjectPropertyValue -Object $config -Name "gap_px"
    $sizePx = Get-ObjectPropertyValue -Object $config -Name "size_px"
    $sizeScale = Get-ObjectPropertyValue -Object $config -Name "size_scale"
    $paddingTopPx = Get-ObjectPropertyValue -Object $config -Name "padding_top_px"
    $paddingBottomPx = Get-ObjectPropertyValue -Object $config -Name "padding_bottom_px"
    $paddingLeftPx = Get-ObjectPropertyValue -Object $config -Name "padding_left_px"
    $paddingRightPx = Get-ObjectPropertyValue -Object $config -Name "padding_right_px"

    [ordered]@{
        placement = if ([string]::IsNullOrWhiteSpace($placement)) { "below_label" } else { $placement }
        horizontal_alignment = if ([string]::IsNullOrWhiteSpace($alignment)) { "right" } else { $alignment }
        gap_px = if ($null -ne $gapPx) { [int]$gapPx } else { $null }
        size_px = if ($null -ne $sizePx) { [int]$sizePx } else { $null }
        size_scale = if ($null -ne $sizeScale) { [double]$sizeScale } else { $null }
        padding_top_px = if ($null -ne $paddingTopPx) { [int]$paddingTopPx } else { $null }
        padding_bottom_px = if ($null -ne $paddingBottomPx) { [int]$paddingBottomPx } else { $null }
        padding_left_px = if ($null -ne $paddingLeftPx) { [int]$paddingLeftPx } else { $null }
        padding_right_px = if ($null -ne $paddingRightPx) { [int]$paddingRightPx } else { $null }
    }
}

function Get-OperatorSurfaceAvatar {
    param(
        [object]$AvatarConfig,
        [string]$IdentityName,
        [string]$Role,
        [string]$SiteId,
        [string]$UserSiteRoot
    )

    $entryInfo = Get-AvatarEntry -AvatarConfig $AvatarConfig -IdentityName $IdentityName -Role $Role -SiteId $SiteId
    if (-not $entryInfo) { return $null }

    $entry = $entryInfo.entry
    $still = Resolve-AvatarAsset -Asset (Get-ObjectPropertyValue -Object $entry -Name "still") -UserSiteRoot $UserSiteRoot -IdentityName $IdentityName -AssetKind "still"
    $animated = Resolve-AvatarAsset -Asset (Get-ObjectPropertyValue -Object $entry -Name "animated") -UserSiteRoot $UserSiteRoot -IdentityName $IdentityName -AssetKind "animated"

    if ($still -and -not $still.available) {
        $diagnostics.Add([ordered]@{
            identity_name = $IdentityName
            kind = "avatar_asset_missing"
            asset_kind = "still"
            path = $still.path
            absolute_path = $still.absolute_path
            source = $entryInfo.source
            source_ref = $entryInfo.source_ref
        })
    }
    if ($animated -and -not $animated.available) {
        $diagnostics.Add([ordered]@{
            identity_name = $IdentityName
            kind = "avatar_asset_missing"
            asset_kind = "animated"
            path = $animated.path
            absolute_path = $animated.absolute_path
            source = $entryInfo.source
            source_ref = $entryInfo.source_ref
        })
    }

    [ordered]@{
        source = $entryInfo.source
        source_ref = $entryInfo.source_ref
        still = $still
        animated = $animated
        operator_surface_label = Resolve-AvatarOperatorSurfaceLabel -Entry $entry
    }
}

$identityPath = Join-Path $UserSiteRoot "operator-surfaces\identities.json"
if (-not (Test-Path -LiteralPath $identityPath)) {
    throw "Identity registry not found: $identityPath"
}

$identityRegistry = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($identityPath))
$rosterPath = Join-Path $UserSiteRoot ".ai\agents\roster.json"
$agentRoster = $null
if (Test-Path -LiteralPath $rosterPath) {
    $agentRoster = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($rosterPath))
}
$executionCapabilityPolicy = Get-ExecutionCapabilityPolicyProjection
$bindings = [System.Collections.Generic.List[object]]::new()
$diagnostics = [System.Collections.Generic.List[object]]::new()
$avatarConfigPath = Join-Path $UserSiteRoot "operator-surfaces\agent-avatars.json"
$avatarConfig = $null
if (Test-Path -LiteralPath $avatarConfigPath) {
    try {
        $avatarConfig = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($avatarConfigPath))
    } catch {
        $diagnostics.Add([ordered]@{
            kind = "agent_avatar_config_unreadable"
            path = $avatarConfigPath
            message = $_.Exception.Message
        })
    }
}
$directedObligationPath = Join-Path $UserSiteRoot "operator-surfaces\directed-obligations.json"
$directedObligationConfig = $null
if (Test-Path -LiteralPath $directedObligationPath) {
    try {
        $directedObligationConfig = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($directedObligationPath))
    } catch {
        $diagnostics.Add([ordered]@{
            kind = "directed_obligations_unreadable"
            path = $directedObligationPath
            message = $_.Exception.Message
        })
    }
}
$operatorActivityPolicyPath = Join-Path $UserSiteRoot "operator-surfaces\operator-activity-state-machine.json"
if (-not (Test-Path -LiteralPath $operatorActivityPolicyPath)) {
    throw "Operator activity state-machine policy not found: $operatorActivityPolicyPath"
}
$operatorActivityPolicy = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($operatorActivityPolicyPath))

$reviewPickupEscalationsPath = Join-Path $UserSiteRoot "operator-surfaces\review-pickup-escalations.json"
$reviewPickupEscalations = $null
if (Test-Path -LiteralPath $reviewPickupEscalationsPath) {
    try {
        $reviewPickupEscalations = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($reviewPickupEscalationsPath))
    } catch {
        $diagnostics.Add([ordered]@{
            kind = "review_pickup_escalations_unreadable"
            path = $reviewPickupEscalationsPath
            message = $_.Exception.Message
        })
    }
}
if (-not $TaskDbPath) {
    $TaskDbPath = Join-Path $UserSiteRoot ".ai\task-lifecycle.db"
}
$taskDbFresh = $true
$taskSpecsDir = Join-Path $UserSiteRoot ".ai\do-not-open\tasks"
if ((Test-Path -LiteralPath $TaskDbPath) -and (Test-Path -LiteralPath $taskSpecsDir)) {
    $dbWrite = (Get-Item -LiteralPath $TaskDbPath).LastWriteTimeUtc
    $newerTaskSpec = Get-ChildItem -LiteralPath $taskSpecsDir -Filter "*.md" -File |
        Where-Object { $_.LastWriteTimeUtc -gt $dbWrite.AddSeconds(1) } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if ($newerTaskSpec) {
        $diagnostics.Add([ordered]@{
            kind = "task_markdown_newer_than_lifecycle_db"
            reason = "advisory_only_sqlite_authoritative"
            task_lifecycle_db = $TaskDbPath
            newer_task_spec = $newerTaskSpec.FullName
        })
    }
}

function Get-OperatorSurfaceLabel {
    param(
        [object]$Identity,
        [object]$IdentityRegistry
    )

    $identityName = Get-OperatorSurfaceIdentityName -Identity $Identity
    $projection = if ($Identity.label_projection -and $Identity.label_projection.label_from) { [string]$Identity.label_projection.label_from } else { "site_agent_role" }

    if ($projection -eq "identity_name") {
        return $identityName
    }

    if ($projection -eq "site_agent_role") {
        $parts = $identityName.Split(".", 2)
        $siteName = if ($parts.Count -gt 1) { $parts[0] } else { Get-OperatorSurfaceSiteId -Identity $Identity }
        $agentName = Get-OperatorSurfaceAgentDisplayName -Identity $Identity
        $role = Get-OperatorSurfaceRole -Identity $Identity
        $roleLabel = Get-OperatorSurfaceRoleDisplayLabel -IdentityRegistry $IdentityRegistry -Role $role

        if ([string]::IsNullOrWhiteSpace($roleLabel) -or $agentName -eq $role -or $agentName -eq $roleLabel) {
            return "$siteName - $agentName"
        }

        return "$siteName - $agentName - $roleLabel"
    }

    throw "Unsupported label projection for $identityName"
}

function Get-OperatorSurfaceLabelParts {
    param(
        [object]$Identity,
        [object]$IdentityRegistry
    )

    $identityName = Get-OperatorSurfaceIdentityName -Identity $Identity
    $parts = $identityName.Split(".", 2)
    $siteName = if ($parts.Count -gt 1) { $parts[0] } else { Get-OperatorSurfaceSiteId -Identity $Identity }
    $agentName = Get-OperatorSurfaceAgentDisplayName -Identity $Identity -IdentityName $identityName
    $role = Get-OperatorSurfaceRole -Identity $Identity
    $roleLabel = Get-OperatorSurfaceRoleDisplayLabel -IdentityRegistry $IdentityRegistry -Role $role
    $roleIsAgent = -not [string]::IsNullOrWhiteSpace($role) -and ($agentName -eq $role -or $agentName -eq $roleLabel)

    [ordered]@{
        site_name  = $siteName
        agent_name = $agentName
        role_color_applies_to_agent = $roleIsAgent
        role_name  = if ([string]::IsNullOrWhiteSpace($role) -or $roleIsAgent) { $null } else { $role }
        role_label = if ([string]::IsNullOrWhiteSpace($role) -or $roleIsAgent) { $null } else { $roleLabel }
    }
}

function Get-OperatorSurfaceActivityLabel {
    param([string]$State, [int]$TaskNumber)

    if (-not $operatorActivityPolicy -or -not $operatorActivityPolicy.labels) { return $null }
    $labelKey = if ($State -eq "directed_obligation" -and $TaskNumber -le 0) { "directed_obligation_without_task" } else { $State }
    $property = $operatorActivityPolicy.labels.PSObject.Properties[$labelKey]
    if (-not $property) { return $null }
    $template = [string]$property.Value
    if ([string]::IsNullOrWhiteSpace($template)) { return $null }
    return $template.Replace("{task_number}", [string]$TaskNumber)
}

function Get-OperatorSurfaceDirectedObligations {
    param(
        [string]$IdentityName,
        [string]$Role
    )

    $reader = Join-Path $PSScriptRoot "Get-DirectedObligations.ps1"
    if (-not (Test-Path -LiteralPath $reader)) {
        if ($directedObligationConfig) {
            $diagnostics.Add([ordered]@{
                identity_name = $IdentityName
                kind = "directed_obligation_reader_missing"
                path = $reader
            })
        }
        return @()
    }

    try {
        $view = & $reader `
            -UserSiteRoot $UserSiteRoot `
            -IdentityName $IdentityName `
            -TaskDbPath $TaskDbPath `
            -PassThru
        $parsed = ConvertFrom-NaradaJson (($view) -join [Environment]::NewLine)
        foreach ($diag in (Get-Array $parsed.diagnostics)) {
            $diagnostics.Add($diag)
        }
        return @(Get-Array $parsed.due_obligations)
    } catch {
        $diagnostics.Add([ordered]@{
            identity_name = $IdentityName
            kind = "directed_obligation_reader_failed"
            message = $_.Exception.Message
        })
        return @()
    }
}

function Convert-TaskStatusToOperatorActivityState {
    param([string]$Status, [string]$AssignmentIntent)

    if ($AssignmentIntent -eq "review") { return [string]$operatorActivityPolicy.mappings.review_assignment_intent }
    if ($operatorActivityPolicy -and $operatorActivityPolicy.mappings) {
        $property = $operatorActivityPolicy.mappings.PSObject.Properties[$Status]
        if ($property) { return [string]$property.Value }
    }
    return "unknown"
}

function Get-CurrentOperatorSurfaceActivity {
    param([string]$IdentityName)

    if (-not (Test-Path -LiteralPath $TaskDbPath)) {
        $diagnostics.Add([ordered]@{
            identity_name = $IdentityName
            kind = "operator_activity_unavailable"
            reason = "task_lifecycle_db_missing"
            path = $TaskDbPath
        })
        return [ordered]@{
            state = "unavailable"
            label = $null
            renders_on_label = $false
            source = "narada_task_lifecycle_db"
            reason = "task_lifecycle_db_missing"
        }
    }

    if (-not $taskDbFresh) {
        $diagnostics.Add([ordered]@{
            identity_name = $IdentityName
            kind = "operator_activity_stale"
            reason = "task_lifecycle_db_older_than_task_specs"
        })
        return [ordered]@{
            state = "unavailable"
            label = $null
            renders_on_label = $false
            source = "narada_task_lifecycle_db"
            reason = "task_lifecycle_db_older_than_task_specs"
        }
    }

    $sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
    if (-not $sqlite) {
        $diagnostics.Add([ordered]@{
            identity_name = $IdentityName
            kind = "operator_activity_unavailable"
            reason = "sqlite3_missing"
        })
        return [ordered]@{
            state = "unavailable"
            label = $null
            renders_on_label = $false
            source = "narada_task_lifecycle_db"
            reason = "sqlite3_missing"
        }
    }

$escaped = $IdentityName.Replace("'", "''")
    $sql = @"
select * from (
select
  l.task_number as task_number,
  l.task_id as task_id,
  s.title as title,
  l.status as status,
  a.claimed_at as claimed_at,
  a.intent as assignment_intent,
  l.updated_at as updated_at,
  'task_assignments' as activity_fact_source
from task_lifecycle l
join task_assignments a on a.task_id = l.task_id
left join task_specs s on s.task_id = l.task_id
where a.agent_id = '$escaped'
  and a.released_at is null
  and l.status in ('claimed', 'in_progress', 'in_review', 'blocked')
union all
select
  l.task_number as task_number,
  l.task_id as task_id,
  s.title as title,
  l.status as status,
  r.updated_at as claimed_at,
  'roster_current' as assignment_intent,
  l.updated_at as updated_at,
  'agent_roster' as activity_fact_source
from agent_roster r
join task_lifecycle l on l.task_number = r.task_number
left join task_specs s on s.task_id = l.task_id
where r.agent_id = '$escaped'
  and r.status in ('working', 'claimed', 'in_progress')
  and l.status in ('claimed', 'in_progress', 'in_review', 'blocked')
union all
select
  l.task_number as task_number,
  l.task_id as task_id,
  s.title as title,
  l.status as status,
  tr.reported_at as claimed_at,
  'report_author' as assignment_intent,
  l.updated_at as updated_at,
  'task_reports' as activity_fact_source
from task_report_records tr
join task_lifecycle l on l.task_id = tr.task_id
left join task_specs s on s.task_id = l.task_id
where tr.agent_id = '$escaped'
  and l.status in ('in_review', 'blocked')
) activity_candidates
order by
  case assignment_intent
    when 'review' then 0
    else 1
  end,
  case status
    when 'claimed' then 1
    when 'in_progress' then 2
    when 'blocked' then 3
    when 'in_review' then 4
    else 9
  end,
  claimed_at desc;
"@

    $raw = & $sqlite.Source -json $TaskDbPath $sql 2>$null
    if ($LASTEXITCODE -ne 0) {
        $diagnostics.Add([ordered]@{
            identity_name = $IdentityName
            kind = "operator_activity_unavailable"
            reason = "sqlite_query_failed"
        })
        return [ordered]@{
            state = "unavailable"
            label = $null
            renders_on_label = $false
            source = "narada_task_lifecycle_db"
            reason = "sqlite_query_failed"
        }
    }

    $rows = @()
    if ($raw) {
        $parsed = ConvertFrom-NaradaJson (($raw) -join "`n")
        $rows = @($parsed)
    }

    if ($rows.Count -eq 0) {
        $diagnostics.Add([ordered]@{
            identity_name = $IdentityName
            kind = "operator_activity_idle"
            reason = "no_non_idle_task_assignment"
        })
        return [ordered]@{
            state = "idle"
            label = $null
            renders_on_label = $false
            source = "narada_task_lifecycle_db"
            activity_fact_source = "no_non_idle_task_assignment"
            ambiguous = $false
        }
    }

    if ($rows.Count -gt 1) {
        $diagnostics.Add([ordered]@{
            identity_name = $IdentityName
            kind = "operator_activity_ambiguous"
            reason = "multiple_non_idle_task_assignments"
            task_numbers = @($rows | ForEach-Object { [int]$_.task_number })
            selected_task_number = [int]$rows[0].task_number
        })
    }

    $row = $rows[0]
    $state = Convert-TaskStatusToOperatorActivityState -Status ([string]$row.status) -AssignmentIntent ([string]$row.assignment_intent)
    $label = Get-OperatorSurfaceActivityLabel -State $state -TaskNumber ([int]$row.task_number)
    [ordered]@{
        state = $state
        label = $label
        renders_on_label = -not [string]::IsNullOrWhiteSpace($label)
        task_number = [int]$row.task_number
        task_id = [string]$row.task_id
        title = [string]$row.title
        status = [string]$row.status
        assignment_intent = [string]$row.assignment_intent
        source = "narada_task_lifecycle_db"
        activity_fact_source = [string]$row.activity_fact_source
        ambiguous = $rows.Count -gt 1
    }
}

foreach ($identity in @($identityRegistry.identities)) {
    if ($identity.deprecated -eq $true) { continue }
    $identityName = Get-OperatorSurfaceIdentityName -Identity $identity
    $siteId = Get-OperatorSurfaceSiteId -Identity $identity
    $role = Get-OperatorSurfaceRole -Identity $identity
    $label = Get-OperatorSurfaceLabel -Identity $identity -IdentityRegistry $identityRegistry
    $labelParts = Get-OperatorSurfaceLabelParts -Identity $identity -IdentityRegistry $identityRegistry
    $operatorActivity = Get-CurrentOperatorSurfaceActivity -IdentityName $identityName
    $directedObligations = @(Get-OperatorSurfaceDirectedObligations -IdentityName $identityName -Role $role)
    if ($directedObligations.Count -gt 0 -and [string]$operatorActivity.state -eq "idle") {
        $firstObligation = $directedObligations[0]
        $obligationTaskNumber = if ($firstObligation.task_number) { [int]$firstObligation.task_number } else { 0 }
        $operatorActivity = [ordered]@{
            state = "directed_obligation"
            label = Get-OperatorSurfaceActivityLabel -State "directed_obligation" -TaskNumber $obligationTaskNumber
            renders_on_label = $true
            task_number = if ($obligationTaskNumber -gt 0) { $obligationTaskNumber } else { $null }
            task_id = [string](Get-ObjectPropertyValue -Object $firstObligation.payload -Name "task_id")
            title = [string](Get-ObjectPropertyValue -Object $firstObligation.payload -Name "summary")
            status = "open"
            assignment_intent = "directed_obligation"
            source = "directed_obligations"
            activity_fact_source = "operator_surfaces_directed_obligations_json"
            obligation_id = [string]$firstObligation.obligation_id
            obligation_kind = [string]$firstObligation.kind
            ambiguous = $false
        }
    }
    $taskAffinity = if ($operatorActivity -and $operatorActivity.renders_on_label -eq $true -and $operatorActivity.task_number -ne $null) {
        [ordered]@{
            task_number = [int]$operatorActivity.task_number
            task_id = [string]$operatorActivity.task_id
            title = [string]$operatorActivity.title
            status = [string]$operatorActivity.status
            source = "operator_activity_compat"
        }
    } else {
        $null
    }

    $bindings.Add([ordered]@{
        surface_id       = $identityName
        site_id          = $siteId
        agent_kind       = [string]$identity.agent_kind
        label            = $label
        label_parts      = $labelParts
        avatar           = Get-OperatorSurfaceAvatar -AvatarConfig $avatarConfig -IdentityName $identityName -Role $role -SiteId $siteId -UserSiteRoot $UserSiteRoot
        directed_obligations = @($directedObligations)
        operator_activity = $operatorActivity
        task_affinity    = $taskAffinity
        role_capabilities = @(Get-RosterAgentCapabilities -Roster $agentRoster -IdentityName $identityName)
        input_capabilities = @(Get-Array $identity.input_capabilities)
        submit_strategy = if ([string]::IsNullOrWhiteSpace([string]$identity.submit_strategy)) { $null } else { [string]$identity.submit_strategy }
        execution_capability_policy = $executionCapabilityPolicy
        authority_limits = @(Get-Array $identity.authority_limits)
        narada_site_relation = $identity.narada_site_relation
        style            = Get-OperatorSurfaceStyle -Identity $identity
    })
}

$result = [ordered]@{
    schema          = "narada.operator_surfaces.window_labels.v0"
    owner_site_id   = [string]$identityRegistry.owner_site_id
    generated_from  = if ($identityRegistry.projection_authority -eq "sqlite") { "sqlite:operator_surface_identities" } else { "operator-surfaces/identities.json" }
    projection_authority = if ($identityRegistry.projection_authority -eq "sqlite") { "sqlite" } else { "legacy_json" }
    projection_source = if ($identityRegistry.projection_source) { [string]$identityRegistry.projection_source } else { $identityPath }
    projection_note = if ($identityRegistry.projection_authority -eq "sqlite") { "Compatibility projection for the current OSL renderer. Do not edit as authority." } else { "Legacy projection generated from identities JSON." }
    avatar_config_source = if ($avatarConfig) { "operator-surfaces/agent-avatars.json" } else { $null }
    avatar_asset_policy = if ($avatarConfig) { Get-ObjectPropertyValue -Object $avatarConfig -Name "asset_policy" } else { $null }
    directed_obligations_source = if ($directedObligationConfig) { "operator-surfaces/directed-obligations.json" } else { $null }
    task_affinity_source = $TaskDbPath
    operator_activity_source = $TaskDbPath
    operator_activity_policy_source = "operator-surfaces/operator-activity-state-machine.json"
    operator_activity_state_machine = $operatorActivityPolicy
    generated_at    = (Get-Date -Format "o")
    description     = if ($identityRegistry.projection_authority -eq "sqlite") { "Generated overlay label registry. Identity/profile authority lives in User Site SQLite; live HWND binding authority lives in PC Site SQLite. JSON files are compatibility projections for the current OSL renderer." } else { "Generated overlay label registry. Legacy identity input came from operator-surfaces/identities.json." }
    runtime_binding_path = $RuntimeBindingPath
    runtime_binding_projection_source = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\operator-surface-runtime.db"
    review_pickup_escalations = $reviewPickupEscalations
    layout          = [ordered]@{
        x_offset_px           = 0
        right_padding_px      = 1
        top_padding_px        = 2
        opacity               = 1.0
        label_scale           = 3.0
        label_height_px       = 30
        horizontal_padding_px = 4
        fonts                 = [ordered]@{
            family = "Segoe UI"
            site   = [ordered]@{
                family  = "Segoe UI"
                size_px = 8
                weight  = 400
            }
            agent  = [ordered]@{
                family  = "Segoe UI"
                size_px = 13
                weight  = 600
            }
            role   = [ordered]@{
                family  = "Segoe UI"
                size_px = 10
                weight  = 400
            }
        }
    }
    diagnostics     = @($diagnostics)
    bindings        = @($bindings)
}

$json = $result | ConvertTo-Json -Depth 80
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($OutputPath, $json, $utf8NoBom)
Write-Host "Generated overlay bindings: $OutputPath"
