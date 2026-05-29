#!/usr/bin/env pwsh
# Invoke-OperatorWorkspaceProjection.ps1
# Read-only projection of a Narada operator workspace onto current runtime state.
# When -Apply is passed, also applies window visibility and Komorebi retile.

param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$WorkspaceStatePath,
    [string]$IdentityPath,
    [string]$RuntimeBindingPath,
    [string]$KomorebiStatePath,
    [string]$WorkspaceId,
    [switch]$Apply,
    [string]$OffWorkspaceInhabitedCarrierAction = "minimize",
    [switch]$SkipKomorebiRetile,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

# ─── JSON helpers ───
function ConvertFrom-NaradaJson {
    param([string]$Json)
    $cmd = Get-Command ConvertFrom-Json
    if ($cmd.Parameters.ContainsKey("Depth")) { return $Json | ConvertFrom-Json -Depth 100 }
    return $Json | ConvertFrom-Json
}

function Write-NaradaOutput {
    param([object]$Value)
    $json = $Value | ConvertTo-Json -Depth 80 -Compress
    Write-Host $json
}

# ─── Resolve default paths ───
if ([string]::IsNullOrWhiteSpace($WorkspaceStatePath)) {
    $WorkspaceStatePath = Join-Path $UserSiteRoot "operator-surfaces\operator-workspaces.json"
}
if ([string]::IsNullOrWhiteSpace($IdentityPath)) {
    $IdentityPath = Join-Path $UserSiteRoot "operator-surfaces\identities.json"
}
if ([string]::IsNullOrWhiteSpace($RuntimeBindingPath)) {
    $RuntimeBindingPath = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\operator-surface-window-bindings.json"
}
if ([string]::IsNullOrWhiteSpace($KomorebiStatePath)) {
    $KomorebiStatePath = $null
}

# ─── Load authority and runtime ───
$workspaceState = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($WorkspaceStatePath))
$identityRegistry = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($IdentityPath))

$runtimeBindings = [ordered]@{ schema = "narada.operator_surfaces.runtime_window_bindings.v0"; bindings = @() }
if (Test-Path $RuntimeBindingPath) {
    $runtimeBindings = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($RuntimeBindingPath))
}

$komorebiState = $null
if ($KomorebiStatePath -and (Test-Path $KomorebiStatePath)) {
    $komorebiState = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($KomorebiStatePath))
}

# ─── Host topology ───
Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
$topologySignature = ""
foreach ($s in ($screens | Sort-Object { $_.DeviceName })) {
    $topologySignature += "$($s.DeviceName):$($s.Bounds.Left),$($s.Bounds.Top),$($s.Bounds.Width)x$($s.Bounds.Height);"
}
$hostTopology = [ordered]@{
    display_count       = $screens.Length
    primary_display_name = ($screens | Where-Object { $_.Primary } | Select-Object -First 1).DeviceName
    topology_signature  = ($topologySignature | ForEach-Object { $_.ToString() } | Out-String).Trim()
    screens = @($screens | ForEach-Object {
        [ordered]@{
            device_name = $_.DeviceName
            primary     = $_.Primary
            bounds      = [ordered]@{
                left   = $_.Bounds.Left
                top    = $_.Bounds.Top
                right  = $_.Bounds.Right
                bottom = $_.Bounds.Bottom
                width  = $_.Bounds.Width
                height = $_.Bounds.Height
            }
            working_area = [ordered]@{
                left   = $_.WorkingArea.Left
                top    = $_.WorkingArea.Top
                right  = $_.WorkingArea.Right
                bottom = $_.WorkingArea.Bottom
                width  = $_.WorkingArea.Width
                height = $_.WorkingArea.Height
            }
        }
    })
}

# ─── Find target workspace ───
$workspaces = @($workspaceState.workspaces)
if (-not $workspaces) { $workspaces = @() }

$targetWorkspace = $workspaces | Where-Object { [string]$_.workspace_id -eq $WorkspaceId } | Select-Object -First 1
if (-not $targetWorkspace) {
    throw "operator_workspace_not_found: $WorkspaceId"
}

# ─── Select topology variant ───
$variants = @($targetWorkspace.topology_variants)
if ($variants.Count -eq 0) { throw "operator_workspace_topology_variants_missing: $WorkspaceId" }

