param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$ManifestPath,
    [switch]$DryRun,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NaradaSurfaceRestoreNative {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
}
"@

function ConvertFrom-NaradaJson {
    param([string]$Json)

    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Json | ConvertFrom-Json -Depth 100
    }
    return $Json | ConvertFrom-Json
}

function Write-JsonFile {
    param(
        [string]$Path,
        [object]$Value
    )

    $dir = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $json = $Value | ConvertTo-Json -Depth 50
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Get-IdentityByName {
    param(
        [object]$Registry,
        [string]$IdentityName
    )

    @($Registry.identities | Where-Object { $_.identity_name -eq $IdentityName }) | Select-Object -First 1
}

function Get-HealthByIdentity {
    param(
        [object]$Health,
        [string]$IdentityName
    )

    if (-not $Health) { return $null }
    @($Health.statuses | Where-Object { $_.identity_name -eq $IdentityName }) | Select-Object -First 1
}

function Test-RecoverableCarrierHealth {
    param([object]$HealthStatus)

    if (-not $HealthStatus) { return $false }
    $reasons = @($HealthStatus.reasons | ForEach-Object { [string]$_ })
    foreach ($reason in $reasons) {
        if ($reason -in @("off_screen", "iconic_minimized", "style_drift_repairable", "not_komorebi_admitted")) {
            return $true
        }
    }
    return $false
}

function Test-LiveIconicWindow {
    param([object]$HealthStatus)

    if (-not $HealthStatus) { return $false }
    $predicates = $HealthStatus.predicates
    if (-not $predicates) { return $false }
    return ($predicates.live_hwnd -eq $true) -and ($predicates.iconic -eq $true)
}

function Restore-LiveIconicWindow {
    param(
        [int64]$Hwnd,
        [switch]$DryRun
    )

    $ptr = [IntPtr][int64]$Hwnd
    if (-not [NaradaSurfaceRestoreNative]::IsWindow($ptr)) {
        return @{ restored = $false; reason = "hwnd_not_live" }
    }
    if (-not [NaradaSurfaceRestoreNative]::IsIconic($ptr)) {
        return @{ restored = $false; reason = "hwnd_not_iconic" }
    }
    if (-not $DryRun) {
        [void][NaradaSurfaceRestoreNative]::ShowWindow($ptr, 9)  # SW_RESTORE
        Start-Sleep -Milliseconds 150
        [void][NaradaSurfaceRestoreNative]::SetForegroundWindow($ptr)
    }
    return @{ restored = $true; reason = $null }
}

if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $ManifestPath = Join-Path $UserSiteRoot "operator-surfaces\desired-sessions.json"
}
if (-not (Test-Path -LiteralPath $ManifestPath)) {
    throw "Desired session manifest not found: $ManifestPath"
}

$identityPath = Join-Path $UserSiteRoot "operator-surfaces\identities.json"
if (-not (Test-Path -LiteralPath $identityPath)) {
    throw "Identity registry not found: $identityPath"
}

$manifest = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($ManifestPath))
$registry = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($identityPath))
$pcRoot = [string]$manifest.pc_site_root
if ([string]::IsNullOrWhiteSpace($pcRoot)) {
    $pcRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" }
}

$diagDir = Join-Path $pcRoot "runtime\operator-surface-session-restore"
$restoreId = "restore_{0}_{1}" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
$diagPath = Join-Path $diagDir ($restoreId + ".json")

$actions = New-Object System.Collections.Generic.List[object]
$instructions = New-Object System.Collections.Generic.List[object]

$healthScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\windows-glue\Get-OperatorSurfaceHealth.ps1"
$readmissionRepair = Join-Path $UserSiteRoot "tools\operator-surface-carriers\windows-glue\Repair-OperatorSurfaceWindows.ps1"
$health = $null
if (Test-Path -LiteralPath $healthScript) {
    try {
        $health = ConvertFrom-NaradaJson ((& $healthScript -UserSiteRoot $UserSiteRoot -PcSiteRoot $pcRoot -PassThru) -join "`n")
        $actions.Add([ordered]@{
            action = "observed_operator_surface_health"
            status_count = @($health.statuses).Count
            projection_path = [string]$health.projection_path
        })
    } catch {
        $actions.Add([ordered]@{
            action = "health_observation_failed"
            reason = $_.Exception.Message
        })
    }
} else {
    $actions.Add([ordered]@{
        action = "health_observation_unavailable"
        reason = "Get-OperatorSurfaceHealth.ps1 not found"
    })
}

