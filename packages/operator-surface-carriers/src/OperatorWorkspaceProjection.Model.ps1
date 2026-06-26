$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "HostTopology.Model.ps1")

function ConvertFrom-NaradaJson {
    param([string]$Json)

    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Json | ConvertFrom-Json -Depth 100
    }
    return $Json | ConvertFrom-Json
}

function Get-NaradaIdentityName {
    param([object]$Identity)

    if ($Identity.PSObject.Properties.Name -contains "identity_id" -and -not [string]::IsNullOrWhiteSpace([string]$Identity.identity_id)) {
        return [string]$Identity.identity_id
    }
    return [string]$Identity.identity_name
}

function Get-NaradaAdmittedIdentitySet {
    param([object]$IdentityRegistry)

    $set = @{}
    foreach ($identity in @($IdentityRegistry.identities)) {
        $name = Get-NaradaIdentityName -Identity $identity
        if (-not [string]::IsNullOrWhiteSpace($name)) {
            $set[$name] = $true
        }
    }
    $set
}

function Get-NaradaOperatorWorkspace {
    param(
        [object]$WorkspaceState,
        [string]$WorkspaceId
    )

    if ([string]::IsNullOrWhiteSpace($WorkspaceId)) {
        $WorkspaceId = [string]$WorkspaceState.active_workspace_id
    }
    if ([string]::IsNullOrWhiteSpace($WorkspaceId)) {
        throw "operator_workspace_id_required"
    }

    $workspace = @($WorkspaceState.workspaces | Where-Object { [string]$_.workspace_id -eq $WorkspaceId }) | Select-Object -First 1
    if (-not $workspace) {
        throw "operator_workspace_not_found: $WorkspaceId"
    }
    $workspace
}

function Assert-NaradaOperatorWorkspaceState {
    param(
        [object]$WorkspaceState,
        [object]$IdentityRegistry
    )

    if ([string]$WorkspaceState.schema -ne "narada.operator_surfaces.operator_workspaces.v0") {
        throw "operator_workspace_schema_invalid: $($WorkspaceState.schema)"
    }

    $admitted = Get-NaradaAdmittedIdentitySet -IdentityRegistry $IdentityRegistry
    $workspaceIds = @{}
    foreach ($workspace in @($WorkspaceState.workspaces)) {
        $workspaceId = [string]$workspace.workspace_id
        if ([string]::IsNullOrWhiteSpace($workspaceId)) { throw "operator_workspace_id_missing" }
        if ($workspaceIds.ContainsKey($workspaceId)) { throw "operator_workspace_duplicate_id: $workspaceId" }
        $workspaceIds[$workspaceId] = $true

        foreach ($member in @($workspace.members)) {
            $identityName = [string]$member.identity_name
            if ([string]::IsNullOrWhiteSpace($identityName)) {
                throw "operator_workspace_member_identity_missing: $workspaceId"
            }
            if (-not $admitted.ContainsKey($identityName)) {
                throw "operator_workspace_unknown_identity: $workspaceId -> $identityName"
            }
            $posture = [string]$member.desired_posture
            if ($posture -notin @("visible", "hidden", "minimized", "restorable", "absent_expected")) {
                throw "operator_workspace_invalid_posture: $workspaceId -> $identityName -> $posture"
            }
        }
    }

    if ($WorkspaceState.active_workspace_id -and -not $workspaceIds.ContainsKey([string]$WorkspaceState.active_workspace_id)) {
        throw "operator_workspace_active_unknown: $($WorkspaceState.active_workspace_id)"
    }
}

function Get-KomorebiManagedHwndSet {
    param([object]$KomorebiState)

    $set = @{}
    if (-not $KomorebiState) { return $set }
    foreach ($monitor in @($KomorebiState.monitors.elements)) {
        foreach ($workspace in @($monitor.workspaces.elements)) {
            foreach ($container in @($workspace.containers.elements)) {
                foreach ($window in @($container.windows.elements)) {
                    if ($window.hwnd -ne $null) { $set[[int64]$window.hwnd] = $true }
                }
            }
        }
    }
    if ($set.Count -eq 0) {
        foreach ($monitor in @($KomorebiState.monitors)) {
            foreach ($workspace in @($monitor.workspaces)) {
                foreach ($container in @($workspace.containers)) {
                    foreach ($window in @($container.windows)) {
                        if ($window.hwnd -ne $null) { $set[[int64]$window.hwnd] = $true }
                    }
                }
            }
        }
    }
    $set
}

function Get-NaradaWorkspaceTopologyVariants {
    param([object]$Workspace)

    $variants = @($Workspace.topology_variants)
    if ($variants.Count -eq 0) {
        throw "operator_workspace_topology_variants_missing: $([string]$Workspace.workspace_id)"
    }
    $variants
}

