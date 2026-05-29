#!/usr/bin/env pwsh
# Focus-OperatorSurfaceIdentity.ps1
# Sanctioned Windows carrier for local attention focus of an admitted operator-surface identity.

[CmdletBinding()]
param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = $(if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" }),
    [Parameter(Mandatory = $true)]
    [string]$IdentityName,
    [string]$RuntimeBindingPath,
    [string]$AssertedBy = "operator_surface_mcp",
    [switch]$DryRun,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"
$script:PassThruRequested = [bool]$PassThru

function ConvertFrom-NaradaJson {
    param([string]$Json)
    $cmd = Get-Command ConvertFrom-Json
    if ($cmd.Parameters.ContainsKey("Depth")) { return $Json | ConvertFrom-Json -Depth 100 }
    return $Json | ConvertFrom-Json
}

function Write-NaradaOutput {
    param([object]$Value)
    $json = $Value | ConvertTo-Json -Depth 80 -Compress
    if ($script:PassThruRequested) { Write-Output $json } else { Write-Host $json }
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

function Resolve-NaradaBindingHwnd {
    param([object]$Binding)

    $hwndValue = Get-NaradaPropertyValue -Object $Binding -Name "hwnd" -Default $null
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

public static class NaradaOperatorSurfaceFocusNative {
    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

function Get-WindowSnapshot {
    param([int64]$Hwnd)

    $handle = [IntPtr]$Hwnd
    $isWindow = [NaradaOperatorSurfaceFocusNative]::IsWindow($handle)
    $title = ""
    $class = ""
    $processId = 0
    $processName = ""

    if ($isWindow) {
        $titleBuffer = [System.Text.StringBuilder]::new(1024)
        [void][NaradaOperatorSurfaceFocusNative]::GetWindowText($handle, $titleBuffer, $titleBuffer.Capacity)
        $title = $titleBuffer.ToString()

        $classBuffer = [System.Text.StringBuilder]::new(512)
        [void][NaradaOperatorSurfaceFocusNative]::GetClassName($handle, $classBuffer, $classBuffer.Capacity)
        $class = $classBuffer.ToString()

        [void][NaradaOperatorSurfaceFocusNative]::GetWindowThreadProcessId($handle, [ref]$processId)
        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
            $processName = [string]$process.ProcessName
        } catch {
            $processName = ""
        }
    }

    [ordered]@{
        hwnd = $Hwnd
        live_hwnd = [bool]$isWindow
        visible = if ($isWindow) { [bool][NaradaOperatorSurfaceFocusNative]::IsWindowVisible($handle) } else { $false }
        iconic = if ($isWindow) { [bool][NaradaOperatorSurfaceFocusNative]::IsIconic($handle) } else { $false }
        title = $title
        class = $class
        process_id = [int]$processId
        process_name = $processName
    }
}

$identityPath = Join-Path $UserSiteRoot "operator-surfaces\identities.json"
if (-not (Test-Path -LiteralPath $identityPath)) {
    throw "operator_surface_identity_projection_missing: $identityPath"
}

$identityRegistry = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($identityPath))
$identity = @($identityRegistry.identities | Where-Object {
    ([string]$_.identity_name -eq $IdentityName -or [string]$_.identity_id -eq $IdentityName) -and $_.deprecated -ne $true
} | Select-Object -First 1)

if (-not $identity) {
    throw "operator_surface_identity_not_admitted: $IdentityName"
}

if ([string]::IsNullOrWhiteSpace($RuntimeBindingPath)) {
    $labelPath = Join-Path $UserSiteRoot "operator-surfaces\window-labels.json"
    if (Test-Path -LiteralPath $labelPath) {
        $labels = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($labelPath))
        $RuntimeBindingPath = [string]$labels.runtime_binding_path
    }
}
if ([string]::IsNullOrWhiteSpace($RuntimeBindingPath)) {
    $RuntimeBindingPath = Join-Path $PcSiteRoot "runtime\operator-surface-window-bindings.json"
}
if (-not (Test-Path -LiteralPath $RuntimeBindingPath)) {
    Write-NaradaOutput ([ordered]@{
        schema = "narada.operator_surfaces.focus_identity.v0"
        status = if ($DryRun) { "dry_run" } else { "no_live_binding" }
        effect_class = "local_attention_focus_only"
        identity_name = $IdentityName
        identity_admitted = $true
        runtime_binding_path = $RuntimeBindingPath
        focusable = $false
        reason = "runtime_binding_projection_missing"
        safety = [ordered]@{
            types_text = $false
            submits_input = $false
            mutates_files = $false
            executes_role_work = $false
        }
    })
    exit 0
}

$runtime = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($RuntimeBindingPath))
$bindings = @($runtime.bindings | Where-Object { [string]$_.identity_name -eq $IdentityName })
$candidates = @()
foreach ($binding in $bindings) {
    $hwnd = Resolve-NaradaBindingHwnd -Binding $binding
    if ($null -eq $hwnd) { continue }
    $snapshot = Get-WindowSnapshot -Hwnd $hwnd
    $candidates += [ordered]@{
        hwnd = [int64]$hwnd
        live_hwnd = [bool]$snapshot.live_hwnd
        visible = [bool]$snapshot.visible
        iconic = [bool]$snapshot.iconic
        title = [string]$snapshot.title
        class = [string]$snapshot.class
        process_id = [int]$snapshot.process_id
        process_name = [string]$snapshot.process_name
    }
}

