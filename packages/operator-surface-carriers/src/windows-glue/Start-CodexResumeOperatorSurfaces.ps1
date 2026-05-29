#!/usr/bin/env pwsh

[CmdletBinding()]
param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = $(if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" }),
    [string[]]$IdentityResumePair,
    [ValidateSet("codex", "kimi", "agent-cli")]
    [string]$Runtime = "codex",
    [switch]$EnsurePresent,
    [switch]$ShowSummary,
    [switch]$DryRun,
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

function Write-NaradaJsonFile {
    param(
        [string]$Path,
        [object]$Value
    )

    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $json = $Value | ConvertTo-Json -Depth 80
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Write-NaradaOutput {
    param([object]$Value)
    $json = $Value | ConvertTo-Json -Depth 100
    if ($PassThru) { Write-Output $json } else { Write-Host $json }
}

function ConvertTo-WindowsCommandLineArgument {
    param([string]$Value)

    if ($null -eq $Value) { return '""' }
    if ($Value.Length -eq 0) { return '""' }
    if ($Value -notmatch '[\s"]') { return $Value }
    return '"' + ($Value -replace '"', '\"') + '"'
}

function Show-NaradaLauncherSummary {
    param([object]$Result)

    if ($PassThru) { return }

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($item in @($Result.results)) {
        $identity = [string]$item.identity_name
        $shortName = if ($identity.Contains(".")) { $identity.Split(".")[-1] } else { $identity }
        if ($item.ensure_present) {
            $ensureStatus = [string]$item.ensure_present.status
            if ($ensureStatus -eq "present") {
                $lines.Add(("{0}: focused existing OSF window" -f $shortName))
            } elseif ($ensureStatus -eq "refused_ambiguous_live_bindings") {
                $lines.Add(("{0}: refused, ambiguous live bindings" -f $shortName))
            } else {
                $lines.Add(("{0}: {1}" -f $shortName, $ensureStatus))
            }
            continue
        }
        $resolutionStatus = [string]$item.resolution.status
        if ($item.binding -and [string]$item.binding.status -eq "bound") {
            $lines.Add(("{0}: launched and bound OSF" -f $shortName))
        } elseif ($resolutionStatus) {
            $lines.Add(("{0}: launch resolution {1}" -f $shortName, $resolutionStatus))
        } else {
            $lines.Add(("{0}: no result" -f $shortName))
        }
    }

    if ($lines.Count -eq 0) {
        $lines.Add("No agent actions were required.")
    }
    $lines.Add("")
    $lines.Add(("Evidence: {0}" -f $Result.result_path))

    try {
        $shell = New-Object -ComObject WScript.Shell
        [void]$shell.Popup(($lines -join [Environment]::NewLine), 4, "Narada Agent Shortcuts", 64)
    } catch {
        Write-Host ($lines -join [Environment]::NewLine)
    }
}

Add-Type @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class NaradaCarrierWindowNative {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
}
"@

function Get-WindowSnapshot {
    $windows = New-Object System.Collections.Generic.List[object]
    $callback = [NaradaCarrierWindowNative+EnumWindowsProc]{
        param([IntPtr]$hWnd, [IntPtr]$lParam)

        $classBuffer = [System.Text.StringBuilder]::new(256)
        [void][NaradaCarrierWindowNative]::GetClassName($hWnd, $classBuffer, $classBuffer.Capacity)
        $titleBuffer = [System.Text.StringBuilder]::new(1024)
        [void][NaradaCarrierWindowNative]::GetWindowText($hWnd, $titleBuffer, $titleBuffer.Capacity)
        $processId = [uint32]0
        [void][NaradaCarrierWindowNative]::GetWindowThreadProcessId($hWnd, [ref]$processId)
        $processName = ""
        $process = Get-Process -Id ([int]$processId) -ErrorAction SilentlyContinue
        if ($process) { $processName = $process.ProcessName }

        $windows.Add([ordered]@{
            hwnd = $hWnd.ToInt64()
            pid = [int]$processId
            process = $processName
            class = $classBuffer.ToString()
            title = $titleBuffer.ToString()
            visible = [bool][NaradaCarrierWindowNative]::IsWindowVisible($hWnd)
        })
        return $true
    }
    [void][NaradaCarrierWindowNative]::EnumWindows($callback, [IntPtr]::Zero)
    return [ordered]@{
        schema = "narada.operator_surfaces.window_snapshot.v0"
        captured_at = (Get-Date -Format "o")
        windows = @($windows.ToArray())
    }
}

function Get-WindowEvidenceByHwnd {
    param([int64]$Hwnd)

    $handle = [IntPtr]$Hwnd
    $classBuffer = [System.Text.StringBuilder]::new(256)
    [void][NaradaCarrierWindowNative]::GetClassName($handle, $classBuffer, $classBuffer.Capacity)
    $titleBuffer = [System.Text.StringBuilder]::new(1024)
    [void][NaradaCarrierWindowNative]::GetWindowText($handle, $titleBuffer, $titleBuffer.Capacity)
    $processId = [uint32]0
    [void][NaradaCarrierWindowNative]::GetWindowThreadProcessId($handle, [ref]$processId)
    $processName = ""
    $process = Get-Process -Id ([int]$processId) -ErrorAction SilentlyContinue
    if ($process) { $processName = $process.ProcessName }

    return [ordered]@{
        hwnd = $Hwnd
        pid = [int]$processId
        process = $processName
        class = $classBuffer.ToString()
        title = $titleBuffer.ToString()
        visible = [bool][NaradaCarrierWindowNative]::IsWindowVisible($handle)
        iconic = [bool][NaradaCarrierWindowNative]::IsIconic($handle)
    }
}

function Focus-NaradaHwnd {
    param([int64]$Hwnd)

    $handle = [IntPtr]$Hwnd
    if ([NaradaCarrierWindowNative]::IsIconic($handle)) {
        [void][NaradaCarrierWindowNative]::ShowWindow($handle, 9)
    } else {
        [void][NaradaCarrierWindowNative]::ShowWindow($handle, 8)
    }
    [void][NaradaCarrierWindowNative]::SetForegroundWindow($handle)
}

function Get-LaunchPairs {
    if ($IdentityResumePair -and $IdentityResumePair.Count -gt 0) { return @($IdentityResumePair) }

    $affordancePath = Join-Path $UserSiteRoot "operator-surfaces\agent-launch-affordances.json"
    if (-not (Test-Path -LiteralPath $affordancePath)) {
        throw "agent_launch_affordances_missing: $affordancePath"
    }
    $projection = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($affordancePath))
    $pairs = @()
    foreach ($affordance in @($projection.affordances)) {
        if ($affordance.enabled -ne $true) { continue }
        $runtimeSubstrateKind = [string]$affordance.runtime_substrate_kind
        if ([string]::IsNullOrWhiteSpace($runtimeSubstrateKind)) {
            $runtimeSubstrateKind = [string]$affordance.runtime
        }
        if ($runtimeSubstrateKind -ne $Runtime) { continue }
        $identity = [string]$affordance.identity_name
        if ([string]::IsNullOrWhiteSpace($identity)) { continue }
        $pairs += "$identity=$identity"
    }
    return $pairs
}

function Invoke-OperatorSurfaceOneShot {
    param(
        [string]$ToolName,
        [object]$Arguments,
        [string]$RunRoot
    )

    $server = Join-Path $UserSiteRoot "tools\operator-surface\operator-surface-mcp-server.mjs"
    if (-not (Test-Path -LiteralPath $server)) {
        throw "operator_surface_mcp_server_missing: $server"
    }
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { $node = Get-Command node -ErrorAction SilentlyContinue }
    if (-not $node) { throw "node_executable_missing_for_operator_surface_one_shot" }

    $argsPath = Join-Path $RunRoot ("{0}-args.json" -f $ToolName)
    Write-NaradaJsonFile -Path $argsPath -Value $Arguments
    $raw = & $node.Source $server --site-root $UserSiteRoot --pc-site-root $PcSiteRoot --invoke-tool $ToolName --arguments-file $argsPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($raw | Out-String) }
    return ConvertFrom-NaradaJson (($raw | Out-String).Trim())
}