foreach ($session in @($manifest.sessions)) {
    if ($session.enabled -eq $false) { continue }

    $identityName = [string]$session.identity_name
    $identity = Get-IdentityByName -Registry $registry -IdentityName $identityName
    if (-not $identity) {
        $actions.Add([ordered]@{
            session_id    = [string]$session.session_id
            identity_name = $identityName
            action        = "refused"
            reason        = "identity_not_admitted"
        })
        continue
    }

    $carrierKind = [string]$session.carrier.kind
    $healthStatus = Get-HealthByIdentity -Health $health -IdentityName $identityName
    if ($healthStatus) {
        $actions.Add([ordered]@{
            session_id    = [string]$session.session_id
            identity_name = $identityName
            action        = "surface_health_status"
            health        = [string]$healthStatus.health
            selected_hwnd = $healthStatus.selected_hwnd
            reasons       = @($healthStatus.reasons)
        })
    }

    if ($healthStatus -and [string]$healthStatus.health -eq "healthy") {
        $actions.Add([ordered]@{
            session_id    = [string]$session.session_id
            identity_name = $identityName
            action        = "surface_already_healthy"
            reason        = "live visible on-screen manageable komorebi-admitted carrier already exists"
        })
        $cliMode = [string]$session.inhabiting_cli.mode
        if ($cliMode -notin @("carrier_default", "already_inhabited")) {
            $actions.Add([ordered]@{
                session_id    = [string]$session.session_id
                identity_name = $identityName
                action        = "cannot_resume_inhabiting_cli"
                mode          = $cliMode
                reason        = "restore has no admitted durable CLI session resume primitive"
            })
        }
        continue
    }

    if (Test-LiveIconicWindow -HealthStatus $healthStatus) {
        $hwnd = [int64]$healthStatus.selected_hwnd
        $restoreResult = Restore-LiveIconicWindow -Hwnd $hwnd -DryRun:$DryRun
        $actions.Add([ordered]@{
            session_id    = [string]$session.session_id
            identity_name = $identityName
            action        = if ($DryRun) { "would_restore_live_iconic" } else { "restore_live_iconic" }
            hwnd          = $hwnd
            restored      = $restoreResult.restored
            reason        = $restoreResult.reason
        })
        if (-not $restoreResult.restored) {
            $actions.Add([ordered]@{
                session_id    = [string]$session.session_id
                identity_name = $identityName
                action        = "refused"
                reason        = "live_iconic_restore_failed: $($restoreResult.reason)"
            })
            continue
        }
    }

    if (Test-RecoverableCarrierHealth -HealthStatus $healthStatus) {
        $actions.Add([ordered]@{
            session_id    = [string]$session.session_id
            identity_name = $identityName
            action        = if ($DryRun) { "would_run_window_readmission_repair" } else { "run_window_readmission_repair" }
            reasons       = @($healthStatus.reasons)
            script        = $readmissionRepair
        })
        if (-not $DryRun -and (Test-Path -LiteralPath $readmissionRepair)) {
            & $readmissionRepair -UserSiteRoot $UserSiteRoot -PcSiteRoot $pcRoot | Out-Host
        }
        continue
    }

    if ($carrierKind -eq "windows_terminal_profile") {
        $wt = $identity.carrier_projections.windows_terminal
        if (-not $wt) {
            $actions.Add([ordered]@{
                session_id    = [string]$session.session_id
                identity_name = $identityName
                action        = "refused"
                reason        = "identity_has_no_windows_terminal_carrier"
            })
            continue
        }

        $profileName = [string]$wt.profile_name
        $launchArgs = @()
        if ([string]$session.carrier.window_mode -eq "new-window") {
            $launchArgs += "-w"
            $launchArgs += "new"
        }
        $launchArgs += "new-tab"
        $launchArgs += "-p"
        $launchArgs += $profileName

        $actions.Add([ordered]@{
            session_id    = [string]$session.session_id
            identity_name = $identityName
            action        = if ($DryRun) { "would_launch_windows_terminal_profile" } else { "launch_windows_terminal_profile" }
            executable    = "wt.exe"
            arguments     = $launchArgs
            profile_name  = $profileName
        })

        if (-not $DryRun) {
            Start-Process -FilePath "wt.exe" -ArgumentList $launchArgs | Out-Null
        }

        $cliMode = [string]$session.inhabiting_cli.mode
        if ($cliMode -eq "explicit_command") {
            $cliExecutable = [string]$session.inhabiting_cli.executable
            $cliArguments = @($session.inhabiting_cli.arguments | ForEach-Object { [string]$_ })
            if ([string]::IsNullOrWhiteSpace($cliExecutable)) {
                $actions.Add([ordered]@{
                    session_id    = [string]$session.session_id
                    identity_name = $identityName
                    action        = "refused"
                    reason        = "inhabiting_cli_explicit_command_missing_executable"
                })
            } else {
                $actions.Add([ordered]@{
                    session_id    = [string]$session.session_id
                    identity_name = $identityName
                    action        = if ($DryRun) { "would_start_inhabiting_cli" } else { "start_inhabiting_cli" }
                    executable    = $cliExecutable
                    arguments     = $cliArguments
                })
                if (-not $DryRun) {
                    Start-Process -FilePath $cliExecutable -ArgumentList $cliArguments | Out-Null
                }
            }
        } else {
            $actions.Add([ordered]@{
                session_id    = [string]$session.session_id
                identity_name = $identityName
                action        = "report_inhabiting_cli"
                mode          = $cliMode
                reason        = [string]$session.inhabiting_cli.description
            })
        }

        $instructions.Add([ordered]@{
            session_id    = [string]$session.session_id
            identity_name = $identityName
            reason        = [string]$session.binding.reason
            instruction   = "After the launched Windows Terminal surface is focused, run: pwsh.exe -NoProfile -ExecutionPolicy Bypass -File `"$UserSiteRoot\tools\operator-surface-carriers\Show-FocusedWindowIdentityBindingDialog.ps1`" -AssertedBy operator. The dialog captures the target HWND before opening and passes it explicitly to the binding script."
        })
    } elseif ($carrierKind -eq "existing_api_surface") {
        $actions.Add([ordered]@{
            session_id    = [string]$session.session_id
            identity_name = $identityName
            action        = "cannot_resume_existing_api_surface"
            reason        = [string]$session.inhabiting_cli.description
            health_reasons = if ($healthStatus) { @($healthStatus.reasons) } else { @("no_health_status") }
        })
        $instructions.Add([ordered]@{
            session_id    = [string]$session.session_id
            identity_name = $identityName
            reason        = [string]$session.binding.reason
            instruction   = "Focus the visible host window for $identityName, then run: pwsh.exe -NoProfile -ExecutionPolicy Bypass -File `"$UserSiteRoot\tools\operator-surface-carriers\Show-FocusedWindowIdentityBindingDialog.ps1`" -AssertedBy operator. The dialog captures the target HWND before opening and passes it explicitly to the binding script."
        })
    } else {
        $actions.Add([ordered]@{
            session_id    = [string]$session.session_id
            identity_name = $identityName
            action        = "refused"
            reason        = "unsupported_carrier_kind: $carrierKind"
        })
    }
}

$result = [ordered]@{
    schema         = "narada.operator_surfaces.session_restore_event.v0"
    restore_id     = $restoreId
    occurred_at    = (Get-Date -Format "o")
    user_site_root = $UserSiteRoot
    manifest_path  = $ManifestPath
    pc_site_root   = $pcRoot
    dry_run        = [bool]$DryRun
    actions        = @($actions.ToArray())
    instructions   = @($instructions.ToArray())
}

Write-JsonFile -Path $diagPath -Value $result
$result.Add("diagnostics_path", $diagPath)

if ($PassThru) {
    $result | ConvertTo-Json -Depth 50
} else {
    Write-Host ("Operator-surface session restore {0}. Diagnostics: {1}" -f $(if ($DryRun) { "dry run" } else { "planned actions executed" }), $diagPath)
    $result.actions | Format-Table session_id, identity_name, action, reason -AutoSize
    if ($instructions.Count -gt 0) {
        Write-Host ""
        Write-Host "Binding instructions:"
        foreach ($item in $instructions) {
            Write-Host ("- {0}: {1}" -f $item.identity_name, $item.instruction)
        }
    }
}
