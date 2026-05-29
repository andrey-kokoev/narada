param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = ($env:NARADA_PC_SITE_ROOT ? $env:NARADA_PC_SITE_ROOT : "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2"),
    [string]$WorkspaceId,
    [string]$SelectorMonitorName,
    [string]$SelectorMonitorRole,
    [int]$SelectorLeftToRightIndex = -1,
    [string]$CarrierSurvivalContractPath,
    [string]$KomorebiStatePath,
    [switch]$SkipKomorebiRetile,
    [switch]$SkipWindowVisibilityApply,
    [ValidateSet("next", "previous")]
    [string]$Direction,
    [switch]$Apply,
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

function Set-NaradaProperty {
    param([object]$Object, [string]$Name, [object]$Value)

    if ($Object.PSObject.Properties.Name -contains $Name) {
        $Object.PSObject.Properties[$Name].Value = $Value
    } else {
        Add-Member -InputObject $Object -NotePropertyName $Name -NotePropertyValue $Value
    }
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

function Get-NaradaSelectorContextKeys {
    param([object]$SelectorContext)

    $keys = [System.Collections.Generic.List[string]]::new()
    $observed = [string](Get-NaradaObjectValue -Object $SelectorContext -Name "monitor_name")
    if (-not [string]::IsNullOrWhiteSpace($observed)) { $keys.Add($observed) }

    @($keys | Select-Object -Unique)
}

function Copy-NaradaActiveWorkspaceByMonitor {
    param([object]$RuntimeState)

    $map = [ordered]@{}
    $existing = Get-NaradaObjectValue -Object $RuntimeState -Name "active_workspace_by_monitor"
    if ($existing) {
        foreach ($prop in $existing.PSObject.Properties) {
            $map[$prop.Name] = [string]$prop.Value
        }
    }
    $map
}

function Set-NaradaActiveWorkspaceByMonitor {
    param([object]$State, [string[]]$MonitorKeys, [string]$WorkspaceId, [object]$PreviousRuntimeState)

    $keys = @($MonitorKeys | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique)
    if ($keys.Count -eq 0) { return }

    $map = Copy-NaradaActiveWorkspaceByMonitor -RuntimeState $PreviousRuntimeState
    foreach ($key in $keys) { $map[$key] = $WorkspaceId }
    Set-NaradaProperty -Object $State -Name "active_workspace_by_monitor" -Value ([pscustomobject]$map)
}

function Merge-NaradaRuntimeWorkspaceMaps {
    param(
        [object]$HostTopology,
        [string]$WorkspaceId,
        [int]$MonitorCount,
        [object]$ExistingActiveMap,
        [object]$ExistingModeMap
    )

    $displayKeys = @($HostTopology.display_keys)
    if ($displayKeys.Count -eq 0) {
        throw "operator_workspace_host_topology_missing_display_keys"
    }

    $activeMap = [ordered]@{}
    if ($ExistingActiveMap) {
        foreach ($prop in $ExistingActiveMap.PSObject.Properties) {
            $activeMap[$prop.Name] = [string]$prop.Value
        }
    }

    $modeMap = [ordered]@{}
    if ($ExistingModeMap) {
        foreach ($prop in $ExistingModeMap.PSObject.Properties) {
            $modeMap[$prop.Name] = [string]$prop.Value
        }
    }

    $limit = [Math]::Min([Math]::Max($MonitorCount, 1), $displayKeys.Count)
    for ($index = 0; $index -lt $displayKeys.Count; $index++) {
        $displayKey = [string]$displayKeys[$index]
        if ($index -lt $limit) {
            if (-not $activeMap.Contains($displayKey) -or [string]::IsNullOrWhiteSpace([string]$activeMap[$displayKey])) {
                $activeMap[$displayKey] = $WorkspaceId
            }
            if (-not $modeMap.Contains($displayKey) -or [string]::IsNullOrWhiteSpace([string]$modeMap[$displayKey])) {
                $modeMap[$displayKey] = "operator_surface"
            }
        } elseif (-not $modeMap.Contains($displayKey) -or [string]::IsNullOrWhiteSpace([string]$modeMap[$displayKey])) {
            $modeMap[$displayKey] = "windows_native"
        }
    }

    [pscustomobject][ordered]@{
        active_workspace_by_monitor = [pscustomobject]$activeMap
        monitor_surface_mode_by_monitor = [pscustomobject]$modeMap
    }
}

function Assert-NaradaSelectorAllowsWorkspace {
    param([object]$Workspace, [string]$MonitorName, [string]$MonitorRole, [int]$LeftToRightIndex)

    # Workspace authority no longer carries monitor identity. Selector context
    # is used only for runtime projection updates, not for membership gating.
    return
}

function Invoke-NaradaOperatorWorkspaceSelectorProjectionRefresh {
    param([string]$Root, [string]$PcRoot, [string]$AuthorizedBy)

    $script = Join-Path $Root "tools\operator-surface-carriers\Build-OperatorWorkspaceSelectorProjection.ps1"
    if (-not (Test-Path -LiteralPath $script)) { return }

    $args = @("-UserSiteRoot", $Root, "-PcSiteRoot", $PcRoot)
    if (-not [string]::IsNullOrWhiteSpace($AuthorizedBy)) {
        $args += @("-MutatingAuthorized", $AuthorizedBy)
    }
    & pwsh.exe -NoProfile -ExecutionPolicy Bypass -File $script @args | Out-Null
}

function Write-NaradaJsonLine {
    param(
        [string]$Path,
        [object]$Value
    )

    $directory = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($directory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }
    $json = ($Value | ConvertTo-Json -Depth 100 -Compress).Trim()
    [System.IO.File]::AppendAllText($Path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

function Get-NaradaActiveOperatorWorkspaceId {
    param([object]$WorkspaceState, [string]$RuntimeStatePath)

    if (Test-Path -LiteralPath $RuntimeStatePath) {
        try {
            $runtimeState = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($RuntimeStatePath))
            if (-not [string]::IsNullOrWhiteSpace([string]$runtimeState.active_workspace_id)) {
                return [string]$runtimeState.active_workspace_id
            }
        } catch {
            # Invalid runtime projection should block the workspace switch path.
        }
    }

    throw "operator_workspace_runtime_active_workspace_id_missing"
}

function Resolve-NaradaOperatorWorkspaceId {
    param(
        [object]$WorkspaceState,
        [string]$RuntimeStatePath,
        [string]$ExplicitWorkspaceId,
        [string]$RelativeDirection
    )

    $ids = @($WorkspaceState.workspaces | ForEach-Object { [string]$_.workspace_id } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($ids.Count -eq 0) { throw "operator_workspace_state_has_no_workspaces" }

    if (-not [string]::IsNullOrWhiteSpace($ExplicitWorkspaceId)) {
        if ($ids -notcontains $ExplicitWorkspaceId) { throw "operator_workspace_not_found: $ExplicitWorkspaceId" }
        return $ExplicitWorkspaceId
    }

    if ([string]::IsNullOrWhiteSpace($RelativeDirection)) {
        throw "operator_workspace_target_required"
    }

    $active = Get-NaradaActiveOperatorWorkspaceId -WorkspaceState $WorkspaceState -RuntimeStatePath $RuntimeStatePath
    $index = [array]::IndexOf($ids, $active)
    if ($index -lt 0) { $index = 0 }

    if ($RelativeDirection -eq "next") {
        return $ids[($index + 1) % $ids.Count]
    }

    $target = $index - 1
    if ($target -lt 0) { $target = $ids.Count - 1 }
    $ids[$target]
}

function Invoke-NaradaJsonPowerShellFile {
    param(
        [string]$ScriptPath,
        [string[]]$Arguments,
        [string]$Operation
    )

    $output = & pwsh.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed exit=$LASTEXITCODE`: $($output -join "`n")"
    }

    $text = (($output | Out-String).Trim())
    if ([string]::IsNullOrWhiteSpace($text)) {
        throw "$Operation returned empty output"
    }

    try {
        $parsed = ConvertFrom-NaradaJson $text
    } catch {
        throw "$Operation returned unparseable JSON: $($_.Exception.Message)"
    }
    if ($null -eq $parsed) {
        throw "$Operation returned null JSON"
    }
    $parsed
}

function Get-NaradaOperatorWorkspaceCarrierSurvivalContract {
    param([string]$Path)

    $result = [ordered]@{
        path = $Path
        present = $false
        parsed = $false
        passed = $false
        preserves_hwnds = $false
        allow_inhabited_carrier_sw_hide = $false
        off_workspace_action = "refuse"
        error = $null
    }

    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
        $result.error = "missing_contract"
        return $result
    }

    $result.present = $true
    try {
        $contract = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($Path))
        $result.parsed = $true
        $result.passed = [bool]$contract.passed
        $result.preserves_hwnds = [bool]$contract.preserves_hwnds
        $result.allow_inhabited_carrier_sw_hide = [bool]$contract.allow_inhabited_carrier_sw_hide
        if ($result.passed -and $result.preserves_hwnds) {
            $result.off_workspace_action = if ($result.allow_inhabited_carrier_sw_hide) { "hide" } else { "minimize" }
        } else {
            $result.error = "contract_not_passed"
        }
    } catch {
        $result.error = "unparseable_contract: $($_.Exception.Message)"
    }

    $result
}