function Get-NaradaActiveBindingsByIdentity {
    param([string]$RunRoot)

    $bindings = Invoke-OperatorSurfaceOneShot -ToolName "operator_surface_binding_status" -RunRoot $RunRoot -Arguments ([ordered]@{})
    $byIdentity = @{}
    foreach ($binding in @($bindings.bindings)) {
        if ([string]$binding.status -ne "active") { continue }
        $identity = [string]$binding.identity_name
        if ([string]::IsNullOrWhiteSpace($identity)) { continue }
        if (-not $byIdentity.ContainsKey($identity)) { $byIdentity[$identity] = @() }
        $byIdentity[$identity] += $binding
    }
    return $byIdentity
}

function Test-NaradaBindingLive {
    param([object]$Binding)

    $hwnd = [int64]$Binding.surface.hwnd
    $evidence = Get-WindowEvidenceByHwnd -Hwnd $hwnd
    return [ordered]@{
        live = ($evidence.visible -eq $true -and [string]$evidence.class -eq "CASCADIA_HOSTING_WINDOW_CLASS")
        hwnd = $hwnd
        evidence = $evidence
    }
}

$wt = Get-Command wt.exe -ErrorAction SilentlyContinue
if (-not $wt) {
    throw "windows_terminal_executable_missing: wt.exe"
}