$selectedVariant = $null
$defaultVariantId = [string]$targetWorkspace.default_variant_id
foreach ($v in $variants) {
    $match = $v.match
    if ($match -and [string]$match.display_count -eq [string]$hostTopology.display_count) {
        $selectedVariant = $v
        break
    }
}
if (-not $selectedVariant -and -not [string]::IsNullOrWhiteSpace($defaultVariantId)) {
    $selectedVariant = $variants | Where-Object { [string]$_.variant_id -eq $defaultVariantId } | Select-Object -First 1
}
if (-not $selectedVariant) { $selectedVariant = $variants | Select-Object -First 1 }

# ─── Build admitted identity set ───
$admitted = @{}
foreach ($id in @($identityRegistry.identities)) {
    $name = if ($id.identity_id) { [string]$id.identity_id } else { [string]$id.identity_name }
    if (-not [string]::IsNullOrWhiteSpace($name)) { $admitted[$name] = $id }
}

# ─── Resolve bindings ───
$bindingsByIdentity = @{}
$staleByIdentity = @{}
foreach ($b in @($runtimeBindings.bindings)) {
    $iname = [string]$b.identity_name
    if ([string]::IsNullOrWhiteSpace($iname)) { continue }
    $status = [string]$b.projection_status
    if ($status -eq "stale") {
        if (-not $staleByIdentity.ContainsKey($iname)) { $staleByIdentity[$iname] = 0 }
        $staleByIdentity[$iname]++
    } else {
        if (-not $bindingsByIdentity.ContainsKey($iname)) { $bindingsByIdentity[$iname] = [System.Collections.Generic.List[object]]::new() }
        $bindingsByIdentity[$iname].Add($b)
    }
}

# ─── Resolve desired members ───
$desiredMembers = @()
$visibleMemberIds = @{}
foreach ($m in @($targetWorkspace.members)) {
    $iname = [string]$m.identity_name
    $posture = [string]$m.desired_posture
    $identity = $admitted[$iname]
    $liveBindings = if ($bindingsByIdentity.ContainsKey($iname)) { @($bindingsByIdentity[$iname]) } else { @() }
    $staleCount = if ($staleByIdentity.ContainsKey($iname)) { $staleByIdentity[$iname] } else { 0 }

    $desiredMembers += [ordered]@{
        identity_name        = $iname
        desired_posture      = $posture
        role_in_workspace    = [string]$m.role_in_workspace
        preferred_locus      = $m.preferred_locus
        live_binding_count   = $liveBindings.Count
        stale_binding_count  = $staleCount
        missing_binding      = ($liveBindings.Count -eq 0 -and $staleCount -eq 0)
        bound_hwnds          = @($liveBindings | ForEach-Object { $_.hwnd })
    }

    if ($posture -eq "visible") { $visibleMemberIds[$iname] = $true }
}

# ─── Off-workspace runtime bindings ───
$offWorkspaceBindings = @()
foreach ($b in @($runtimeBindings.bindings)) {
    $iname = [string]$b.identity_name
    if (-not $visibleMemberIds.ContainsKey($iname)) {
        $offWorkspaceBindings += $b
    }
}

# ─── Workspace projection ───
$workspaceProjection = [ordered]@{
    workspace_id                   = [string]$targetWorkspace.workspace_id
    display_name                   = [string]$targetWorkspace.display_name
    selected_topology_variant_id   = [string]$selectedVariant.variant_id
    monitor_count                  = [int]$targetWorkspace.monitor_count
    member_count                   = $desiredMembers.Count
    visible_member_count           = ($desiredMembers | Where-Object { $_.desired_posture -eq "visible" }).Count
    visible_member_binding_count   = ($desiredMembers | Where-Object { $_.desired_posture -eq "visible" -and $_.live_binding_count -gt 0 }).Count
}

# ─── Komorebi projection ───
$komorebiManagedHwnds = @{}
if ($komorebiState) {
    foreach ($monitor in @($komorebiState.monitors.elements)) {
        foreach ($ws in @($monitor.workspaces.elements)) {
            foreach ($container in @($ws.containers.elements)) {
                foreach ($window in @($container.windows.elements)) {
                    if ($window.hwnd -ne $null) { $komorebiManagedHwnds[[int64]$window.hwnd] = $true }
                }
            }
        }
    }
}

$komorebiProjection = [ordered]@{
    workspace_name  = if ($selectedVariant.tilers) { [string]$selectedVariant.tilers[0].workspace_name } else { "I" }
    layout_intent   = if ($selectedVariant.tilers) { [string]$selectedVariant.tilers[0].layout_intent } else { "default" }
    managed_hwnds   = @($komorebiManagedHwnds.Keys)
    unmanaged_visible_hwnds = @()
}

