#!/usr/bin/env pwsh
# Repair-OperatorSurfaceWindows.ps1
# Sanctioned Windows carrier for operator-surface binding/window repair.

[CmdletBinding()]
param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = $(if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" }),
    [string]$HealthScriptPath,
    [string]$RuntimeBindingPath,
    [switch]$DryRun,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([string]$Json)
    $cmd = Get-Command ConvertFrom-Json
    if ($cmd.Parameters.ContainsKey("Depth")) { return $Json | ConvertFrom-Json -Depth 100 }
    return $Json | ConvertFrom-Json
}

function Write-NaradaOutput {
    param([object]$Value)
    $json = $Value | ConvertTo-Json -Depth 80 -Compress
    if ($PassThru) { Write-Output $json } else { Write-Host $json }
}

function Get-NaradaPropertyValue {
    param([object]$Object, [string]$Name, [object]$Default = $null)
    if ($null -eq $Object) { return $Default }
    if ($Object -is [System.Collections.IDictionary]) {
        if ($Object.Contains($Name)) { return $Object[$Name] }
        return $Default
    }
    $property = @($Object.PSObject.Properties | Where-Object { $_.Name -eq $Name } | Select-Object -First 1)
    if ($property.Count -eq 0) { return $Default }
    return $property[0].Value
}

function Test-NaradaTruthyPredicate {
    param([object]$Predicates, [string]$Name, [bool]$Default = $false)
    $value = Get-NaradaPropertyValue -Object $Predicates -Name $Name -Default $Default
    if ($null -eq $value) { return $Default }
    return [bool]$value
}

function Resolve-NaradaBindingHwnd {
    param([object]$Binding)

    $hwndValue = Get-NaradaPropertyValue -Object $Binding -Name "hwnd" -Default $null
    if ($null -ne $hwndValue) { return [int64]$hwndValue }

    $surface = Get-NaradaPropertyValue -Object $Binding -Name "surface" -Default $null
    $hwndValue = Get-NaradaPropertyValue -Object $surface -Name "hwnd" -Default $null
    if ($null -ne $hwndValue) { return [int64]$hwndValue }

    $surfaceId = [string](Get-NaradaPropertyValue -Object $Binding -Name "surface_id" -Default (Get-NaradaPropertyValue -Object $Binding -Name "projection_source_surface_id" -Default ""))
    if ($surfaceId.StartsWith("hwnd:")) {
        $parsed = [int64]0
        if ([int64]::TryParse($surfaceId.Substring(5), [ref]$parsed)) { return $parsed }
    }

    return $null
}

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class NaradaOperatorSurfaceRepairNative {
    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
}
"@

function Get-WindowSnapshot {
    param([int64]$Hwnd)

    $handle = [IntPtr]$Hwnd
    $isWindow = [NaradaOperatorSurfaceRepairNative]::IsWindow($handle)
    $title = ""
    $rectValue = $null
    if ($isWindow) {
        $buffer = [System.Text.StringBuilder]::new(1024)
        [void][NaradaOperatorSurfaceRepairNative]::GetWindowText($handle, $buffer, $buffer.Capacity)
        $title = $buffer.ToString()
        $rect = New-Object NaradaOperatorSurfaceRepairNative+RECT
        if ([NaradaOperatorSurfaceRepairNative]::GetWindowRect($handle, [ref]$rect)) {
            $rectValue = [ordered]@{
                left = $rect.Left
                top = $rect.Top
                right = $rect.Right
                bottom = $rect.Bottom
                width = $rect.Right - $rect.Left
                height = $rect.Bottom - $rect.Top
            }
        }
    }

    return [ordered]@{
        hwnd = $Hwnd
        live_hwnd = [bool]$isWindow
        visible = if ($isWindow) { [bool][NaradaOperatorSurfaceRepairNative]::IsWindowVisible($handle) } else { $false }
        iconic = if ($isWindow) { [bool][NaradaOperatorSurfaceRepairNative]::IsIconic($handle) } else { $false }
        title = $title
        rect = $rectValue
    }
}

function Invoke-HealthScript {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) { return $null }
    $raw = & $Path -UserSiteRoot $UserSiteRoot -PcSiteRoot $PcSiteRoot -PassThru 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($raw | Out-String) }
    $text = ($raw | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return ConvertFrom-NaradaJson $text
}

function Get-NaradaBindingCandidates {
    param([object]$Value)

    if ($null -eq $Value) { return @() }
    if ($Value -is [string]) { return @() }

    $hasBindingShape =
        ($null -ne (Get-NaradaPropertyValue -Object $Value -Name "hwnd" -Default $null)) -or
        ($null -ne (Get-NaradaPropertyValue -Object $Value -Name "surface_id" -Default $null)) -or
        ($null -ne (Get-NaradaPropertyValue -Object $Value -Name "projection_source_surface_id" -Default $null)) -or
        ($null -ne (Get-NaradaPropertyValue -Object $Value -Name "surface" -Default $null))

    if ($hasBindingShape) { return @($Value) }

    if ($Value -is [System.Collections.IEnumerable]) {
        $items = @()
        foreach ($item in $Value) { $items += Get-NaradaBindingCandidates -Value $item }
        return $items
    }

    $children = @()
    foreach ($property in @($Value.PSObject.Properties)) {
        $children += Get-NaradaBindingCandidates -Value $property.Value
    }
    return $children
}