function Select-NaradaWorkspaceTopologyVariant {
    param(
        [object]$Workspace,
        [object]$HostTopology
    )

    $workspaceId = [string]$Workspace.workspace_id
    $defaultVariantId = [string]$Workspace.default_variant_id
    if ([string]::IsNullOrWhiteSpace($defaultVariantId)) {
        throw "operator_workspace_default_variant_missing: $workspaceId"
    }

    $variants = @(Get-NaradaWorkspaceTopologyVariants -Workspace $Workspace)
    $variantById = @{}
    foreach ($variant in $variants) {
        $variantId = [string]$variant.variant_id
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
        $match = $_.match
        $signature = if ($match) { [string]$match.topology_signature } else { $null }
        -not [string]::IsNullOrWhiteSpace($signature) -and [string]::Equals($signature, [string]$HostTopology.topology_signature, [System.StringComparison]::Ordinal)
    })
    if ($signatureMatches.Count -gt 1) {
        throw "operator_workspace_topology_variant_ambiguous_signature: $workspaceId -> $($HostTopology.topology_signature)"
    }
    if ($signatureMatches.Count -eq 1) { return $signatureMatches[0] }

    $displayCountMatches = @($variants | Where-Object {
        $match = $_.match
        if (-not $match) { return $false }
        $count = $match.display_count
        if ($null -eq $count -or [string]::IsNullOrWhiteSpace([string]$count)) { return $false }
        try { [int]$count -eq [int]$HostTopology.display_count } catch { $false }
    })
    if ($displayCountMatches.Count -gt 1) {
        throw "operator_workspace_topology_variant_ambiguous_display_count: $workspaceId -> $([int]$HostTopology.display_count)"
    }
    if ($displayCountMatches.Count -eq 1) { return $displayCountMatches[0] }

    throw "operator_workspace_topology_variant_no_match: $workspaceId -> display_count=$([int]$HostTopology.display_count)"
}

function Get-NaradaWorkspaceMembershipIndex {
    param([object]$WorkspaceState)

    $index = [ordered]@{}
    foreach ($workspace in @($WorkspaceState.workspaces)) {
        $workspaceId = [string]$workspace.workspace_id
        if ([string]::IsNullOrWhiteSpace($workspaceId)) { continue }
        foreach ($member in @($workspace.members)) {
            $identityName = [string]$member.identity_name
            if ([string]::IsNullOrWhiteSpace($identityName)) { continue }
            if (-not $index.Contains($identityName)) {
                $index[$identityName] = [System.Collections.Generic.List[string]]::new()
            }
            $index[$identityName].Add($workspaceId)
        }
    }
    [pscustomobject]$index
}

function New-NaradaWorkspaceRuntimeExplainability {
    param(
        [object]$WorkspaceState,
        [object]$RuntimeBindings,
        [object]$Workspace
    )

    $membershipIndex = Get-NaradaWorkspaceMembershipIndex -WorkspaceState $WorkspaceState
    $workspaceMemberSet = @{}
    foreach ($member in @($Workspace.members)) {
        $workspaceMemberSet[[string]$member.identity_name] = $true
    }

    $runtimeBindings = @($RuntimeBindings.bindings)
    $visibleMemberBindings = [System.Collections.Generic.List[object]]::new()
    foreach ($member in @($Workspace.members)) {
        $identityName = [string]$member.identity_name
        $bindings = @($runtimeBindings | Where-Object { [string]$_.identity_name -eq $identityName })
        $visibleMemberBindings.Add([ordered]@{
            identity_name = $identityName
            runtime_binding_count = @($bindings).Count
            explained = @($bindings).Count -gt 0
        })
    }

    $unexplainedRuntimeBindings = [System.Collections.Generic.List[object]]::new()
    foreach ($binding in $runtimeBindings) {
        $identityName = [string]$binding.identity_name
        $workspaceIds = $membershipIndex.PSObject.Properties.Name | Where-Object {
            [string]::Equals($_, $identityName, [System.StringComparison]::Ordinal)
        }
        if (@($workspaceIds).Count -eq 0) {
            $unexplainedRuntimeBindings.Add([ordered]@{
                identity_name = $identityName
                hwnd = [int64]$binding.hwnd
                observed_process = if ($binding.observed_process) { [string]$binding.observed_process } else { $null }
                observed_class = if ($binding.observed_class) { [string]$binding.observed_class } else { $null }
                reason = "identity_not_declared_in_any_workspace"
            })
        }
    }

    $missingVisibleBindings = @($visibleMemberBindings | Where-Object { -not [bool]$_.explained })
    [ordered]@{
        workspace_id = [string]$Workspace.workspace_id
        explainable = (@($unexplainedRuntimeBindings).Count -eq 0 -and @($missingVisibleBindings).Count -eq 0)
        visible_member_count = @($Workspace.members).Count
        visible_member_binding_count = @($visibleMemberBindings | Where-Object { [bool]$_.explained }).Count
        missing_visible_bindings = @($missingVisibleBindings)
        runtime_binding_count = @($runtimeBindings).Count
        unexplained_runtime_binding_count = @($unexplainedRuntimeBindings).Count
        unexplained_runtime_bindings = @($unexplainedRuntimeBindings)
    }
}

