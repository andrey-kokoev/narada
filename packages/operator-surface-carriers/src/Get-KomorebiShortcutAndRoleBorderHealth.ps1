param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = $(if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" }),
    [string]$WhkdConfigPath = "$env:USERPROFILE\.config\whkdrc",
    [int]$WhkdProcessCountFixture = -1,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class NaradaShortcutHealthNative {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
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

function Invoke-KomorebicProbe {
    param([string[]]$Arguments, [int]$TimeoutMilliseconds = 5000)

    $stdout = [System.IO.Path]::GetTempFileName()
    $stderr = [System.IO.Path]::GetTempFileName()
    try {
        $komorebicPath = (Get-Command komorebic -ErrorAction Stop).Source
        $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
        $startInfo.FileName = $komorebicPath
        $startInfo.Arguments = @($Arguments | ForEach-Object {
                $arg = [string]$_
                if ($arg -match '\s') { '"' + ($arg -replace '"', '\"') + '"' } else { $arg }
            }) -join " "
        $startInfo.UseShellExecute = $false
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        $startInfo.CreateNoWindow = $true
        $process = [System.Diagnostics.Process]::Start($startInfo)
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutMilliseconds)) {
            try { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } catch {}
            return [ordered]@{
                ok = $false
                timed_out = $true
                exit_code = $null
                stdout = ""
                stderr = ""
            }
        }
        $exitCode = $process.ExitCode
        [ordered]@{
            ok = $exitCode -eq 0
            timed_out = $false
            exit_code = $exitCode
            stdout = $stdoutTask.Result.Trim()
            stderr = $stderrTask.Result.Trim()
        }
    } catch {
        [ordered]@{
            ok = $false
            timed_out = $false
            exit_code = $null
            stdout = ""
            stderr = $_.Exception.Message
        }
    } finally {
        Remove-Item -LiteralPath $stdout -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $stderr -Force -ErrorAction SilentlyContinue
    }
}

function Get-RecentMatchingLines {
    param([string]$Path, [string[]]$Patterns, [int]$Tail = 200)
    if (-not (Test-Path -LiteralPath $Path)) { return @() }
    @(Get-Content -Tail $Tail -LiteralPath $Path | Where-Object {
        $line = [string]$_
        foreach ($pattern in $Patterns) {
            if ($line -match $pattern) { return $true }
        }
        return $false
    } | ForEach-Object { [string]$_ })
}

$komorebiProcess = @(Get-Process komorebi -ErrorAction SilentlyContinue)
$whkdProcess = @(if ($WhkdProcessCountFixture -ge 0) {
    for ($i = 0; $i -lt $WhkdProcessCountFixture; $i++) {
        [pscustomobject]@{
            Id = 10000 + $i
            ProcessName = "whkd"
            Fixture = $true
        }
    }
} else {
    Get-Process whkd -ErrorAction SilentlyContinue
})
$staleKomorebicClients = @(Get-CimInstance Win32_Process -Filter "name = 'komorebic.exe'" -ErrorAction SilentlyContinue | Select-Object ProcessId, CommandLine)
$yasbLogPath = Join-Path $env:USERPROFILE ".config\yasb\yasb.log"
$yasbSourceRoots = @(
    $(if ($env:NARADA_YASB_SOURCE_ROOT) { $env:NARADA_YASB_SOURCE_ROOT } else { "D:\code\yasb" }),
    (Join-Path $UserSiteRoot "vendor\yasb")
)
$roleLogPath = Join-Path $PcSiteRoot "logs\operator-surface-role-border-watcher\watcher.log"
$rolePidPath = Join-Path $PcSiteRoot "runtime\operator-surface-role-border-watcher.pid"
$oslPidPath = Join-Path $PcSiteRoot "runtime\window-surface-overlay.pid"

$stateProbe = Invoke-KomorebicProbe -Arguments @("state")
$focusedWindowProbe = Invoke-KomorebicProbe -Arguments @("query", "focused-window-index")
$whkdConfigPresent = Test-Path -LiteralPath $WhkdConfigPath
$whkdText = if ($whkdConfigPresent) { [System.IO.File]::ReadAllText($WhkdConfigPath) } else { "" }
$expectedBindings = @("alt + h", "alt + j", "alt + k", "alt + l", "alt + shift + h", "alt + shift + j", "alt + shift + k", "alt + shift + l")
$bindingPresence = [ordered]@{}
foreach ($binding in $expectedBindings) {
    $bindingPresence[$binding] = ($whkdText -match [regex]::Escape($binding))
}
$missingWhkdBindings = @($bindingPresence.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { [string]$_.Key })
$whkdConfigOk = $whkdConfigPresent -and $missingWhkdBindings.Count -eq 0
$whkdDaemonRunning = $whkdProcess.Count -gt 0
$whkdReady = $whkdConfigOk -and $whkdDaemonRunning