$workspaceStatePath = Join-Path $UserSiteRoot "operator-surfaces\operator-workspaces.json"
if (-not (Test-Path -LiteralPath $workspaceStatePath)) {
    throw "operator_workspace_state_missing: $workspaceStatePath"
}

$runtimeRoot = Join-Path $PcSiteRoot "runtime\operator-workspaces"
$runtimeStatePath = Join-Path $runtimeRoot "current.json"
$transitionLedgerPath = Join-Path $runtimeRoot "zone-transition-ledger.jsonl"
if ([string]::IsNullOrWhiteSpace($CarrierSurvivalContractPath)) {
    $CarrierSurvivalContractPath = Join-Path $runtimeRoot "carrier-survival-contract.json"
}
$workspaceState = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($workspaceStatePath))
$targetWorkspaceId = Resolve-NaradaOperatorWorkspaceId `
    -WorkspaceState $workspaceState `
    -RuntimeStatePath $runtimeStatePath `
    -ExplicitWorkspaceId $WorkspaceId `
    -RelativeDirection $Direction
$targetWorkspace = $workspaceState.workspaces | Where-Object { [string]$_.workspace_id -eq $targetWorkspaceId } | Select-Object -First 1
if ($null -eq $targetWorkspace) {
    throw "operator_workspace_not_found_after_resolution: $targetWorkspaceId"
}
Assert-NaradaSelectorAllowsWorkspace `
    -Workspace $targetWorkspace `
    -MonitorName $SelectorMonitorName `
    -MonitorRole $SelectorMonitorRole `
    -LeftToRightIndex $SelectorLeftToRightIndex

$projectionScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\windows-glue\Invoke-OperatorWorkspaceProjection.ps1"
if (-not (Test-Path -LiteralPath $projectionScript)) {
    throw "operator_workspace_projection_script_missing: $projectionScript"
}

$projectionArgs = @("-UserSiteRoot", $UserSiteRoot, "-WorkspaceId", $targetWorkspaceId, "-PassThru")
if (-not [string]::IsNullOrWhiteSpace($KomorebiStatePath)) {
    $projectionArgs += @("-KomorebiStatePath", $KomorebiStatePath)
}

$plan = Invoke-NaradaJsonPowerShellFile `
    -ScriptPath $projectionScript `
    -Arguments $projectionArgs `
    -Operation "operator_workspace_projection"
if ($null -eq $plan.workspace) {
    throw "operator_workspace_projection_missing_workspace"
}

$event = [ordered]@{
    schema = "narada.operator_surfaces.operator_workspace_switch_event.v0"
    observed_at = Get-Date -Format "o"
    user_site_root = $UserSiteRoot
    pc_site_root = $PcSiteRoot
    target_workspace_id = $targetWorkspaceId
    target_display_name = [string]$plan.workspace.display_name
    requested_by = if ([string]::IsNullOrWhiteSpace($MutatingAuthorized)) { $null } else { $MutatingAuthorized }
    mutates = [bool]$Apply
    mutation_authorized = -not [string]::IsNullOrWhiteSpace($MutatingAuthorized)
    selector_context = [ordered]@{
        monitor_name = if ([string]::IsNullOrWhiteSpace($SelectorMonitorName)) { $null } else { $SelectorMonitorName }
        monitor_role = if ([string]::IsNullOrWhiteSpace($SelectorMonitorRole)) { $null } else { $SelectorMonitorRole }
        left_to_right_index = if ($SelectorLeftToRightIndex -ge 0) { $SelectorLeftToRightIndex } else { $null }
    }
    projection = $plan
    apply_event = $null
    carrier_survival_contract = $null
}

if ($Apply) {
    if ([string]::IsNullOrWhiteSpace($MutatingAuthorized)) {
        throw "mutating_operator_workspace_switch_requires_-MutatingAuthorized"
    }

    New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
    $applyArgs = @("-UserSiteRoot", $UserSiteRoot, "-WorkspaceId", $targetWorkspaceId, "-Apply", "-PassThru")
    if (-not [string]::IsNullOrWhiteSpace($KomorebiStatePath)) {
        $applyArgs += @("-KomorebiStatePath", $KomorebiStatePath)
    }
    if ($SkipKomorebiRetile) {
        $applyArgs += @("-SkipKomorebiRetile")
    }

    if (-not $SkipWindowVisibilityApply) {
        $contract = Get-NaradaOperatorWorkspaceCarrierSurvivalContract -Path $CarrierSurvivalContractPath
        $event.carrier_survival_contract = $contract
        if (-not [bool]$contract.passed -or -not [bool]$contract.preserves_hwnds) {
            throw "operator_workspace_carrier_survival_contract_required: mutating operator-workspace visibility is disabled until a live carrier survival contract passes; path=$CarrierSurvivalContractPath; reason=$($contract.error)"
        }

        $applied = Invoke-NaradaJsonPowerShellFile `
            -ScriptPath $projectionScript `
            -Arguments ($applyArgs + @("-OffWorkspaceInhabitedCarrierAction", [string]$contract.off_workspace_action)) `
            -Operation "operator_workspace_apply"
        if ($null -eq $applied.apply_event) {
            throw "operator_workspace_apply_missing_apply_event"
        }
        $event.apply_event = $applied.apply_event
    }

    $previousRuntimeState = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($runtimeStatePath))
    $runtimeState = [pscustomobject][ordered]@{
        schema = "narada.operator_surfaces.operator_workspace_runtime_state.v0"
        active_workspace_id = $targetWorkspaceId
        active_display_name = [string]$plan.workspace.display_name
        updated_at = Get-Date -Format "o"
        updated_by = $MutatingAuthorized
        authority_source = $workspaceStatePath
    }
    $selectorContext = [ordered]@{
        monitor_name = if ([string]::IsNullOrWhiteSpace($SelectorMonitorName)) { $null } else { $SelectorMonitorName }
        monitor_role = if ([string]::IsNullOrWhiteSpace($SelectorMonitorRole)) { $null } else { $SelectorMonitorRole }
        left_to_right_index = if ($SelectorLeftToRightIndex -ge 0) { $SelectorLeftToRightIndex } else { $null }
    }
    $monitorKeys = @(Get-NaradaSelectorContextKeys -SelectorContext ([pscustomobject]$selectorContext))
    $previousActiveMap = Get-NaradaObjectValue -Object $previousRuntimeState -Name "active_workspace_by_monitor"
    $previousModeMap = Get-NaradaObjectValue -Object $previousRuntimeState -Name "monitor_surface_mode_by_monitor"
    $bootstrapMaps = if (-not $previousActiveMap -or -not $previousModeMap) {
        Merge-NaradaRuntimeWorkspaceMaps -HostTopology (Get-NaradaHostTopologySnapshot) -WorkspaceId $targetWorkspaceId -MonitorCount ([int](Get-NaradaObjectValue -Object $targetWorkspace -Name "monitor_count")) -ExistingActiveMap $previousActiveMap -ExistingModeMap $previousModeMap
    } else {
        $null
    }
    if ($bootstrapMaps) {
        if (-not $previousActiveMap) { $previousActiveMap = $bootstrapMaps.active_workspace_by_monitor }
        if (-not $previousModeMap) { $previousModeMap = $bootstrapMaps.monitor_surface_mode_by_monitor }
    }
    Set-NaradaActiveWorkspaceByMonitor -State $runtimeState -MonitorKeys $monitorKeys -WorkspaceId $targetWorkspaceId -PreviousRuntimeState $previousRuntimeState
    Set-NaradaProperty -Object $runtimeState -Name "monitor_surface_mode_by_monitor" -Value $previousModeMap
    $runtimeState | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $runtimeStatePath
    Invoke-NaradaOperatorWorkspaceSelectorProjectionRefresh -Root $UserSiteRoot -PcRoot $PcSiteRoot -AuthorizedBy $MutatingAuthorized
}