function New-NaradaOperatorWorkspaceProjection {
    param(
        [object]$WorkspaceState,
        [object]$IdentityRegistry,
        [object]$RuntimeBindings,
        [object]$KomorebiState,
        [string]$WorkspaceId
    )

    Assert-NaradaOperatorWorkspaceState -WorkspaceState $WorkspaceState -IdentityRegistry $IdentityRegistry
    $workspace = Get-NaradaOperatorWorkspace -WorkspaceState $WorkspaceState -WorkspaceId $WorkspaceId
    $hostTopology = Get-NaradaHostTopologySnapshot
    $selectedVariant = Select-NaradaWorkspaceTopologyVariant -Workspace $workspace -HostTopology $hostTopology
    $komorebiHwnds = Get-KomorebiManagedHwndSet -KomorebiState $KomorebiState
    $memberIdentitySet = @{}
    foreach ($member in @($workspace.members)) { $memberIdentitySet[[string]$member.identity_name] = $true }

    $members = [System.Collections.Generic.List[object]]::new()
    foreach ($member in @($workspace.members)) {
        $identityName = [string]$member.identity_name
        $bindings = @($RuntimeBindings.bindings | Where-Object { [string]$_.identity_name -eq $identityName })
        $bindingReports = @($bindings | ForEach-Object {
            $hwnd = [int64]$_.hwnd
            $status = if ($_.projection_status) {
                [string]$_.projection_status
            } elseif ($_.stale_reason) {
                "stale"
            } else {
                "runtime_evidence"
            }
            [ordered]@{
                hwnd = $hwnd
                status = $status
                stale_reason = if ($_.stale_reason) { [string]$_.stale_reason } else { $null }
                in_komorebi = $komorebiHwnds.ContainsKey($hwnd)
                observed_process = if ($_.observed_process) { [string]$_.observed_process } else { $null }
                observed_class = if ($_.observed_class) { [string]$_.observed_class } else { $null }
            }
        })

        $members.Add([ordered]@{
            identity_name = $identityName
            desired_posture = [string]$member.desired_posture
            preferred_locus = $member.preferred_locus
            runtime_bindings = @($bindingReports)
            runtime_binding_count = @($bindingReports).Count
            has_runtime_binding = @($bindingReports).Count -gt 0
            stale_binding_count = @($bindingReports | Where-Object { $_.status -eq "stale" }).Count
            komorebi_managed_hwnds = @($bindingReports | Where-Object { $_.in_komorebi } | ForEach-Object { $_.hwnd })
        })
    }

    $offWorkspaceBindings = @($RuntimeBindings.bindings | Where-Object {
        -not $memberIdentitySet.ContainsKey([string]$_.identity_name)
    } | ForEach-Object {
        [ordered]@{
            identity_name = [string]$_.identity_name
            hwnd = [int64]$_.hwnd
            in_komorebi = $komorebiHwnds.ContainsKey([int64]$_.hwnd)
            observed_process = if ($_.observed_process) { [string]$_.observed_process } else { $null }
            observed_class = if ($_.observed_class) { [string]$_.observed_class } else { $null }
            proposed_action = "hide_or_deadmit_when_apply_is_enabled"
        }
    })
    $runtimeExplainability = New-NaradaWorkspaceRuntimeExplainability -WorkspaceState $WorkspaceState -RuntimeBindings $RuntimeBindings -Workspace $workspace
    $focusedIdentity = [string](@($members | Where-Object { [bool]$_.has_runtime_binding } | Select-Object -First 1).identity_name)
    if ([string]::IsNullOrWhiteSpace($focusedIdentity) -and @($members).Count -gt 0) {
        $focusedIdentity = [string]@($members)[0].identity_name
    }

    [ordered]@{
        schema = "narada.operator_surfaces.operator_workspace_projection.v0"
        observed_at = Get-Date -Format "o"
        host_topology = $hostTopology
        workspace = [ordered]@{
            workspace_id = [string]$workspace.workspace_id
            display_name = [string]$workspace.display_name
            active_identity = [string]$focusedIdentity
            focused_identity = [string]$focusedIdentity
            selected_topology_variant_id = [string]$selectedVariant.variant_id
            selected_topology_variant = $selectedVariant
            topology_variants = @($workspace.topology_variants)
        }
        authority = [ordered]@{
            workspace_membership = "User Site SQLite operator-surface.db; operator-workspaces.json is generated projection evidence"
            runtime_hwnd_bindings = "PC Site SQLite operator-surface-runtime.db; JSON bindings are generated projection evidence"
            komorebi = "tiling projection state"
        }
        desired_members = @($members)
        off_workspace_runtime_bindings = @($offWorkspaceBindings)
        runtime_explainability = $runtimeExplainability
        dry_run_switch_plan = [ordered]@{
            mutates = $false
            show_or_restore_current_members = @($members | Where-Object { $_.desired_posture -eq "visible" } | ForEach-Object { $_.identity_name })
            hide_or_deadmit_non_members = @($offWorkspaceBindings | ForEach-Object { $_.identity_name } | Select-Object -Unique)
            komorebi_retile_required = $true
            apply_command_sketch = "Invoke-OperatorWorkspaceProjection.ps1 -WorkspaceId $($workspace.workspace_id) -Apply"
        }
    }
}