$labels = $null
$runtime = $null
$foreground = [NaradaShortcutHealthNative]::GetForegroundWindow().ToInt64()
$foregroundBinding = $null
$labelPath = Join-Path $UserSiteRoot "operator-surfaces\window-labels.json"
try {
    if (Test-Path -LiteralPath $labelPath) {
        $labels = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($labelPath))
        $runtimePath = [string]$labels.runtime_binding_path
        if (Test-Path -LiteralPath $runtimePath) {
            $runtime = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($runtimePath))
            $foregroundBinding = @($runtime.bindings | Where-Object { [int64]$_.hwnd -eq $foreground } | Select-Object -First 1)
        }
    }
} catch {
    $foregroundBinding = $null
}

$labelBindings = if ($labels -and $labels.bindings) { @($labels.bindings) } else { @() }
$roleColorBindings = @()
$missingRoleColorBindings = @()
foreach ($binding in $labelBindings) {
    $roleTextHex = [string]$binding.style.role_text_hex
    $surfaceId = [string]$binding.surface_id
    $roleName = if ($binding.label_parts) { [string]$binding.label_parts.role_name } else { $null }
    if ([string]::IsNullOrWhiteSpace($roleTextHex)) {
        $missingRoleColorBindings += [ordered]@{
            surface_id = $surfaceId
            role = $roleName
            reason = "missing_style_role_text_hex"
        }
    } else {
        $roleColorBindings += [ordered]@{
            surface_id = $surfaceId
            role = $roleName
            role_text_hex = $roleTextHex
        }
    }
}
$roleColorProjectionStatus = if (-not (Test-Path -LiteralPath $labelPath)) {
    "window_label_projection_missing"
} elseif (-not $labels) {
    "window_label_projection_unreadable"
} elseif ($labelBindings.Count -eq 0) {
    "no_projected_bindings"
} elseif ($missingRoleColorBindings.Count -gt 0) {
    "role_color_projection_incomplete"
} else {
    "role_color_projection_complete"
}

$yasbProcesses = @(Get-CimInstance Win32_Process -Filter "name = 'pythonw.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and (
            $_.CommandLine.Replace("/", "\") -like "*\src\main.py*" -or
            $_.CommandLine.Replace("/", "\") -like "*RunYasbInstance.pyw*"
        )
    } |
    Select-Object ProcessId, CommandLine)

$yasbTimeoutLines = Get-RecentMatchingLines -Path $yasbLogPath -Patterns @("Komorebi state query timed out", "Failed to retrieve komorebi state", "event listener")

$oslRunning = $false
$oslPid = $null
if (Test-Path -LiteralPath $oslPidPath) {
    $oslPid = [int](Get-Content -Raw -LiteralPath $oslPidPath)
    try {
        $oslProcess = Get-Process -Id $oslPid -ErrorAction Stop
        $oslRunning = $true
    } catch {
        $oslRunning = $false
    }
}

$roleColorEvents = Get-RecentMatchingLines -Path $roleLogPath -Patterns @("enabled_role_colour", "disabled_role_colour") -Tail 50
$roleBorderLines = Get-RecentMatchingLines -Path $roleLogPath -Patterns @("disabled_unmatched", "observed_unmatched_no_change", "timed out", "error")

$roleWatcherStatus = "not_running"
if (Test-Path -LiteralPath $rolePidPath) {
    $rolePid = [int](Get-Content -Raw -LiteralPath $rolePidPath)
    $roleProcess = Get-Process -Id $rolePid -ErrorAction SilentlyContinue
    $roleWatcherStatus = if ($roleProcess) { "running" } else { "stale_pid" }
} elseif ($oslRunning -and $roleColorEvents.Count -gt 0) {
    $roleWatcherStatus = "running_via_osl"
}

