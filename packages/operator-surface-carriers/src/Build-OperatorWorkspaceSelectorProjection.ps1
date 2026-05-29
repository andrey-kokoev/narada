param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = $(if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" }),
    [string]$WorkspaceStatePath,
    [string]$RuntimeStatePath,
    [string]$OutputPath,
    [string]$MutatingAuthorized,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "HostTopology.Model.ps1")

function ConvertFrom-NaradaJson {
    param([string]$Json)

    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Json | ConvertFrom-Json -Depth 100 }
    return $Json | ConvertFrom-Json
}

function Get-NaradaObjectValue {
    param([object]$Object, [string]$Name)

    if ($null -eq $Object) { return $null }
    if ($Object -is [System.Collections.IDictionary]) {
        if ($Object.Contains($Name)) { return $Object[$Name] }
        return $null
    }
    if ($Object.PSObject.Properties.Name -contains $Name) {
        return $Object.PSObject.Properties[$Name].Value
    }
    $null
}

function ConvertTo-NaradaArray {
    param([object]$Value)

    $items = [System.Collections.Generic.List[object]]::new()
    function Add-NaradaArrayItem {
        param([object]$Item, [System.Collections.Generic.List[object]]$Target)

        if ($null -eq $Item) { return }
        if ($Item -is [System.Array]) {
            foreach ($child in $Item) { Add-NaradaArrayItem -Item $child -Target $Target }
            return
        }
        $Target.Add($Item)
    }

    Add-NaradaArrayItem -Item $Value -Target $items
    @($items)
}

function Get-NaradaWorkspaceMonitorCount {
    param([object]$Workspace)

    $count = Get-NaradaObjectValue -Object $Workspace -Name "monitor_count"
    if ($null -ne $count -and -not [string]::IsNullOrWhiteSpace([string]$count)) {
        try { return [int]$count } catch { }
    }
    throw "operator_workspace_monitor_count_missing: $([string](Get-NaradaObjectValue -Object $Workspace -Name 'workspace_id'))"
}

function Get-NaradaWorkspaceSurfaceState {
    param([object]$Workspace)

    $state = [string](Get-NaradaObjectValue -Object $Workspace -Name "surface_state")
    if ([string]::IsNullOrWhiteSpace($state)) { throw "operator_workspace_surface_state_missing: $([string](Get-NaradaObjectValue -Object $Workspace -Name 'workspace_id'))" }
    $normalized = ([string]$state).Trim().ToLowerInvariant()
    if ($normalized -in @("running", "inhabited", "live")) { return "running" }
    if ($normalized -in @("launchable", "dormant", "inactive")) { return "launchable" }
    if ($normalized -in @("disabled", "unavailable", "absent")) { return "disabled" }
    throw "operator_workspace_invalid_surface_state: $([string](Get-NaradaObjectValue -Object $Workspace -Name 'workspace_id')) -> $state"
}

function Get-NaradaWorkspaceTopologyVariants {
    param([object]$Workspace)

    $variants = @(ConvertTo-NaradaArray (Get-NaradaObjectValue -Object $Workspace -Name "topology_variants"))
    if ($variants.Count -eq 0) {
        throw "operator_workspace_topology_variants_missing: $([string](Get-NaradaObjectValue -Object $Workspace -Name 'workspace_id'))"
    }
    $variants
}

function Get-NaradaWorkspaceTopologyVariantById {
    param(
        [object]$Workspace,
        [string]$VariantId
    )

    $workspaceId = [string](Get-NaradaObjectValue -Object $Workspace -Name "workspace_id")
    if ([string]::IsNullOrWhiteSpace($VariantId)) {
        throw "operator_workspace_default_variant_missing: $workspaceId"
    }

    foreach ($variant in @(Get-NaradaWorkspaceTopologyVariants -Workspace $Workspace)) {
        $candidateVariantId = [string](Get-NaradaObjectValue -Object $variant -Name "variant_id")
        if ([string]::Equals($candidateVariantId, $VariantId, [System.StringComparison]::Ordinal)) {
            return $variant
        }
    }

    throw "operator_workspace_default_variant_unknown: $workspaceId -> $VariantId"
}