$pwsh = Join-Path $env:ProgramFiles "PowerShell\7\pwsh.exe"
if (-not (Test-Path -LiteralPath $pwsh)) {
    $pwshCommand = Get-Command pwsh.exe -ErrorAction SilentlyContinue
    if ($pwshCommand) { $pwsh = $pwshCommand.Source } else { throw "pwsh_executable_missing" }
}

$childScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\windows-glue\Start-AgentOperatorSurfaceCarrierChild.ps1"
$resolver = Join-Path $UserSiteRoot "tools\operator-surface-carriers\windows-glue\Resolve-OperatorSurfaceCarrierWindow.ps1"
if (-not (Test-Path -LiteralPath $childScript)) { throw "carrier_child_script_missing: $childScript" }
if (-not (Test-Path -LiteralPath $resolver)) { throw "carrier_resolver_missing: $resolver" }

$runRoot = Join-Path $PcSiteRoot "runtime\operator-surface-carriers"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$launcherResultPath = Join-Path $runRoot ("launcher-{0}-{1}.json" -f (Get-Date -Format "yyyyMMdd-HHmmss-fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8)))

$actions = @()
$results = @()
$ensureBindingRoot = Join-Path $runRoot "ensure-present"
if ($EnsurePresent) {
    New-Item -ItemType Directory -Force -Path $ensureBindingRoot | Out-Null
}
$activeBindingsByIdentity = if ($EnsurePresent) { Get-NaradaActiveBindingsByIdentity -RunRoot $ensureBindingRoot } else { @{} }
foreach ($pair in @(Get-LaunchPairs)) {
    $parts = ([string]$pair).Split("=", 2)
    $identityName = $parts[0]
    if ([string]::IsNullOrWhiteSpace($identityName)) { throw "identity_pair_missing_identity: $pair" }

    $safeIdentity = $identityName -replace '[^A-Za-z0-9_.-]', '_'
    $carrierId = "osf-carrier-$safeIdentity-$([Guid]::NewGuid().ToString("N"))"
    $carrierRoot = Join-Path $runRoot $carrierId
    $beforePath = Join-Path $carrierRoot "before.json"
    $afterPath = Join-Path $carrierRoot "after.json"
    $claimPath = Join-Path $carrierRoot "claim.json"
    $ensureExisting = $null
    if ($EnsurePresent -and $activeBindingsByIdentity.ContainsKey($identityName)) {
        $liveBindings = @()
        $deadBindings = @()
        foreach ($binding in @($activeBindingsByIdentity[$identityName])) {
            $bindingCheck = Test-NaradaBindingLive -Binding $binding
            if ($bindingCheck.live -eq $true) {
                $liveBindings += [ordered]@{ binding = $binding; check = $bindingCheck }
            } else {
                $deadBindings += [ordered]@{ binding = $binding; check = $bindingCheck }
            }
        }
        if ($liveBindings.Count -eq 1) {
            if (-not $DryRun) {
                Focus-NaradaHwnd -Hwnd ([int64]$liveBindings[0].check.hwnd)
            }
            $ensureExisting = [ordered]@{
                status = "present"
                action = if ($DryRun) { "would_focus_existing_binding" } else { "focused_existing_binding" }
                identity_name = $identityName
                binding = $liveBindings[0].binding
                evidence = $liveBindings[0].check.evidence
                dead_binding_count = $deadBindings.Count
            }
        } elseif ($liveBindings.Count -gt 1) {
            $ensureExisting = [ordered]@{
                status = "refused_ambiguous_live_bindings"
                identity_name = $identityName
                live_bindings = @($liveBindings)
                dead_binding_count = $deadBindings.Count
            }
        }
    }

    $arguments = @(
        "-f",
        "-w",
        "new",
        "nt",
        $pwsh,
        "-NoExit",
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $childScript,
        "-UserSiteRoot", $UserSiteRoot,
        "-IdentityName", $identityName,
        "-Runtime", $Runtime,
        "-CarrierId", $carrierId,
        "-ClaimPath", $claimPath
    )

    $action = [ordered]@{
        identity_name = $identityName
        runtime = $Runtime
        carrier_id = $carrierId
        claim_path = $claimPath
        before_snapshot_path = $beforePath
        after_snapshot_path = $afterPath
        executable = $wt.Source
        arguments = @($arguments)
        argument_text = (@($arguments) | ForEach-Object { ConvertTo-WindowsCommandLineArgument ([string]$_) }) -join " "
        single_tab_invariant_required = $true
        title_used_as_binding_proof = $false
        ensure_present = [bool]$EnsurePresent
    }
    $actions += $action

    if ($null -ne $ensureExisting) {
        $results += [ordered]@{
            identity_name = $identityName
            carrier_id = $carrierId
            ensure_present = $ensureExisting
            resolution = $null
            binding = $null
        }
        continue
    }

    if ($DryRun) { continue }

    Write-NaradaJsonFile -Path $beforePath -Value (Get-WindowSnapshot)
    $argumentText = (@($arguments) | ForEach-Object { ConvertTo-WindowsCommandLineArgument ([string]$_) }) -join " "
    Start-Process -FilePath $wt.Source -ArgumentList $argumentText -WorkingDirectory $UserSiteRoot | Out-Null
    Start-Sleep -Milliseconds 1200
    Write-NaradaJsonFile -Path $afterPath -Value (Get-WindowSnapshot)

    $resolution = & $resolver -CarrierId $carrierId -BeforeSnapshotPath $beforePath -AfterSnapshotPath $afterPath -ClaimPath $claimPath -PassThru | ConvertFrom-NaradaJson
    $binding = $null
    if ($resolution.status -eq "resolved") {
        $binding = Invoke-OperatorSurfaceOneShot -ToolName "operator_surface_bind_agent" -RunRoot $carrierRoot -Arguments ([ordered]@{
            identity_name = $identityName
            hwnd = [int64]$resolution.resolved_window.hwnd
            bound_by = "operator_surface_carrier_launcher"
            assertion_method = "inhabited_carrier_claim_v0"
            liveness_policy = "live_hwnd_required"
        })
    }
    $results += [ordered]@{
        identity_name = $identityName
        carrier_id = $carrierId
        resolution = $resolution
        binding = $binding
    }
}

$launcherResult = [ordered]@{
    schema = "narada.operator_surfaces.codex_resume_launcher.v1"
    status = if ($DryRun) { "dry_run" } elseif ($EnsurePresent) { "ensured" } else { "launched" }
    dry_run = [bool]$DryRun
    runtime = $Runtime
    result_path = $launcherResultPath
    ensure_present = [bool]$EnsurePresent
    title_used_as_binding_proof = $false
    single_tab_invariant_required = $true
    actions = @($actions)
    results = @($results)
}
Write-NaradaJsonFile -Path $launcherResultPath -Value $launcherResult
if ($ShowSummary) {
    Show-NaradaLauncherSummary -Result $launcherResult
}
Write-NaradaOutput $launcherResult