$bindingDiagnoses = @()
if ($runtime -and $runtime.bindings) {
    foreach ($binding in $runtime.bindings) {
        $hwnd = [IntPtr]::new([int64]$binding.hwnd)
        $windowExists = [NaradaShortcutHealthNative]::IsWindow($hwnd)
        $currentTitle = New-Object System.Text.StringBuilder 512
        [void][NaradaShortcutHealthNative]::GetWindowText($hwnd, $currentTitle, 512)
        $currentClass = New-Object System.Text.StringBuilder 512
        [void][NaradaShortcutHealthNative]::GetClassName($hwnd, $currentClass, 512)

        $processAlive = $false
        try {
            $proc = Get-Process -Id $binding.observed_pid -ErrorAction Stop
            $processAlive = $true
        } catch {
            $processAlive = $false
        }

        $titleChanged = $currentTitle.ToString() -ne $binding.observed_title
        $classChanged = $currentClass.ToString() -ne $binding.observed_class

        $status = "healthy"
        $reasons = @()
        if (-not $windowExists) {
            $status = "dead"
            $reasons += "window_closed"
        } else {
            if (-not $processAlive) { $reasons += "observed_pid_stale" }
            if ($titleChanged) { $reasons += "title_changed" }
            if ($classChanged) { $reasons += "class_changed" }
            if ($reasons.Count -gt 0) { $status = "drifted" }
        }

        $bindingDiagnoses += [ordered]@{
            identity_name = $binding.identity_name
            hwnd = $binding.hwnd
            status = $status
            reasons = @($reasons)
            window_exists = $windowExists
            process_alive = $processAlive
            observed_pid = $binding.observed_pid
            current_title = $currentTitle.ToString()
            expected_title = $binding.observed_title
            current_class = $currentClass.ToString()
            expected_class = $binding.observed_class
            recommended_action = if ($status -eq "dead") {
                "operator_surface_prune_stale_bindings_then_operator_surface_bind_agent_if_new_carrier_exists"
            } elseif ($status -eq "drifted") {
                "verify_with_operator_surface_health_then_operator_surface_bind_agent_or_project_osl_bindings"
            } else {
                "none"
            }
        }
    }
}

$deadBindings = @($bindingDiagnoses | Where-Object { $_.status -eq "dead" })
$driftedBindings = @($bindingDiagnoses | Where-Object { $_.status -eq "drifted" })

$distinguishingEvidence = if (-not $whkdConfigOk) {
    "whkd_config_missing_or_incomplete"
} elseif (-not $whkdDaemonRunning) {
    "whkd_process_not_running"
} elseif (-not $stateProbe.ok) {
    "komorebi_client_unresponsive"
} elseif (-not $foregroundBinding) {
    "foreground_outside_admitted_operator_surface"
} else {
    "shortcut_path_configured_and_komorebi_responsive"
}

$visibleLabelStatus = if (-not $oslRunning) {
    "unavailable_osl_not_running"
} elseif ($bindingDiagnoses.Count -gt 0) {
    "labels_projected_from_compatibility_json"
} else {
    "osl_alive_no_visible_label_projection"
}

$healthTaxonomy = [ordered]@{
    schema = "narada.operator_surfaces.health_taxonomy.v0"
    canonical_model = "Separate binding authority, projection freshness, OSL process liveness, visible-label confidence, and repair-capability availability. Healthy process liveness alone is not healthy operator-surface state."
    authority_boundaries = [ordered]@{
        binding_authority = "operator_surface_health SQLite diagnosis; this script reports projection-only compatibility evidence"
        projection_authority = "projection_only_compatibility_json"
        visible_label_authority = "OSL runtime observation plus projected binding labels"
        repair_authority = "declared local repair scripts; mutating repair still requires operator authority"
    }
    dimensions = [ordered]@{
        binding_authority = [ordered]@{
            status = if ($deadBindings.Count -gt 0) { "dead" } elseif ($driftedBindings.Count -gt 0) { "projection_drifted" } else { "healthy_or_no_projection_drift" }
            source = "operator-surface-window-bindings projection plus Win32 liveness probes"
            note = "Use operator_surface_health for SQLite-authoritative binding diagnosis."
        }
        projection_freshness = [ordered]@{
            status = if ($driftedBindings.Count -gt 0) { "projection_drifted" } else { "projection_current_or_no_bindings" }
            drifted_count = $driftedBindings.Count
            dead_count = $deadBindings.Count
        }
        osl_process_liveness = [ordered]@{
            status = if ($oslRunning) { "running" } else { "not_running" }
            pid = $oslPid
            reason = if ($oslRunning) { "osl_pid_alive" } else { "osl_pid_missing_or_stale" }
        }
        visible_label_confidence = [ordered]@{
            status = $visibleLabelStatus
            source = "OSL liveness combined with projected binding count"
            degraded_when = "OSL is running but no projected labels exist, or OSL is not running."
        }
        role_border_color_projection = [ordered]@{
            status = $roleColorProjectionStatus
            authority = if ($labels) { [string]$labels.projection_authority } else { $null }
            projection_source = if ($labels) { [string]$labels.projection_source } else { $null }
            projection_path = $labelPath
            runtime_binding_path = if ($labels) { [string]$labels.runtime_binding_path } else { $null }
            role_color_field = "bindings[].style.role_text_hex"
            projected_binding_count = $labelBindings.Count
            role_color_binding_count = $roleColorBindings.Count
            missing_role_color_binding_count = $missingRoleColorBindings.Count
            note = "Role border colors are projection values from SQLite-authoritative operator-surface profiles; the compatibility JSON is not authority."
        }
        repair_capability_availability = [ordered]@{
            status = if (Test-Path -LiteralPath (Join-Path $UserSiteRoot "tools\operator-surface-carriers\Restart-WhkdDaemon.ps1")) { "available" } else { "missing_capability" }
            whkd_repair_command_projected = [bool](Test-Path -LiteralPath (Join-Path $UserSiteRoot "tools\operator-surface-carriers\Restart-WhkdDaemon.ps1"))
        }
    }
}