function Select-NaradaWorkspaceTopologyVariant {
    param(
        [object]$Workspace,
        [object]$HostTopology
    )

    $workspaceId = [string](Get-NaradaObjectValue -Object $Workspace -Name "workspace_id")
    $defaultVariantId = [string](Get-NaradaObjectValue -Object $Workspace -Name "default_variant_id")
    if ([string]::IsNullOrWhiteSpace($defaultVariantId)) {
        throw "operator_workspace_default_variant_missing: $workspaceId"
    }

    $variants = @(Get-NaradaWorkspaceTopologyVariants -Workspace $Workspace)
    $variantById = @{}
    foreach ($variant in $variants) {
        $variantId = [string](Get-NaradaObjectValue -Object $variant -Name "variant_id")
        if ([string]::IsNullOrWhiteSpace($variantId)) {
            throw "operator_workspace_topology_variant_id_missing: $workspaceId"
        }
        if ($variantById.ContainsKey($variantId)) {
            throw "operator_workspace_topology_variant_duplicate: $workspaceId -> $variantId"
        }
        $variantById[$variantId] = $variant
    }
    if (-not $variantById.ContainsKey($defaultVariantId)) {
        throw "operator_workspace_default_variant_unknown: $workspaceId -> $defaultVariantId"
    }

    $signatureMatches = @($variants | Where-Object {
        $match = Get-NaradaObjectValue -Object $_ -Name "match"
        $signature = if ($match) { [string](Get-NaradaObjectValue -Object $match -Name "topology_signature") } else { $null }
        -not [string]::IsNullOrWhiteSpace($signature) -and [string]::Equals($signature, [string]$HostTopology.topology_signature, [System.StringComparison]::Ordinal)
    })
    if ($signatureMatches.Count -gt 1) {
        throw "operator_workspace_topology_variant_ambiguous_signature: $workspaceId -> $($HostTopology.topology_signature)"
    }
    if ($signatureMatches.Count -eq 1) {
        return $signatureMatches[0]
    }

    $displayCountMatches = @($variants | Where-Object {
        $match = Get-NaradaObjectValue -Object $_ -Name "match"
        if (-not $match) { return $false }
        $count = Get-NaradaObjectValue -Object $match -Name "display_count"
        if ($null -eq $count -or [string]::IsNullOrWhiteSpace([string]$count)) { return $false }
        try { [int]$count -eq [int]$HostTopology.display_count } catch { $false }
    })
    if ($displayCountMatches.Count -gt 1) {
        throw "operator_workspace_topology_variant_ambiguous_display_count: $workspaceId -> $([int]$HostTopology.display_count)"
    }
    if ($displayCountMatches.Count -eq 1) {
        return $displayCountMatches[0]
    }

    throw "operator_workspace_topology_variant_no_match: $workspaceId -> display_count=$([int]$HostTopology.display_count)"
}

function Get-NaradaRuntimeWorkspaceState {
    param([string]$RuntimePath)

    if (-not (Test-Path -LiteralPath $RuntimePath)) {
        throw "operator_workspace_runtime_state_missing: $RuntimePath"
    }
    ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($RuntimePath))
}

function Get-NaradaActiveWorkspaceMap {
    param([object]$RuntimeState)

    $existing = Get-NaradaObjectValue -Object $RuntimeState -Name "active_workspace_by_monitor"
    if (-not $existing) {
        throw "operator_workspace_runtime_active_workspace_by_monitor_missing"
    }

    $map = [ordered]@{}
    foreach ($prop in $existing.PSObject.Properties) {
        $map[$prop.Name] = [string]$prop.Value
    }
    [pscustomobject]$map
}

function Get-NaradaGlobalActiveWorkspaceId {
    param([object]$RuntimeState)

    $active = [string](Get-NaradaObjectValue -Object $RuntimeState -Name "active_workspace_id")
    if ([string]::IsNullOrWhiteSpace($active)) {
        throw "operator_workspace_runtime_active_workspace_id_missing"
    }
    $active
}