# ─── Switch plan ───
$explainable = ($desiredMembers | Where-Object { $_.desired_posture -eq "visible" -and $_.missing_binding }).Count -eq 0
$switchPlan = [ordered]@{
    mutates                = [bool]$Apply
    explainable            = $explainable
    missing_visible_bindings = @($desiredMembers | Where-Object { $_.desired_posture -eq "visible" -and $_.missing_binding } | ForEach-Object { $_.identity_name })
    member_count           = $desiredMembers.Count
    bound_member_count     = ($desiredMembers | Where-Object { $_.live_binding_count -gt 0 }).Count
}

$runtimeExplainability = [ordered]@{
    explainable            = $explainable
    missing_visible_bindings = @($desiredMembers | Where-Object { $_.desired_posture -eq "visible" -and $_.missing_binding } | ForEach-Object { $_.identity_name })
    visible_member_count   = ($desiredMembers | Where-Object { $_.desired_posture -eq "visible" }).Count
    visible_member_binding_count = ($desiredMembers | Where-Object { $_.desired_posture -eq "visible" -and $_.live_binding_count -gt 0 }).Count
}

# ─── Apply ───
$applyEvent = $null
if ($Apply) {
    $actions = @()
    $komorebiRetileStatus = "skipped_by_argument"

    if (-not $SkipKomorebiRetile) {
        $komorebiRetileStatus = "attempted"
        try {
            $retileOutput = komorebic retile 2>&1
            $komorebiRetileStatus = "ok"
        } catch {
            $komorebiRetileStatus = "failed"
        }
    }

    foreach ($m in $desiredMembers) {
        $iname = $m.identity_name
        $posture = $m.desired_posture
        $liveHwnds = $m.bound_hwnds

        if ($posture -eq "visible") {
            foreach ($hwnd in $liveHwnds) {
                try {
                    Add-Type @"
using System; using System.Runtime.InteropServices;
public class ShowWindowHelper {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
                    [ShowWindowHelper]::ShowWindow([IntPtr]$hwnd, 1) | Out-Null  # SW_SHOWNORMAL
                } catch {
                    $actions += [ordered]@{ identity_name = $iname; action = "show"; hwnd = $hwnd; failure_reason = $_.Exception.Message }
                    continue
                }
                $actions += [ordered]@{ identity_name = $iname; action = "show"; hwnd = $hwnd }
            }
            if ($liveHwnds.Count -eq 0) {
                $actions += [ordered]@{ identity_name = $iname; action = "show"; failure_reason = "missing_hwnd" }
            }
        } elseif ($posture -in @("hidden","minimized","restorable")) {
            foreach ($hwnd in $liveHwnds) {
                try {
                    $swCmd = if ($posture -eq "hidden") { 0 } else { 2 }  # SW_HIDE=0, SW_MINIMIZE=2
                    [ShowWindowHelper]::ShowWindow([IntPtr]$hwnd, $swCmd) | Out-Null
                } catch {
                    $actions += [ordered]@{ identity_name = $iname; action = $posture; hwnd = $hwnd; failure_reason = $_.Exception.Message }
                    continue
                }
                $actions += [ordered]@{ identity_name = $iname; action = $posture; hwnd = $hwnd }
            }
        }
    }

    $applyEvent = [ordered]@{
        schema                         = "narada.operator_surfaces.operator_workspace_apply_event.v0"
        observed_at                    = (Get-Date -Format "o")
        target_workspace_id            = $WorkspaceId
        off_workspace_inhabited_carrier_action = $OffWorkspaceInhabitedCarrierAction
        komorebi_retile                = [ordered]@{ status = $komorebiRetileStatus }
        actions                        = $actions
    }
}

# ─── Output ───
$output = [ordered]@{
    schema                       = "narada.operator_surfaces.operator_workspace_projection.v0"
    workspace                    = $workspaceProjection
    desired_members              = $desiredMembers
    host_topology                = $hostTopology
    komorebi_projection          = $komorebiProjection
    off_workspace_runtime_bindings = $offWorkspaceBindings
    dry_run_switch_plan          = $switchPlan
}

if ($applyEvent) {
    $output.apply_event = $applyEvent
}

Write-NaradaOutput $output