if ($Apply) {
    $eventPath = Join-Path $runtimeRoot ("switch_{0}_{1}.json" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), $targetWorkspaceId)
    $event | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $eventPath
    $event["evidence_path"] = $eventPath

    $fromWorkspaceId = if ($previousRuntimeState -and -not [string]::IsNullOrWhiteSpace([string]$previousRuntimeState.active_workspace_id)) {
        [string]$previousRuntimeState.active_workspace_id
    } else {
        $null
    }
    $transitionKind = if ([string]::Equals($fromWorkspaceId, $targetWorkspaceId, [System.StringComparison]::Ordinal)) { "reentry" } elseif ($null -eq $fromWorkspaceId) { "entry" } else { "switch" }
    $transitionEvent = [ordered]@{
        schema = "narada.operator_surfaces.operator_workspace_zone_transition.v0"
        observed_at = Get-Date -Format "o"
        transition_kind = $transitionKind
        entered_workspace_id = $targetWorkspaceId
        exited_workspace_id = $fromWorkspaceId
        user_site_root = $UserSiteRoot
        pc_site_root = $PcSiteRoot
        requested_by = if ([string]::IsNullOrWhiteSpace($MutatingAuthorized)) { $null } else { $MutatingAuthorized }
        selector_context = $selectorContext
        host_topology = $plan.host_topology
        projected_variant_id = [string]$plan.workspace.selected_topology_variant_id
        runtime_explainability = $plan.runtime_explainability
        projection_evidence_path = $eventPath
        apply_event_path = if ($event.apply_event) { $eventPath } else { $null }
        runtime_state_path = $runtimeStatePath
    }
    Write-NaradaJsonLine -Path $transitionLedgerPath -Value $transitionEvent
}

if ($PassThru) {
    $event | ConvertTo-Json -Depth 100
} else {
    [pscustomobject]@{
        Workspace = $targetWorkspaceId
        DisplayName = [string]$plan.workspace.display_name
        Apply = [bool]$Apply
    } | Format-List
}