function Get-NaradaMonitorSurfaceModeMap {
    param([object]$RuntimeState)

    $existing = Get-NaradaObjectValue -Object $RuntimeState -Name "monitor_surface_mode_by_monitor"
    if (-not $existing) {
        throw "operator_workspace_runtime_monitor_surface_mode_by_monitor_missing"
    }

    $map = [ordered]@{}
    foreach ($prop in $existing.PSObject.Properties) {
        $map[$prop.Name] = [string]$prop.Value
    }

    [pscustomobject]$map
}

function Get-NaradaSelectorScopeFromKey {
    param(
        [string]$Key,
        [string]$MonitorSurfaceMode
    )

    if ([string]::IsNullOrWhiteSpace($Key)) {
        return [ordered]@{
            kind = "monitor_context"
            monitor_surface_mode = [string]$MonitorSurfaceMode
        }
    }

    [ordered]@{
        kind = "monitor_context"
        monitor_surface_mode = [string]$MonitorSurfaceMode
        observed_monitor_name = $Key
    }
}

if ([string]::IsNullOrWhiteSpace($WorkspaceStatePath)) {
    $WorkspaceStatePath = Join-Path $UserSiteRoot "operator-surfaces\operator-workspaces.json"
}
if ([string]::IsNullOrWhiteSpace($RuntimeStatePath)) {
    $RuntimeStatePath = Join-Path $PcSiteRoot "runtime\operator-workspaces\current.json"
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PcSiteRoot "runtime\operator-workspaces\selector-projection.json"
}

if (-not (Test-Path -LiteralPath $WorkspaceStatePath)) {
    throw "operator_workspace_state_missing: $WorkspaceStatePath"
}

$workspaceState = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($WorkspaceStatePath))
$runtimeState = Get-NaradaRuntimeWorkspaceState -RuntimePath $RuntimeStatePath
$hostTopology = Get-NaradaHostTopologySnapshot
$activeMap = Get-NaradaActiveWorkspaceMap -RuntimeState $runtimeState
$monitorSurfaceModeMap = Get-NaradaMonitorSurfaceModeMap -RuntimeState $runtimeState
$globalActiveWorkspaceId = Get-NaradaGlobalActiveWorkspaceId -RuntimeState $runtimeState
$topologyDrift = [System.Collections.Generic.List[object]]::new()

foreach ($prop in $activeMap.PSObject.Properties) {
    $key = [string]$prop.Name
    if (-not ($hostTopology.display_keys -contains $key)) {
        $topologyDrift.Add([ordered]@{
            kind = "missing_display_key"
            key = $key
            detail = "active_workspace_by_monitor references a display key not present in host-topology"
        })
    }
}
foreach ($prop in $monitorSurfaceModeMap.PSObject.Properties) {
    $key = [string]$prop.Name
    if (-not ($hostTopology.display_keys -contains $key)) {
        $topologyDrift.Add([ordered]@{
            kind = "missing_display_key"
            key = $key
            detail = "monitor_surface_mode_by_monitor references a display key not present in host-topology"
        })
    }
}

if ($topologyDrift.Count -gt 0) {
    throw "host_topology_drift_detected: $((@($topologyDrift) | ConvertTo-Json -Depth 20 -Compress))"
}
$selectorsById = [ordered]@{}

foreach ($prop in $activeMap.PSObject.Properties) {
    $selectorId = [string]$prop.Name
    $monitorSurfaceMode = "operator_surface"
    if ($monitorSurfaceModeMap.PSObject.Properties.Name -contains $selectorId) {
        $monitorSurfaceMode = [string]$monitorSurfaceModeMap.PSObject.Properties[$selectorId].Value
    }
    if ($monitorSurfaceMode -eq "windows_native") { continue }
    if ($selectorsById.Contains($selectorId)) { continue }
    $selectorsById[$selectorId] = [ordered]@{
        selector_id = $selectorId
        selector_scope = Get-NaradaSelectorScopeFromKey -Key $selectorId -MonitorSurfaceMode $monitorSurfaceMode
        active_workspace_id = [string]$prop.Value
        monitor_surface_mode = $monitorSurfaceMode
        workspaces = [System.Collections.Generic.List[object]]::new()
        launchable_workspaces = [System.Collections.Generic.List[object]]::new()
        live_workspace_ids = [System.Collections.Generic.List[string]]::new()
    }
}