function Get-FallbackHealthFromRuntimeBindings {
    if ([string]::IsNullOrWhiteSpace($RuntimeBindingPath)) {
        $RuntimeBindingPath = Join-Path $PcSiteRoot "runtime\operator-surface-window-bindings.json"
    }

    $statuses = @()
    if (Test-Path -LiteralPath $RuntimeBindingPath) {
        $runtimeBindings = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($RuntimeBindingPath))
        $bindingCandidates = Get-NaradaBindingCandidates -Value (Get-NaradaPropertyValue -Object $runtimeBindings -Name "bindings" -Default $runtimeBindings)
        foreach ($binding in @($bindingCandidates)) {
            $identityName = [string](Get-NaradaPropertyValue -Object $binding -Name "identity_name" -Default (Get-NaradaPropertyValue -Object $binding -Name "identity_id" -Default ""))
            $hwndValue = Resolve-NaradaBindingHwnd -Binding $binding
            if ($null -eq $hwndValue) { continue }
            $snapshot = Get-WindowSnapshot -Hwnd $hwndValue
            $statuses += [ordered]@{
                identity_name = $identityName
                health = if ($snapshot.live_hwnd -and $snapshot.visible) { "healthy" } else { "degraded" }
                reasons = @()
                selected_hwnd = $hwndValue
                predicates = [ordered]@{
                    komorebi_admitted = $true
                    live_hwnd = [bool]$snapshot.live_hwnd
                    visible = [bool]$snapshot.visible
                    uncloaked = [bool]$snapshot.visible
                    on_screen = $true
                    manageable = [bool]$snapshot.live_hwnd
                    iconic = [bool]$snapshot.iconic
                    style_admitted = $true
                    style_repairable = [bool]$snapshot.live_hwnd
                }
                window = $snapshot
            }
        }
    }

    return [ordered]@{
        schema = "narada.operator_surfaces.health_status.v0"
        owner_site_id = "narada-andrey"
        source = "runtime_binding_projection_fallback"
        statuses = $statuses
    }
}

if ([string]::IsNullOrWhiteSpace($HealthScriptPath)) {
    $HealthScriptPath = Join-Path $UserSiteRoot "tools\operator-surface-carriers\windows-glue\Get-OperatorSurfaceHealth.ps1"
}

$health = Invoke-HealthScript -Path $HealthScriptPath
if ($null -eq $health) { $health = Get-FallbackHealthFromRuntimeBindings }

$windows = @()
foreach ($status in @($health.statuses)) {
    $identityName = [string](Get-NaradaPropertyValue -Object $status -Name "identity_name" -Default "")
    $hwndValue = Get-NaradaPropertyValue -Object $status -Name "selected_hwnd" -Default $null
    $predicates = Get-NaradaPropertyValue -Object $status -Name "predicates" -Default $null
    $reasons = @(Get-NaradaPropertyValue -Object $status -Name "reasons" -Default @())
    $actions = @()
    $refusedReason = $null
    $snapshot = $null

    if ($null -eq $hwndValue) {
        $refusedReason = "missing_selected_hwnd"
    } else {
        $hwnd = [int64]$hwndValue
        $snapshot = Get-WindowSnapshot -Hwnd $hwnd
        $komorebiAdmitted = Test-NaradaTruthyPredicate -Predicates $predicates -Name "komorebi_admitted" -Default $true
        $liveHwnd = Test-NaradaTruthyPredicate -Predicates $predicates -Name "live_hwnd" -Default ([bool]$snapshot.live_hwnd)
        $styleAdmitted = Test-NaradaTruthyPredicate -Predicates $predicates -Name "style_admitted" -Default $true
        $styleRepairable = Test-NaradaTruthyPredicate -Predicates $predicates -Name "style_repairable" -Default ([bool]$snapshot.live_hwnd)

        if (-not $komorebiAdmitted) {
            $refusedReason = "not_komorebi_admitted"
        } elseif (-not $liveHwnd -or -not $snapshot.live_hwnd) {
            $refusedReason = "dead_hwnd"
        } elseif (-not $styleAdmitted) {
            $refusedReason = "style_not_admitted"
        } elseif (-not $styleRepairable) {
            $refusedReason = "style_not_repairable"
        } else {
            if ($snapshot.iconic) {
                $actions += [ordered]@{ action = if ($DryRun) { "would_restore_window" } else { "restore_window" }; hwnd = $hwnd }
                if (-not $DryRun) { [void][NaradaOperatorSurfaceRepairNative]::ShowWindow([IntPtr]$hwnd, 9) }
            }
            if (-not $snapshot.visible) {
                $actions += [ordered]@{ action = if ($DryRun) { "would_show_window" } else { "show_window" }; hwnd = $hwnd }
                if (-not $DryRun) { [void][NaradaOperatorSurfaceRepairNative]::ShowWindow([IntPtr]$hwnd, 8) }
            }
            if ($actions.Count -eq 0) {
                $actions += [ordered]@{ action = if ($DryRun) { "would_preserve_visible_window" } else { "preserved_visible_window" }; hwnd = $hwnd }
            }
        }
    }

    $windows += [ordered]@{
        identity_name = $identityName
        hwnd = $hwndValue
        health = [string](Get-NaradaPropertyValue -Object $status -Name "health" -Default "unknown")
        reasons = $reasons
        refused_reason = $refusedReason
        actions = $actions
        window = $snapshot
    }
}

$result = [ordered]@{
    schema = "narada.operator_surface_windows.repair_event.v0"
    status = "ok"
    dry_run = [bool]$DryRun
    occurred_at = (Get-Date -Format "o")
    user_site_root = $UserSiteRoot
    pc_site_root = $PcSiteRoot
    authority = "mcp_invoked_windows_carrier"
    health_source = if (Test-Path -LiteralPath $HealthScriptPath) { $HealthScriptPath } else { "runtime_binding_projection_fallback" }
    windows = $windows
}

Write-NaradaOutput $result
