param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = $(if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" }),
    [string]$WorkspaceId,
    [string]$WorkspaceDisplayName,
    [string]$WorkspaceIntent,
    [string]$WorkspaceStatePath,
    [string]$IdentityPath,
    [string]$InspectPath,
    [string]$KomorebiStatePath,
    [Int64]$FocusedHwnd = 0,
    [string]$MutatingAuthorized,
    [switch]$CreateIfMissing,
    [switch]$SingleMonitor,
    [switch]$PlanOnly,
    [switch]$Confirm,
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

function Set-NaradaProperty {
    param([object]$Object, [string]$Name, [object]$Value)

    if ($Object.PSObject.Properties.Name -contains $Name) {
        $Object.PSObject.Properties[$Name].Value = $Value
    } else {
        Add-Member -InputObject $Object -NotePropertyName $Name -NotePropertyValue $Value
    }
}

function Remove-NaradaProperty {
    param([object]$Object, [string]$Name)

    if ($Object.PSObject.Properties.Name -contains $Name) {
        $Object.PSObject.Properties.Remove($Name)
    }
}

function Invoke-OperatorSurfaceMcpOneShot {
    param(
        [string]$ToolName,
        [object]$Arguments,
        [string]$Root
    )

    $serverPath = Join-Path $Root "tools\operator-surface\operator-surface-mcp-server.mjs"
    if (-not (Test-Path -LiteralPath $serverPath)) {
        $serverPath = Join-Path (Split-Path -Parent $PSScriptRoot) "operator-surface\operator-surface-mcp-server.mjs"
    }
    if (-not (Test-Path -LiteralPath $serverPath)) { throw "operator_surface_mcp_server_missing: $serverPath" }
    $node = (Get-Command node -ErrorAction Stop).Source
    $tempDir = Join-Path $Root ".ai\tmp"
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
    $argumentsPath = Join-Path $tempDir ("operator-surface-{0}-{1}.json" -f $ToolName, ([guid]::NewGuid().ToString("N")))
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($argumentsPath, (ConvertTo-NaradaJsonString -Value $Arguments -Depth 100), $utf8NoBom)
    try {
        $output = & $node $serverPath --site-root $Root --pc-site-root $PcSiteRoot --invoke-tool $ToolName --arguments-file $argumentsPath
        if ($LASTEXITCODE -ne 0) { throw "operator_surface_mcp_one_shot_failed: $ToolName exit=$LASTEXITCODE output=$output" }
        ConvertFrom-NaradaJson ($output -join "`n")
    } finally {
        if (Test-Path -LiteralPath $argumentsPath) {
            Remove-Item -LiteralPath $argumentsPath -Force
        }
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

function Get-NaradaMonitorScopeActiveKeys {
    param([object]$MonitorScope)

    $keys = [System.Collections.Generic.List[string]]::new()
    $observed = [string](Get-NaradaObjectValue -Object $MonitorScope -Name "observed_monitor_name")
    if (-not [string]::IsNullOrWhiteSpace($observed)) { $keys.Add($observed) }

    @($keys | Select-Object -Unique)
}

function ConvertTo-NaradaDisplayKey {
    param([string]$Name)

    if ([string]::IsNullOrWhiteSpace($Name)) { return $null }
    if ($Name.StartsWith("\\.\")) { return $Name.Substring(4) }
    [string]$Name
}

function Get-NaradaDisplayKeyFromFrameRect {
    param([object]$FrameRect, [object]$HostTopology)

    if (-not $FrameRect) { throw "operator_workspace_display_key_resolution_missing_frame_rect" }
    if (-not $HostTopology -or -not $HostTopology.screens) { throw "operator_workspace_display_key_resolution_missing_host_topology" }

    $bestKey = $null
    $bestArea = 0
    $left = [int]$FrameRect.left
    $top = [int]$FrameRect.top
    $right = [int]$FrameRect.right
    $bottom = [int]$FrameRect.bottom

    foreach ($screen in @($HostTopology.screens)) {
        $bounds = $screen.bounds
        $overlapLeft = [Math]::Max($left, [int]$bounds.left)
        $overlapTop = [Math]::Max($top, [int]$bounds.top)
        $overlapRight = [Math]::Min($right, [int]$bounds.right)
        $overlapBottom = [Math]::Min($bottom, [int]$bounds.bottom)
        $overlapWidth = [Math]::Max(0, $overlapRight - $overlapLeft)
        $overlapHeight = [Math]::Max(0, $overlapBottom - $overlapTop)
        $area = $overlapWidth * $overlapHeight
        if ($area -gt $bestArea) {
            $bestArea = $area
            $bestKey = [string]$screen.display_key
        }
    }

    if ($bestArea -le 0 -or [string]::IsNullOrWhiteSpace($bestKey)) {
        throw "operator_workspace_display_key_resolution_failed: [$left,$top,$right,$bottom]"
    }

    $bestKey
}

function Get-NaradaObservedMonitorKey {
    param([object]$Entry, [object]$HostTopology)

    $komorebi = Get-NaradaObjectValue -Object $Entry -Name "komorebi"
    $monitorName = if ($komorebi) { [string](Get-NaradaObjectValue -Object $komorebi -Name "monitor_name") } else { $null }
    if (-not [string]::IsNullOrWhiteSpace($monitorName)) { return ConvertTo-NaradaDisplayKey -Name $monitorName }

    $observedName = [string](Get-NaradaObjectValue -Object $Entry -Name "observed_monitor_name")
    if (-not [string]::IsNullOrWhiteSpace($observedName)) { return ConvertTo-NaradaDisplayKey -Name $observedName }

    $frameLeft = Get-NaradaObjectValue -Object $Entry -Name "frame_left"
    $frameTop = Get-NaradaObjectValue -Object $Entry -Name "frame_top"
    $frameRight = Get-NaradaObjectValue -Object $Entry -Name "frame_right"
    $frameBottom = Get-NaradaObjectValue -Object $Entry -Name "frame_bottom"
    if ($null -ne $frameLeft -and $null -ne $frameTop -and $null -ne $frameRight -and $null -ne $frameBottom) {
        return Get-NaradaDisplayKeyFromFrameRect -FrameRect ([pscustomobject]@{
            left = [int]$frameLeft
            top = [int]$frameTop
            right = [int]$frameRight
            bottom = [int]$frameBottom
        }) -HostTopology $HostTopology
    }

    throw "operator_workspace_observed_monitor_key_missing"
}

function Get-NaradaWorkspaceTopologyVariants {
    param([object]$Workspace)

    $variants = @(ConvertTo-NaradaArray (Get-NaradaObjectValue -Object $Workspace -Name "topology_variants"))
    if ($variants.Count -eq 0) {
        throw "operator_workspace_topology_variants_missing: $([string](Get-NaradaObjectValue -Object $Workspace -Name 'workspace_id'))"
    }
    $variants
}

function New-NaradaWorkspaceTopologyVariant {
    param(
        [string]$VariantId,
        [int]$MonitorCount,
        [string]$LayoutIntent,
        [string]$WorkspaceName = "I"
    )

    [pscustomobject][ordered]@{
        variant_id = $VariantId
        match = [pscustomobject][ordered]@{
            display_count = $MonitorCount
        }
        monitor_count = $MonitorCount
        tilers = @(
            [pscustomobject][ordered]@{
                tiler_kind = "komorebi"
                projection_mode = "workspace_members_to_monitor_workspaces"
                workspace_name = $WorkspaceName
                layout_intent = $LayoutIntent
            }
        )
    }
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
    if ($signatureMatches.Count -eq 1) { return $signatureMatches[0] }

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
    if ($displayCountMatches.Count -eq 1) { return $displayCountMatches[0] }

    if ($variantById.ContainsKey($defaultVariantId)) {
        return $variantById[$defaultVariantId]
    }

    throw "operator_workspace_topology_variant_no_match: $workspaceId -> display_count=$([int]$HostTopology.display_count)"
}

function Set-NaradaActiveWorkspaceByMonitor {
    param([object]$State, [string[]]$MonitorKeys, [string]$WorkspaceId, [object]$PreviousState)

    $keys = @($MonitorKeys | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique)
    if ($keys.Count -eq 0) { return }

    $map = [ordered]@{}
    $source = if ($PreviousState) { $PreviousState } else { $State }
    $existing = Get-NaradaObjectValue -Object $source -Name "active_workspace_by_monitor"
    if ($existing) {
        foreach ($prop in $existing.PSObject.Properties) {
            $map[$prop.Name] = [string]$prop.Value
        }
    }
    foreach ($key in $keys) { $map[$key] = $WorkspaceId }

    Set-NaradaProperty -Object $State -Name "active_workspace_by_monitor" -Value ([pscustomobject]$map)
}

function ConvertTo-NaradaJsonString {
    param([object]$Value, [int]$Depth = 100)

    $raw = $Value | ConvertTo-Json -Depth $Depth
    $json = $raw -replace '":\s{2,}', '": '
    $json = [regex]::Replace($json, '(?m)^(?: {4})+', {
        param($match)
        "  " * [int]($match.Value.Length / 4)
    })
    $json = [regex]::Replace($json, '\[\s+\]', '[]')
    ($json.TrimEnd() + [Environment]::NewLine)
}

function Write-OperatorVisibleSavePlan {
    param(
        [string]$WorkspaceId,
        [string]$WorkspaceDisplayName,
        [object]$MonitorScope,
        [int]$MonitorCount,
        [object[]]$VisibleMembers,
        [string]$FocusedIdentity,
        [string]$MutatingAuthorized,
        [bool]$WillMutate,
        [object[]]$Diagnostics
    )

    $scopeKind = [string]$MonitorScope.kind
    $header = if ($WillMutate) { "OPERATOR WORKSPACE SAVE PLAN (MUTATION)" } else { "OPERATOR WORKSPACE SAVE PLAN (DRY RUN)" }
    $separator = "=" * 60

    Write-Host $separator -ForegroundColor Cyan
    Write-Host $header -ForegroundColor Cyan
    Write-Host $separator -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Workspace ID:    " -NoNewline; Write-Host $WorkspaceId -ForegroundColor Yellow
    if (-not [string]::IsNullOrWhiteSpace($WorkspaceDisplayName)) {
        Write-Host "Display Name:    " -NoNewline; Write-Host $WorkspaceDisplayName -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Monitor Scope:   " -NoNewline; Write-Host $scopeKind -ForegroundColor $(if ($scopeKind -eq "single_monitor") { "Magenta" } else { "Green" })
    if ($scopeKind -eq "single_monitor") {
        $monName = [string]$MonitorScope.observed_monitor_name
        $monRole = [string]$MonitorScope.monitor_role
        Write-Host "  Monitor Name:  " -NoNewline; Write-Host $monName -ForegroundColor Magenta
        Write-Host "  Monitor Role:  " -NoNewline; Write-Host $monRole -ForegroundColor Magenta
    }
    Write-Host "Monitor Count:   " -NoNewline; Write-Host $MonitorCount -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Identities to save:" -ForegroundColor Cyan
    foreach ($member in $VisibleMembers) {
        $name = [string]$member.identity_name
        $role = [string]$member.role_in_workspace
        $locus = $member.preferred_locus
        $mon = if ($locus) { [string]$locus.monitor_role } else { "any" }
        $container = if ($locus) { [string]$locus.container_role } else { "companion" }
        $marker = if ($name -eq $FocusedIdentity) { " [FOCUSED / MAIN]" } else { "" }
        Write-Host "  - $name ($role) -> monitor=$mon, container=$container" -NoNewline
        Write-Host $marker -ForegroundColor Yellow
    }
    Write-Host ""
    if ($Diagnostics -and $Diagnostics.Count -gt 0) {
        Write-Host "Diagnostics:" -ForegroundColor DarkYellow
        foreach ($d in $Diagnostics) {
            Write-Host "  [$($d.kind)] $($d.identity_name)" -ForegroundColor DarkYellow
        }
        Write-Host ""
    }
    if ($WillMutate) {
        Write-Host "Authorized by:   " -NoNewline; Write-Host $MutatingAuthorized -ForegroundColor Green
        Write-Host ""
        Write-Host "This WILL mutate:" -ForegroundColor Red
        Write-Host "  - $WorkspaceStatePath" -ForegroundColor Red
        Write-Host "  - $runtimeStatePath" -ForegroundColor Red
    } else {
        Write-Host "This is a DRY RUN. No files will be mutated." -ForegroundColor Green
    }
    Write-Host $separator -ForegroundColor Cyan
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

function Get-NaradaIdentityName {
    param([object]$Identity)

    if ($Identity.PSObject.Properties.Name -contains "identity_id" -and -not [string]::IsNullOrWhiteSpace([string]$Identity.identity_id)) {
        return [string]$Identity.identity_id
    }
    return [string]$Identity.identity_name
}

function Get-NaradaIdentityRole {
    param([object]$Identity)

    if ($Identity.PSObject.Properties.Name -contains "role" -and -not [string]::IsNullOrWhiteSpace([string]$Identity.role)) {
        return [string]$Identity.role
    }
    if ($Identity.role_metadata -and -not [string]::IsNullOrWhiteSpace([string]$Identity.role_metadata.role)) {
        return [string]$Identity.role_metadata.role
    }
    return "operator_surface"
}

function Get-ForegroundWindowHandle {
    Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NaradaSaveWorkspaceNative {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
}
"@
    [NaradaSaveWorkspaceNative]::GetForegroundWindow().ToInt64()
}

function Get-ActiveWorkspaceId {
    param([object]$WorkspaceState, [string]$RuntimeStatePath)

    if (Test-Path -LiteralPath $RuntimeStatePath) {
        try {
            $runtime = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($RuntimeStatePath))
            if (-not [string]::IsNullOrWhiteSpace([string]$runtime.active_workspace_id)) {
                return [string]$runtime.active_workspace_id
            }
        } catch {
            # Runtime state is authoritative here; continue to explicit failure below.
        }
    }

    throw "operator_workspace_runtime_active_workspace_id_missing"
}

function Get-OverlayInspection {
    param([string]$Path, [string]$Root)

    if (-not [string]::IsNullOrWhiteSpace($Path)) {
        return ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($Path))
    }

    $inspectScript = Join-Path $Root "tools\window-surface-overlay\Inspect-WindowSurfaceOverlay.ps1"
    if (-not (Test-Path -LiteralPath $inspectScript)) {
        throw "window_surface_overlay_inspect_missing: $inspectScript"
    }

    $output = & pwsh.exe -NoProfile -ExecutionPolicy Bypass -File $inspectScript 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "window_surface_overlay_inspect_failed: $($output -join "`n")"
    }
    ConvertFrom-NaradaJson (($output | Out-String).Trim())
}

function Get-KomorebiState {
    param([string]$Path)

    if (-not [string]::IsNullOrWhiteSpace($Path)) {
        return ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($Path))
    }

    $komorebic = Get-Command komorebic -ErrorAction SilentlyContinue
    if (-not $komorebic) { return $null }
    $raw = & $komorebic.Source state 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) { return $null }
    ConvertFrom-NaradaJson (($raw | Out-String).Trim())
}

function Get-KomorebiWindowMap {
    param([object]$State)

    $map = @{}
    if (-not $State) { return $map }

    $monitorIndex = 0
    foreach ($monitor in @($State.monitors.elements)) {
        $workspaceIndex = 0
        foreach ($workspace in @($monitor.workspaces.elements)) {
            $containerIndex = 0
            foreach ($container in @($workspace.containers.elements)) {
                foreach ($window in @($container.windows.elements)) {
                    if ($null -eq $window.hwnd) { continue }
                    $map[[int64]$window.hwnd] = [ordered]@{
                        monitor_index = $monitorIndex
                        monitor_name = [string]$monitor.name
                        monitor_left = [int]$monitor.size.left
                        monitor_top = [int]$monitor.size.top
                        workspace_index = $workspaceIndex
                        workspace_name = [string]$workspace.name
                        container_index = $containerIndex
                        rect = $window.rect
                    }
                }
                $containerIndex++
            }
            $workspaceIndex++
        }
        $monitorIndex++
    }

    $map
}

function Get-MonitorRole {
    param([string]$MonitorKey, [object]$HostTopology)

    if ([string]::IsNullOrWhiteSpace($MonitorKey)) {
        throw "operator_workspace_monitor_role_resolution_missing_monitor_key"
    }
    if (-not $HostTopology -or -not $HostTopology.display_count) {
        throw "operator_workspace_monitor_role_resolution_missing_host_topology"
    }

    if ($HostTopology.display_count -le 1) { return "any" }
    if ([string]::Equals([string]$HostTopology.primary_display_key, $MonitorKey, [System.StringComparison]::Ordinal)) {
        return "right_or_primary"
    }
    if ([int]$HostTopology.display_count -eq 2) { return "left_or_secondary" }
    return "any"
}

function Get-ObservedWindowEntry {
    param([object[]]$Inspection, [Int64]$Hwnd, [object]$HostTopology)

    foreach ($item in $Inspection) {
        if ($null -eq $item.window -or $null -eq $item.window.hwnd) { continue }
        if ([int64]$item.window.hwnd -ne $Hwnd) { continue }
        $frame = $item.window.frame_rect
        if (-not $frame) { $frame = $item.window.window_rect }
        if (-not $frame) { return $null }
        return [ordered]@{
            hwnd = $Hwnd
            frame_left = [int]$frame.left
            frame_top = [int]$frame.top
            frame_right = [int]$frame.right
            frame_bottom = [int]$frame.bottom
            komorebi = $null
        }
    }

    $null
}

if ([string]::IsNullOrWhiteSpace($WorkspaceStatePath)) {
    $WorkspaceStatePath = Join-Path $UserSiteRoot "operator-surfaces\operator-workspaces.json"
}
if ([string]::IsNullOrWhiteSpace($IdentityPath)) {
    $IdentityPath = Join-Path $UserSiteRoot "operator-surfaces\identities.json"
}
if (-not (Test-Path -LiteralPath $WorkspaceStatePath)) { throw "operator_workspace_state_missing: $WorkspaceStatePath" }
if (-not (Test-Path -LiteralPath $IdentityPath)) { throw "identity_registry_missing: $IdentityPath" }

if (-not $PlanOnly -and [string]::IsNullOrWhiteSpace($MutatingAuthorized)) {
    throw "save_current_operator_workspace_requires_-MutatingAuthorized"
}

$workspaceState = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($WorkspaceStatePath))
$identityRegistry = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($IdentityPath))
$hostTopology = Get-NaradaHostTopologySnapshot
$runtimeStatePath = Join-Path $PcSiteRoot "runtime\operator-workspaces\current.json"
if ([string]::IsNullOrWhiteSpace($WorkspaceId)) {
    $WorkspaceId = Get-ActiveWorkspaceId -WorkspaceState $workspaceState -RuntimeStatePath $runtimeStatePath
}
$workspace = @(ConvertTo-NaradaArray $workspaceState.workspaces | Where-Object { [string]$_.workspace_id -eq $WorkspaceId }) | Select-Object -First 1
if (-not $workspace) {
    if (-not $CreateIfMissing) { throw "operator_workspace_not_found: $WorkspaceId" }
    if ($PlanOnly) { throw "operator_workspace_create_requires_mutation: $WorkspaceId" }
    $createdMonitorCount = if ($SingleMonitor) { 1 } else { [int]$hostTopology.display_count }
    $createdVariantId = "display_count_{0}" -f [int]$createdMonitorCount
    $createdLayoutIntent = if ([int]$createdMonitorCount -eq 1) { "saved_current_single_monitor_visible_members" } else { "saved_current_visible_members" }

    $workspace = [pscustomobject][ordered]@{
        workspace_id = $WorkspaceId
        surface_state = "running"
        display_name = if ([string]::IsNullOrWhiteSpace($WorkspaceDisplayName)) { $WorkspaceId } else { $WorkspaceDisplayName }
        intent = if ([string]::IsNullOrWhiteSpace($WorkspaceIntent)) { "saved current operator workspace" } else { $WorkspaceIntent }
        members = @()
        hidden_members = @()
        monitor_count = [int]$createdMonitorCount
        default_variant_id = $createdVariantId
        topology_variants = @(
            New-NaradaWorkspaceTopologyVariant -VariantId $createdVariantId -MonitorCount ([int]$createdMonitorCount) -LayoutIntent $createdLayoutIntent
        )
        projection = [pscustomobject][ordered]@{
            tilers = @(
                [pscustomobject][ordered]@{
                    tiler_kind = "komorebi"
                    projection_mode = "workspace_members_to_monitor_workspaces"
                    workspace_name = "I"
                    layout_intent = $createdLayoutIntent
                }
            )
        }
    }
    Set-NaradaProperty -Object $workspaceState -Name "workspaces" -Value (@(ConvertTo-NaradaArray $workspaceState.workspaces) + @($workspace))
}

$selectedVariant = Select-NaradaWorkspaceTopologyVariant -Workspace $workspace -HostTopology $hostTopology

$identityByName = @{}
foreach ($identity in (ConvertTo-NaradaArray $identityRegistry.identities)) {
    $name = Get-NaradaIdentityName -Identity $identity
    if (-not [string]::IsNullOrWhiteSpace($name)) { $identityByName[$name] = $identity }
}

$inspect = ConvertTo-NaradaArray (Get-OverlayInspection -Path $InspectPath -Root $UserSiteRoot)
$komorebiState = Get-KomorebiState -Path $KomorebiStatePath
$komorebiMap = Get-KomorebiWindowMap -State $komorebiState
if ($FocusedHwnd -eq 0) {
    $FocusedHwnd = Get-ForegroundWindowHandle
}
$focusedKomorebiEntry = if ($komorebiMap.ContainsKey([int64]$FocusedHwnd)) { $komorebiMap[[int64]$FocusedHwnd] } else { $null }
$focusedObservedWindowEntry = Get-ObservedWindowEntry -Inspection $inspect -Hwnd $FocusedHwnd -HostTopology $hostTopology
if ($focusedObservedWindowEntry -and $focusedKomorebiEntry) {
    $focusedObservedWindowEntry.komorebi = $focusedKomorebiEntry
}

$observed = [System.Collections.Generic.List[object]]::new()
$diagnostics = [System.Collections.Generic.List[object]]::new()
foreach ($item in $inspect) {
    if ($null -eq $item.matched) { continue }
    if ($item.ignored_reason) { continue }
    if (-not [bool]$item.window.visible) { continue }
    if ([bool]$item.window.minimized) { continue }
    if ([bool]$item.window.cloaked) { continue }

    $identityName = [string]$item.matched.surface_id
    if ([string]::IsNullOrWhiteSpace($identityName)) { continue }
    if (-not $identityByName.ContainsKey($identityName)) {
        $diagnostics.Add([ordered]@{
            kind = "inspect_identity_not_admitted"
            identity_name = $identityName
            hwnd = [int64]$item.window.hwnd
        })
        continue
    }

    $frame = $item.window.frame_rect
    if (-not $frame) { $frame = $item.window.window_rect }
    $hwnd = [int64]$item.window.hwnd
    $komorebi = if ($komorebiMap.ContainsKey($hwnd)) { $komorebiMap[$hwnd] } else { $null }
    $observed.Add([ordered]@{
        identity_name = $identityName
        hwnd = $hwnd
        frame_left = if ($frame) { [int]$frame.left } else { 0 }
        frame_top = if ($frame) { [int]$frame.top } else { 0 }
        frame_right = if ($frame) { [int]$frame.right } else { 0 }
        frame_bottom = if ($frame) { [int]$frame.bottom } else { 0 }
        komorebi = $komorebi
    })
}

if ($observed.Count -eq 0) {
    throw "no_visible_bound_operator_surfaces_to_save"
}

$deduped = [System.Collections.Generic.List[object]]::new()
$seen = @{}
foreach ($entry in @($observed | Sort-Object frame_left, frame_top, identity_name)) {
    $identityName = [string]$entry.identity_name
    if ($seen.ContainsKey($identityName)) {
        $diagnostics.Add([ordered]@{
            kind = "duplicate_visible_identity_ignored"
            identity_name = $identityName
            hwnd = [int64]$entry.hwnd
        })
        continue
    }
    $seen[$identityName] = $true
    $deduped.Add($entry)
}

$monitorScope = [ordered]@{
    kind = "all_monitors"
}

if ($SingleMonitor) {
    $focusedObservedEntry = @($deduped | Where-Object { [int64]$_."hwnd" -eq $FocusedHwnd }) | Select-Object -First 1
    if (-not $focusedObservedEntry) {
        $focusedObservedEntry = if ($focusedObservedWindowEntry) { [pscustomobject]$focusedObservedWindowEntry } else { $null }
    }
    if (-not $focusedObservedEntry -and $focusedKomorebiEntry) {
        $focusedObservedEntry = [pscustomobject][ordered]@{
            hwnd = $FocusedHwnd
            frame_left = [int]$focusedKomorebiEntry.rect.left
            frame_top = [int]$focusedKomorebiEntry.rect.top
            frame_right = [int]$focusedKomorebiEntry.rect.right
            frame_bottom = [int]$focusedKomorebiEntry.rect.bottom
            komorebi = $focusedKomorebiEntry
        }
    }
    if (-not $focusedObservedEntry) {
        throw "single_monitor_workspace_requires_focused_window_monitor_evidence: focused HWND $FocusedHwnd was not observed in overlay inspection or Komorebi state"
    }

    $focusedMonitorKey = if ($focusedObservedEntry.komorebi) {
        ConvertTo-NaradaDisplayKey -Name ([string]$focusedObservedEntry.komorebi.monitor_name)
    } elseif ($focusedObservedEntry.display_key) {
        [string]$focusedObservedEntry.display_key
    } else {
        Get-NaradaDisplayKeyFromFrameRect -FrameRect ([pscustomobject]@{
            left = [int]$focusedObservedEntry.frame_left
            top = [int]$focusedObservedEntry.frame_top
            right = [int]$focusedObservedEntry.frame_right
            bottom = [int]$focusedObservedEntry.frame_bottom
        }) -HostTopology $hostTopology
    }
    $focusedMonitorRole = Get-MonitorRole -MonitorKey $focusedMonitorKey -HostTopology $hostTopology

    $filtered = [System.Collections.Generic.List[object]]::new()
    foreach ($entry in $deduped) {
        $entryMonitorKey = if ($entry.komorebi) {
            ConvertTo-NaradaDisplayKey -Name ([string]$entry.komorebi.monitor_name)
        } elseif ($entry.display_key) {
            [string]$entry.display_key
        } else {
            Get-NaradaDisplayKeyFromFrameRect -FrameRect ([pscustomobject]@{
                left = [int]$entry.frame_left
                top = [int]$entry.frame_top
                right = [int]$entry.frame_right
                bottom = [int]$entry.frame_bottom
            }) -HostTopology $hostTopology
        }
        $entryMonitorRole = Get-MonitorRole -MonitorKey $entryMonitorKey -HostTopology $hostTopology
        $sameMonitor = [string]::Equals($focusedMonitorKey, $entryMonitorKey, [System.StringComparison]::Ordinal)

        if ($sameMonitor) { $filtered.Add($entry) }
    }

    if ($filtered.Count -eq 0) {
        throw "single_monitor_workspace_has_no_visible_members_after_filter"
    }

    $deduped = $filtered
    $monitorScope = [ordered]@{
        kind = "single_monitor"
        monitor_role = $focusedMonitorRole
        observed_monitor_name = $focusedMonitorKey
        focused_hwnd = $FocusedHwnd
    }
}

$focusedEntry = @($deduped | Where-Object { [int64]$_."hwnd" -eq $FocusedHwnd }) | Select-Object -First 1
$focusedIdentity = if ($focusedEntry) { [string]$focusedEntry.identity_name } else { [string]$deduped[0].identity_name }

    $visibleMembers = [System.Collections.Generic.List[object]]::new()
    foreach ($entry in $deduped) {
        $identity = $identityByName[[string]$entry.identity_name]
        $role = Get-NaradaIdentityRole -Identity $identity
        $komorebi = $entry.komorebi
        $entryMonitorKey = if ($komorebi) {
            ConvertTo-NaradaDisplayKey -Name ([string]$komorebi.monitor_name)
        } elseif ($entry.display_key) {
            [string]$entry.display_key
        } else {
            Get-NaradaDisplayKeyFromFrameRect -FrameRect ([pscustomobject]@{
                left = [int]$entry.frame_left
                top = [int]$entry.frame_top
                right = [int]$entry.frame_right
                bottom = [int]$entry.frame_bottom
            }) -HostTopology $hostTopology
        }
        $monitorRole = Get-MonitorRole -MonitorKey $entryMonitorKey -HostTopology $hostTopology
        $workspaceName = if ($workspace.projection.tilers) {
            $komorebiTiler = @($workspace.projection.tilers | Where-Object { [string]$_.tiler_kind -eq "komorebi" }) | Select-Object -First 1
            if ($komorebiTiler -and -not [string]::IsNullOrWhiteSpace([string]$komorebiTiler.workspace_name)) { [string]$komorebiTiler.workspace_name } else { "I" }
        } else {
            "I"
        }
        $containerRole = if ([string]$entry.identity_name -eq $focusedIdentity) { "main" } else { "companion" }

    $visibleMembers.Add([ordered]@{
        identity_name = [string]$entry.identity_name
        role_in_workspace = $role
        desired_posture = "visible"
        preferred_locus = [ordered]@{
            monitor_role = $monitorRole
            komorebi_workspace = $workspaceName
            container_role = $containerRole
        }
    })
}

$visibleIdentitySet = @{}
foreach ($member in $visibleMembers) { $visibleIdentitySet[[string]$member.identity_name] = $true }

$visibleMonitorKeys = @($deduped | ForEach-Object { Get-NaradaObservedMonitorKey -Entry $_ -HostTopology $hostTopology } | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Sort-Object -Unique)
$monitorCount = [int](Get-NaradaObjectValue -Object $selectedVariant -Name "monitor_count")
if ($monitorCount -le 0) {
    throw "operator_workspace_topology_variant_monitor_count_invalid: $WorkspaceId -> $([string](Get-NaradaObjectValue -Object $selectedVariant -Name 'variant_id'))"
}
if ($visibleMonitorKeys.Count -ne $monitorCount) {
    throw "operator_workspace_visible_monitor_count_mismatch: $WorkspaceId -> expected=$monitorCount actual=$($visibleMonitorKeys.Count)"
}

$preservedHiddenMembers = @($workspace.members | Where-Object {
    $identityName = [string]$_.identity_name
    -not $visibleIdentitySet.ContainsKey($identityName) -and
    ([string]$_.desired_posture -in @("hidden", "minimized", "restorable", "absent_expected"))
})

$newMembers = @($visibleMembers) + @($preservedHiddenMembers)
$newHiddenMembers = @($preservedHiddenMembers | ForEach-Object { [string]$_.identity_name })

$selectedKomorebiTiler = @($selectedVariant.tilers | Where-Object { [string]$_.tiler_kind -eq "komorebi" }) | Select-Object -First 1
if (-not $selectedKomorebiTiler) {
    throw "operator_workspace_selected_variant_missing_komorebi_tiler: $WorkspaceId -> $([string](Get-NaradaObjectValue -Object $selectedVariant -Name 'variant_id'))"
}
$workspaceNameForProjection = if (-not [string]::IsNullOrWhiteSpace([string]$selectedKomorebiTiler.workspace_name)) { [string]$selectedKomorebiTiler.workspace_name } else { "I" }

$result = [ordered]@{
    schema = "narada.operator_surfaces.save_current_operator_workspace_event.v0"
    observed_at = Get-Date -Format "o"
    user_site_root = $UserSiteRoot
    pc_site_root = $PcSiteRoot
    workspace_id = $WorkspaceId
    mutates = -not [bool]$PlanOnly
    mutation_authorized_by = if ($PlanOnly) { $null } else { $MutatingAuthorized }
    focused_hwnd = $FocusedHwnd
    focused_identity = $focusedIdentity
    saved_members = @($visibleMembers | ForEach-Object { $_.identity_name })
    preserved_hidden_members = @($newHiddenMembers)
    monitor_scope = $monitorScope
    monitor_count = $monitorCount
    diagnostics = @($diagnostics)
    runtime_state_path = $runtimeStatePath
    evidence_path = $null
}

$displayNameForPlan = if ([string]::IsNullOrWhiteSpace($WorkspaceDisplayName)) { [string]$workspace.display_name } else { $WorkspaceDisplayName }

$showPlan = $PlanOnly -or $Confirm -or ($PassThru -eq $false)
if ($showPlan) {
    Write-OperatorVisibleSavePlan `
        -WorkspaceId $WorkspaceId `
        -WorkspaceDisplayName $displayNameForPlan `
        -MonitorScope $monitorScope `
        -MonitorCount $monitorCount `
        -VisibleMembers $visibleMembers `
        -FocusedIdentity $focusedIdentity `
        -MutatingAuthorized $MutatingAuthorized `
        -WillMutate (-not $PlanOnly) `
        -Diagnostics $diagnostics
}

if ($Confirm -and -not $PlanOnly) {
    $prompt = Read-Host "Proceed with save? [y/N]"
    if ($prompt -notin @("y","Y","yes","YES")) {
        Write-Host "Save cancelled by operator." -ForegroundColor Red
        exit 1
    }
}

if (-not $PlanOnly) {
    Set-NaradaProperty -Object $workspace -Name "members" -Value @($newMembers)
    Set-NaradaProperty -Object $workspace -Name "hidden_members" -Value @($newHiddenMembers)
    Set-NaradaProperty -Object $workspace -Name "surface_state" -Value "running"
    Set-NaradaProperty -Object $workspace -Name "monitor_count" -Value $monitorCount
    Set-NaradaProperty -Object $workspace -Name "monitor_scope" -Value $monitorScope
    Set-NaradaProperty -Object $workspaceState -Name "updated_at" -Value (Get-Date -Format "o")

    if (-not $workspace.projection) {
        Set-NaradaProperty -Object $workspace -Name "projection" -Value ([pscustomobject][ordered]@{})
    }
    Remove-NaradaProperty -Object $workspace.projection -Name "windows_virtual_desktop"
    $tilers = @($selectedVariant.tilers)
    $komorebiTiler = @($tilers | Where-Object { [string]$_.tiler_kind -eq "komorebi" }) | Select-Object -First 1
    if (-not $komorebiTiler) {
        $komorebiTiler = [pscustomobject][ordered]@{
            tiler_kind = "komorebi"
        }
        $tilers = @($tilers) + @($komorebiTiler)
    }
    Set-NaradaProperty -Object $komorebiTiler -Name "projection_mode" -Value "workspace_members_to_monitor_workspaces"
    Set-NaradaProperty -Object $komorebiTiler -Name "workspace_name" -Value $workspaceNameForProjection
    Set-NaradaProperty -Object $komorebiTiler -Name "layout_intent" -Value $(if ($monitorCount -eq 1) { "saved_current_single_monitor_visible_members" } else { "saved_current_visible_members" })
    Set-NaradaProperty -Object $selectedVariant -Name "monitor_count" -Value $monitorCount
    Set-NaradaProperty -Object $selectedVariant -Name "tilers" -Value @($tilers)
    Set-NaradaProperty -Object $workspace.projection -Name "tilers" -Value @($tilers)

    $workspaceAuthorityPath = Join-Path $UserSiteRoot ".ai\db\operator-surface.db"
    $workspaceRegistration = Invoke-OperatorSurfaceMcpOneShot -ToolName "operator_surface_register_workspace" -Root $UserSiteRoot -Arguments ([ordered]@{
        workspace_id = $WorkspaceId
        workspace = $workspace
        admitted_by = $MutatingAuthorized
    })
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)

    $evidenceDir = Join-Path $PcSiteRoot "runtime\operator-workspaces"
    New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
    $previousRuntimeState = $null
    if (Test-Path -LiteralPath $runtimeStatePath) {
        try {
            $previousRuntimeState = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($runtimeStatePath))
        } catch {
            $previousRuntimeState = $null
        }
    }
    $runtimeState = [pscustomobject][ordered]@{
        schema = "narada.operator_surfaces.operator_workspace_runtime_state.v0"
        active_workspace_id = $WorkspaceId
        active_display_name = [string]$workspace.display_name
        updated_at = Get-Date -Format "o"
        updated_by = $MutatingAuthorized
        authority_source = $workspaceAuthorityPath
        projection_source = $WorkspaceStatePath
    }
    if (-not $previousRuntimeState) {
        throw "operator_workspace_runtime_state_missing: $runtimeStatePath"
    }
    $previousActiveMap = Get-NaradaObjectValue -Object $previousRuntimeState -Name "active_workspace_by_monitor"
    $previousModeMap = Get-NaradaObjectValue -Object $previousRuntimeState -Name "monitor_surface_mode_by_monitor"
    if (-not $previousActiveMap -or -not $previousModeMap) {
        $bootstrapActive = [ordered]@{}
        $bootstrapMode = [ordered]@{}
        $displayKeys = @($hostTopology.display_keys)
        $limit = [Math]::Min([Math]::Max([int]$monitorCount, 1), $displayKeys.Count)
        for ($index = 0; $index -lt $displayKeys.Count; $index++) {
            $displayKey = [string]$displayKeys[$index]
            if ($index -lt $limit) {
                $bootstrapActive[$displayKey] = $WorkspaceId
                $bootstrapMode[$displayKey] = "operator_surface"
            } else {
                $bootstrapMode[$displayKey] = "windows_native"
            }
        }
        if (-not $previousActiveMap) { $previousActiveMap = [pscustomobject]$bootstrapActive }
        if (-not $previousModeMap) { $previousModeMap = [pscustomobject]$bootstrapMode }
    }
    Set-NaradaActiveWorkspaceByMonitor -State $runtimeState -MonitorKeys $visibleMonitorKeys -WorkspaceId $WorkspaceId -PreviousState $previousRuntimeState
    Set-NaradaProperty -Object $runtimeState -Name "monitor_surface_mode_by_monitor" -Value $previousModeMap
    [System.IO.File]::WriteAllText($runtimeStatePath, (ConvertTo-NaradaJsonString -Value $runtimeState -Depth 20), $utf8NoBom)
    Invoke-NaradaOperatorWorkspaceSelectorProjectionRefresh -Root $UserSiteRoot -PcRoot $PcSiteRoot -AuthorizedBy $MutatingAuthorized

    $evidencePath = Join-Path $evidenceDir ("save_{0}_{1}.json" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), $WorkspaceId)
    $result.evidence_path = $evidencePath
    $result.workspace_authority_path = $workspaceAuthorityPath
    $result.workspace_projection_path = $WorkspaceStatePath
    $result.workspace_registration = $workspaceRegistration
    [System.IO.File]::WriteAllText($evidencePath, (ConvertTo-NaradaJsonString -Value $result -Depth 100), $utf8NoBom)
}

if ($PassThru) {
    $result | ConvertTo-Json -Depth 100
} else {
    [pscustomobject]@{
        Workspace = $WorkspaceId
        SavedMembers = ($result.saved_members -join ", ")
        FocusedIdentity = $focusedIdentity
        Mutates = -not [bool]$PlanOnly
        EvidencePath = $result.evidence_path
    } | Format-List
}