foreach ($workspace in ConvertTo-NaradaArray $workspaceState.workspaces) {
    $workspaceId = [string](Get-NaradaObjectValue -Object $workspace -Name "workspace_id")
    if ([string]::IsNullOrWhiteSpace($workspaceId)) { continue }

    $surfaceState = Get-NaradaWorkspaceSurfaceState -Workspace $workspace
    if ($surfaceState -eq "disabled") { continue }

    $selectedVariant = $null
    if ($surfaceState -eq "launchable") {
        $selectedVariant = Get-NaradaWorkspaceTopologyVariantById -Workspace $workspace -VariantId ([string](Get-NaradaObjectValue -Object $workspace -Name "default_variant_id"))
    } else {
        $selectedVariant = Select-NaradaWorkspaceTopologyVariant -Workspace $workspace -HostTopology $hostTopology
    }

    $workspaceMonitorCount = [int](Get-NaradaObjectValue -Object $selectedVariant -Name "monitor_count")
    if ($workspaceMonitorCount -le 0) {
        throw "operator_workspace_topology_variant_monitor_count_invalid: $workspaceId -> $([string](Get-NaradaObjectValue -Object $selectedVariant -Name 'variant_id'))"
    }
    foreach ($selector in $selectorsById.Values) {
        $entry = [ordered]@{
            workspace_id = $workspaceId
            display_name = [string](Get-NaradaObjectValue -Object $workspace -Name "display_name")
            member_count = @(ConvertTo-NaradaArray (Get-NaradaObjectValue -Object $workspace -Name "members")).Count
            monitor_count = $workspaceMonitorCount
            effect_scope = "monitor_count:$workspaceMonitorCount"
            surface_state = $surfaceState
            selected_topology_variant_id = [string](Get-NaradaObjectValue -Object $selectedVariant -Name "variant_id")
            click_intent = [ordered]@{
                command = "switch_operator_workspace"
                workspace_id = $workspaceId
                requires_selector_context = $true
            }
        }
        if ($surfaceState -eq "running") {
            $selector.workspaces.Add($entry)
            $selector.live_workspace_ids.Add($workspaceId)
        } elseif ($surfaceState -eq "launchable") {
            $entry.click_intent.launchable = $true
            $selector.launchable_workspaces.Add($entry)
        }
    }
}

$projection = [ordered]@{
    schema = "narada.operator_surfaces.operator_workspace_selector_projection.v0"
    generated_at = Get-Date -Format "o"
    generated_by = if ([string]::IsNullOrWhiteSpace($MutatingAuthorized)) { $null } else { $MutatingAuthorized }
    user_site_root = $UserSiteRoot
    pc_site_root = $PcSiteRoot
    workspace_state_path = $WorkspaceStatePath
    runtime_state_path = $RuntimeStatePath
    host_topology = $hostTopology
    topology_drift = @($topologyDrift)
    default_policy = [ordered]@{
        unscoped_workspace_monitor_bar_visibility = "hidden_without_explicit_selector_scope"
        workspace_visibility = "live_tabs_from_running_workspaces"
        plus_button_inventory = "launchable_workspaces_not_currently_running"
    }
    selectors = @($selectorsById.Values | ForEach-Object {
        $item = $_
        $item.workspaces = @($item.workspaces)
        $item.launchable_workspaces = @($item.launchable_workspaces)
        $item.live_workspace_ids = @($item.live_workspace_ids)
        $item.workspace_tabs = @($item.workspaces)
        [pscustomobject]$item
    })
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($OutputPath, (($projection | ConvertTo-Json -Depth 100).TrimEnd() + [Environment]::NewLine), $utf8NoBom)

if ($PassThru) {
    $projection | ConvertTo-Json -Depth 100
} else {
    [pscustomobject]@{
        Projection = $OutputPath
        Selectors = @($projection.selectors).Count
    } | Format-List
}