$selected = @($candidates | Where-Object { $_.live_hwnd -eq $true } | Sort-Object -Property @{ Expression = { if ($_.visible) { 0 } else { 1 } } }, @{ Expression = { if ($_.iconic) { 1 } else { 0 } } } | Select-Object -First 1)

$base = [ordered]@{
    schema = "narada.operator_surfaces.focus_identity.v0"
    status = if ($DryRun) { "dry_run" } else { "planned" }
    effect_class = "local_attention_focus_only"
    authority = "runtime_binding_projection"
    identity_name = $IdentityName
    identity_admitted = $true
    runtime_binding_path = $RuntimeBindingPath
    asserted_by = $AssertedBy
    focusable = [bool]$selected
    selected_hwnd = if ($selected) { [int64]$selected.hwnd } else { $null }
    candidates = @($candidates)
    safety = [ordered]@{
        types_text = $false
        submits_input = $false
        mutates_files = $false
        executes_role_work = $false
    }
}

if (-not $selected) {
    $base.status = if ($DryRun) { "dry_run" } else { "no_live_binding" }
    $base.reason = "no_live_hwnd_binding_for_identity"
    Write-NaradaOutput $base
    exit 0
}

if ($DryRun) {
    $base.would = @("restore_if_minimized", "set_foreground_window")
    Write-NaradaOutput $base
    exit 0
}

$handle = [IntPtr]([int64]$selected.hwnd)
$before = Get-WindowSnapshot -Hwnd ([int64]$selected.hwnd)
$showResult = $false
if ($before.iconic) {
    $showResult = [NaradaOperatorSurfaceFocusNative]::ShowWindow($handle, 9)
} elseif (-not $before.visible) {
    $showResult = [NaradaOperatorSurfaceFocusNative]::ShowWindow($handle, 5)
}
$foregroundResult = [NaradaOperatorSurfaceFocusNative]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 150
$after = Get-WindowSnapshot -Hwnd ([int64]$selected.hwnd)
$foregroundHwnd = [NaradaOperatorSurfaceFocusNative]::GetForegroundWindow().ToInt64()

$base.status = if ($foregroundResult -or $foregroundHwnd -eq [int64]$selected.hwnd) { "focused" } else { "focus_requested" }
$base.before = $before
$base.after = $after
$base.show_window_called = [bool]($before.iconic -or -not $before.visible)
$base.show_window_result = [bool]$showResult
$base.set_foreground_window_result = [bool]$foregroundResult
$base.foreground_hwnd = [int64]$foregroundHwnd

Write-NaradaOutput $base