$result = [ordered]@{
    schema = "narada.operator_surfaces.komorebi_shortcut_role_border_health.v0"
    observed_at = (Get-Date -Format "o")
    user_site_root = $UserSiteRoot
    pc_site_root = $PcSiteRoot
    komorebi = [ordered]@{
        process_count = $komorebiProcess.Count
        state_probe = $stateProbe
        focused_window_probe = $focusedWindowProbe
        stale_komorebic_clients = @($staleKomorebicClients)
    }
    whkd = [ordered]@{
        process_count = $whkdProcess.Count
        config_path = $WhkdConfigPath
        config_present = $whkdConfigPresent
        config_ok = [bool]$whkdConfigOk
        missing_bindings = @($missingWhkdBindings)
        hjkl_bindings_present = $bindingPresence
        daemon = [ordered]@{
            running = [bool]$whkdDaemonRunning
            process_count = $whkdProcess.Count
            process_count_fixture = if ($WhkdProcessCountFixture -ge 0) { $WhkdProcessCountFixture } else { $null }
        }
        readiness = [ordered]@{
            ready = [bool]$whkdReady
            config_ok = [bool]$whkdConfigOk
            daemon_running = [bool]$whkdDaemonRunning
            degraded_reason = if ($whkdReady) { $null } elseif (-not $whkdConfigOk) { "config_missing_or_incomplete" } else { "daemon_not_running" }
            repair_command = "pwsh.exe -NoProfile -ExecutionPolicy Bypass -File `"$UserSiteRoot\tools\operator-surface-carriers\Restart-WhkdDaemon.ps1`" -Mode restart -MutatingAuthorized <authority> -PassThru"
        }
    }
    yasb = [ordered]@{
        log_path = $yasbLogPath
        source_roots_checked = @($yasbSourceRoots)
        process_count = $yasbProcesses.Count
        running_processes = @($yasbProcesses)
        komorebi_timeout_evidence = @($yasbTimeoutLines)
    }
    health_taxonomy = $healthTaxonomy
    role_border = [ordered]@{
        watcher_status = $roleWatcherStatus
        pid_path = $rolePidPath
        osl_pid_path = $oslPidPath
        osl_running = [bool]$oslRunning
        osl_pid = $oslPid
        log_path = $roleLogPath
        recent_color_events = @($roleColorEvents)
        recent_evidence = @($roleBorderLines)
        source_of_truth = [ordered]@{
            authority = "operator_surface_sqlite_profile_projection"
            projection_authority = if ($labels) { [string]$labels.projection_authority } else { $null }
            projection_source = if ($labels) { [string]$labels.projection_source } else { $null }
            projection_path = $labelPath
            runtime_binding_path = if ($labels) { [string]$labels.runtime_binding_path } else { $null }
            role_color_field = "bindings[].style.role_text_hex"
            role_color_bindings = @($roleColorBindings)
            missing_role_color_bindings = @($missingRoleColorBindings)
        }
        failure_classification = if ($roleColorProjectionStatus -ne "role_color_projection_complete") {
            $roleColorProjectionStatus
        } elseif ($driftedBindings.Count -gt 0 -or $deadBindings.Count -gt 0) {
            "window_binding_projection_drift"
        } elseif (-not (($roleWatcherStatus -eq "running") -or ($roleWatcherStatus -eq "running_via_osl"))) {
            "role_border_runtime_delivery_missing"
        } elseif (-not $foregroundBinding) {
            "foreground_window_outside_admitted_binding"
        } else {
            "source_projection_present_runtime_delivery_reported"
        }
        containment = "Refresh/prune/rebind operator-surface runtime bindings through MCP, then use the admitted PC-locus repair/restart surface if role-border delivery remains missing."
        prevention = "Keep role color source/projection, binding drift, and runtime delivery visible in health output; do not treat Komorebi/OSL process liveness as color delivery proof."
        runtime_verification_limit = "This MCP health path cannot sample the rendered Komorebi border pixels for a target HWND; recent color events, watcher status, and binding health are proxy evidence."
    }
    capability_health = [ordered]@{
        yasb_delivered = $yasbProcesses.Count -gt 0
        yasb_reason = if ($yasbProcesses.Count -gt 0) { "pythonw_processes_with_main_py_detected" } else { "no_yasb_pythonw_processes_found" }
        role_border_delivered = ($roleWatcherStatus -eq "running") -or ($roleWatcherStatus -eq "running_via_osl")
        role_border_reason = if ($roleWatcherStatus -eq "running") { "standalone_watcher_pid_alive" } elseif ($roleWatcherStatus -eq "running_via_osl") { "osl_running_with_recent_color_events" } else { "no_watcher_pid_and_no_osl_evidence" }
        osl_delivered = [bool]$oslRunning
        osl_reason = if ($oslRunning) { "osl_pid_alive" } else { "osl_pid_missing_or_stale" }
    }
    foreground = [ordered]@{
        hwnd = $foreground
        admitted_binding = if ($foregroundBinding) { [string]$foregroundBinding.identity_name } else { $null }
    }
    binding_projection_check = [ordered]@{
        authority = "projection_only"
        projection_source = if ($runtime) { [string]$runtime.projection_source } else { $null }
        note = "Compatibility JSON is checked only as renderer projection evidence. Use operator_surface_health for SQLite-authoritative binding diagnosis."
        total_bindings = $bindingDiagnoses.Count
        healthy = @($bindingDiagnoses | Where-Object { $_.status -eq "healthy" }).Count
        drifted = @($bindingDiagnoses | Where-Object { $_.status -eq "drifted" }).Count
        dead = @($bindingDiagnoses | Where-Object { $_.status -eq "dead" }).Count
        bindings = @($bindingDiagnoses)
        evaluation = if ($deadBindings.Count -gt 0) {
            "DEAD: $($deadBindings.Count) binding(s) have lost their window or process. Rebinding or carrier admission required."
        } elseif ($driftedBindings.Count -gt 0) {
            "DRIFT: $($driftedBindings.Count) binding(s) have title/class changes. Verify they still map to the intended identity."
        } else {
            "HEALTHY: All bindings are alive and match expected state."
        }
        decision = if ($deadBindings.Count -gt 0) {
            "Use operator_surface_prune_stale_bindings for dead active bindings, then operator_surface_bind_agent when a replacement live carrier HWND is known."
        } elseif ($driftedBindings.Count -gt 0) {
            "Use operator_surface_health for SQLite-authoritative diagnosis; refresh projection with operator_surface_project_osl_bindings if the binding is still correct."
        } else {
            $null
        }
    }
    distinguishing_evidence = $distinguishingEvidence
}

if ($PassThru) {
    $result | ConvertTo-Json -Depth 80
} else {
    [pscustomobject]@{
        Komorebi = if ($stateProbe.ok) { "responsive" } elseif ($stateProbe.timed_out) { "timeout" } else { "failed" }
        Whkd = if ($whkdDaemonRunning) { "running" } else { "not_running" }
        HJKL = if ($whkdConfigOk) { "configured" } else { "missing" }
        RoleBorder = $roleWatcherStatus
    YasbDelivered = ($yasbProcesses.Count -gt 0)
    CapabilityHealth = ($yasbProcesses.Count -gt 0) -and (($roleWatcherStatus -eq "running") -or ($roleWatcherStatus -eq "running_via_osl"))
        Foreground = if ($foregroundBinding) { [string]$foregroundBinding.identity_name } else { "unbound" }
        Evidence = $distinguishingEvidence
    } | Format-List
}
