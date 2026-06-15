[CmdletBinding()]
param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$SiteId,
    [string]$DeclarationPath,
    [string]$TargetRoot,
    [string]$CommandName = "setup-site",
    [switch]$SiteBuilderMode,
    [switch]$AdmitTarget,
    [switch]$Execute,
    [switch]$PlanOnly,
    [switch]$DryRun,
    [switch]$RefreshGenerated,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJsonText {
    param([string]$Json)
    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Json | ConvertFrom-Json -Depth 100 }
    return $Json | ConvertFrom-Json
}

function ConvertTo-NaradaJsonText {
    param($Value)
    $command = Get-Command ConvertTo-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Value | ConvertTo-Json -Depth 100 }
    return $Value | ConvertTo-Json
}

function Get-NaradaRelativePath {
    param([string]$Root, [string]$Path)
    $rootFullPath = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $pathFullPath = [System.IO.Path]::GetFullPath($Path)
    if ($pathFullPath.StartsWith($rootFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $pathFullPath.Substring($rootFullPath.Length).TrimStart([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    }
    return $pathFullPath
}

function Resolve-NaradaRelativePath {
    param([string]$Root, [string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    if ([System.IO.Path]::IsPathRooted($Path)) { return $Path }
    return Join-Path $Root $Path
}

function Write-NaradaTextIfAbsentOrSame {
    param([string]$Path, [string]$Content)
    if (Test-Path -LiteralPath $Path) {
        $existing = [System.IO.File]::ReadAllText($Path)
        if ($existing -ne $Content) {
            return [pscustomobject][ordered]@{
                path = $Path
                status = "conflict_existing_file_differs"
                wrote = $false
            }
        }
        return [pscustomobject][ordered]@{
            path = $Path
            status = "already_current"
            wrote = $false
        }
    }
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.Encoding]::UTF8)
    return [pscustomobject][ordered]@{
        path = $Path
        status = "written"
        wrote = $true
    }
}

function Write-NaradaTextAlways {
    param([string]$Path, [string]$Content)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.Encoding]::UTF8)
    return [pscustomobject][ordered]@{
        path = $Path
        status = "written"
        wrote = $true
    }
}

function Test-NaradaGeneratedStartupContract {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $json = ConvertFrom-NaradaJsonText ([System.IO.File]::ReadAllText($Path))
        return $json.schema -eq "narada.site_startup_contract.v0" -and $json.generated_from -eq "site-target.json"
    } catch {
        return $false
    }
}

function Test-NaradaGeneratedLauncher {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $text = [System.IO.File]::ReadAllText($Path)
    return $text.Contains("narada.site_start.launcher_result.v0") -and $text.Contains("startup-contract.json")
}

function Write-NaradaGeneratedText {
    param(
        [string]$Path,
        [string]$Content,
        [string]$Kind,
        [bool]$Refresh
    )
    $write = Write-NaradaTextIfAbsentOrSame -Path $Path -Content $Content
    if ($write.status -ne "conflict_existing_file_differs" -or -not $Refresh) { return $write }

    $generated = if ($Kind -eq "startup_contract") {
        Test-NaradaGeneratedStartupContract -Path $Path
    } elseif ($Kind -eq "launcher") {
        Test-NaradaGeneratedLauncher -Path $Path
    } else {
        $false
    }
    if (-not $generated) { return $write }

    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.Encoding]::UTF8)
    return [pscustomobject][ordered]@{
        path = $Path
        status = "refreshed_generated"
        wrote = $true
    }
}

function New-NaradaTargetOrientationPrimitives {
    param($Declaration)
    $siteId = [string]$Declaration.site_id
    $displayName = if ($Declaration.display_name) { [string]$Declaration.display_name } else { $siteId }
    $intent = if ($Declaration.target.intent) { [string]$Declaration.target.intent } else { "Operate as a Narada target Site." }
    $desiredRole = if ($Declaration.target.desired_role) { [string]$Declaration.target.desired_role } else { "Target Site." }
    [pscustomobject][ordered]@{
        schema = "narada.site_evolution.orientation_primitives.v0"
        site_id = $siteId
        place_story = [ordered]@{
            one_sentence = "$displayName is a Narada target Site materialized from site-target.json for: $intent"
            genesis_stages = @(
                [ordered]@{ id = "site_target_declared"; label = "site-target.json declared"; claim_type = "artifact_evidence"; confidence = "high" },
                [ordered]@{ id = "source_site_materialized"; label = "Source Site materialized target startup surface"; claim_type = "artifact_evidence"; confidence = "high" },
                [ordered]@{ id = "one_command_startup"; label = "One-command startup contract admitted"; claim_type = "artifact_evidence"; confidence = "medium" }
            )
        }
        authority_brief = @(
            [ordered]@{ id = "site_target_is_authority_source"; label = "site-target.json owns the initial target identity and purpose."; claim_type = "artifact_evidence"; confidence = "high" },
            [ordered]@{ id = "target_site_mcp_only"; label = "Target Site lifecycle and mutation work must use target-local MCP surfaces."; claim_type = "artifact_evidence"; confidence = "high" },
            [ordered]@{ id = "source_materialization_not_target_proof"; label = "Source Site materialization is bootstrap evidence, not independent target-agent completion proof."; claim_type = "synthesis"; confidence = "high" }
        )
        what_usually_goes_wrong = @(
            [ordered]@{ id = "missing_seed_material_as_terminal"; label = "Treating a seed Site's empty workboard as terminal completion without checking inbox and capability surfaces."; claim_type = "synthesis"; confidence = "medium" },
            [ordered]@{ id = "source_target_locus_smear"; label = "Confusing User Site bootstrap authority with target Site mutation authority."; claim_type = "synthesis"; confidence = "high" },
            [ordered]@{ id = "projection_as_authority"; label = "Treating generated projections as durable authority instead of startup evidence."; claim_type = "synthesis"; confidence = "high" }
        )
        must_preserve = @(
            [ordered]@{ id = "target_locus_boundary"; label = "Target Site root remains the locus for target lifecycle, inbox, and evidence mutations."; claim_type = "artifact_evidence"; confidence = "high" },
            [ordered]@{ id = "mechanical_identity_binding"; label = "Agent identity comes from mechanical start evidence, not chat claims or role names."; claim_type = "artifact_evidence"; confidence = "high" },
            [ordered]@{ id = "one_command_startup_contract"; label = "Launcher startup must not require manual prompt relay or a second operator command."; claim_type = "artifact_evidence"; confidence = "high" }
        )
        first_questions = @(
            [ordered]@{ id = "target_or_source_locus"; question = "Is this action targeting the generated Site or the source User Site?" },
            [ordered]@{ id = "empty_workboard_meaning"; question = "Is the workboard empty because no tasks exist, or because another surface has pending inbox/capability work?" },
            [ordered]@{ id = "startup_contract_evidence"; question = "Does startup evidence prove identity, target-local MCP readiness, and orientation?" }
        )
        navigation_protocol = [ordered]@{
            recognition_rule = "If the operator asks where to go next, distinguish target startup proof, inbox intake, task materialization, and source-site lift repair before choosing execution order."
            required_response_shape = "Name the target locus, summarize startup evidence, then choose one coherent next movement with its authority basis."
            workboard_role = "Use task_lifecycle_next as execution-order evidence, not as complete proof that the target Site has no work."
        }
        pause_triggers = @(
            [ordered]@{ id = "identity_warning_or_mismatch"; label = "Identity is missing, low-confidence, or mismatched." },
            [ordered]@{ id = "cross_locus_mutation"; label = "Would mutate source/User Site state when target Site authority is required, or vice versa." },
            [ordered]@{ id = "missing_mcp_capability"; label = "Needed target-local MCP capability is unavailable." },
            [ordered]@{ id = "destructive_operation"; label = "Would delete, force-push, reset, or overwrite user work." },
            [ordered]@{ id = "external_publication"; label = "Would publish to an external public surface." }
        )
        generated_from = "site-target.json"
        target_role = $desiredRole
    }
}

function New-NaradaTargetGenesisArc {
    param($Declaration)
    $siteId = [string]$Declaration.site_id
    $displayName = if ($Declaration.display_name) { [string]$Declaration.display_name } else { $siteId }
    $intent = if ($Declaration.target.intent) { [string]$Declaration.target.intent } else { "Operate as a Narada target Site." }
    @"
# Genesis Arc

$displayName began as $siteId in `site-target.json`.

Initial intent: $intent

The source User Site materialized this seed orientation so startup can distinguish a genuinely empty workboard from a missing Site identity/orientation surface. This document is bootstrap orientation, not task authority.
"@
}

function New-NaradaSiteStartupContract {
    param($Declaration)
    $siteId = [string]$Declaration.site_id
    $sourceLauncher = Join-Path $UserSiteRoot "narada-andrey.ps1"
    $escapedSourceLauncher = $sourceLauncher.Replace("'", "''")
    $escapedUserSiteRoot = $UserSiteRoot.Replace("'", "''")
    $targetMcpServers = @(
        "$siteId-agent-context",
        "$siteId-task-lifecycle",
        "$siteId-inbox",
        "$siteId-operator-surface",
        "$siteId-site-lift-catalog",
        "$siteId-site-probe",
        "$siteId-site-connectivity",
        "$siteId-site-identity",
        "$siteId-filesystem",
        "$siteId-test",
        "$siteId-shell",
        "$siteId-adr"
    )
    [pscustomobject][ordered]@{
        schema = "narada.site_startup_contract.v0"
        site_id = $siteId
        status = "gated"
        generated_from = "site-target.json"
        operator_contract = [ordered]@{
            remembered_command = ".\launchers\start-$($siteId.Replace('narada-', ''))-architect.ps1"
            no_manual_prompt_relay = $true
            no_second_operator_command = $true
            blocked_launcher_semantics = "preflight_only"
        }
        agents = @(
            [ordered]@{
                role = "architect"
                agent_id = "$siteId.Architect"
                launcher_path = "launchers/start-$($siteId.Replace('narada-', ''))-architect.ps1"
            },
            [ordered]@{
                role = "builder"
                agent_id = "$siteId.Builder"
                launcher_path = "launchers/start-$($siteId.Replace('narada-', ''))-builder.ps1"
            }
        )
        required_gates = @(
            [ordered]@{
                id = "codex_initial_instruction_delivery"
                required_status = "verified"
                evidence_path = ".ai/runtime/startup-gates/codex-initial-instruction-delivery.json"
                blocks_one_command = $true
            },
            [ordered]@{
                id = "target_local_mcp_or_closeout_surface"
                required_status = "verified"
                evidence_path = ".ai/runtime/startup-gates/target-local-closeout-surface.json"
                blocks_one_command = $true
            }
        )
        post_launch_evidence = @(
            [ordered]@{
                id = "launched_session_evidence_ownership"
                required_status = "verified"
                evidence_path = ".ai/runtime/startup-gates/launched-session-evidence-ownership.json"
                blocks_one_command = $false
                produced_after = "carrier_execution"
            }
        )
        startup_goal = "Run target-local startup proof, verify binding/checkpoint/site-target evidence, and export completion without operator prompt relay."
        required_evidence = @(
            "NARADA_AGENT_ID",
            "NARADA_SITE_ROOT",
            "cwd",
            "site-target.json site_id",
            "checkpoint memory read or startup checkpoint write",
            "MCP namespace posture",
            "completion receipt or target-runtime residual"
        )
        completion_export = [ordered]@{
            command = ".\completion\send-startup-proof.ps1"
            status_if_file_export = "exported_for_admission"
            terminal_live_inbox_required_for = "admitted_completion"
        }
        carrier_execution = [ordered]@{
            status = if (Test-Path -LiteralPath $sourceLauncher -PathType Leaf) { "launchable" } else { "missing_carrier_execution_surface" }
            command_kind = if (Test-Path -LiteralPath $sourceLauncher -PathType Leaf) { "powershell" } else { $null }
            launch_mode = if (Test-Path -LiteralPath $sourceLauncher -PathType Leaf) { "inline_interactive" } else { $null }
            command = if (Test-Path -LiteralPath $sourceLauncher -PathType Leaf) { "& '$escapedSourceLauncher' agent-start -UserSiteRoot '$escapedUserSiteRoot' -Agent '{{agent_id}}' -Runtime codex -TargetSiteId '$siteId' -TargetSiteRoot '{{site_root}}' -Exec" } else { $null }
            working_directory = "{{site_root}}"
            result_path = ".ai/runtime/launcher-results/{{agent_id}}.json"
            target_site_id = $siteId
            target_site_root = "{{site_root}}"
            mcp_server_projection = [ordered]@{
                status = "target_local_projected"
                server_prefix = $siteId
                server_names = $targetMcpServers
                required_for_gate = "target_local_mcp_or_closeout_surface"
            }
            placeholders = @("{{agent_id}}", "{{site_root}}")
            required_for = "ready_for_one_command_start"
        }
        terminal_residual_policy = [ordered]@{
            missing_required_gate = "blocked_not_one_command"
            missing_target_mcp = "target_runtime_residual"
            missing_carrier_execution_surface = "blocked_missing_carrier_execution_surface"
            file_export_only = "exported_for_admission"
        }
    }
}

function New-NaradaGuardedLauncherScript {
    param(
        [string]$SiteId,
        [string]$AgentId,
        [string]$LauncherName
    )
    @"
[CmdletBinding()]
param(
    [switch]`$DryRun,
    [switch]`$PassThru
)

`$ErrorActionPreference = "Stop"
`$SiteRoot = (Resolve-Path -LiteralPath (Join-Path `$PSScriptRoot "..")).Path
`$ContractPath = Join-Path `$SiteRoot "startup-contract.json"
`$Contract = Get-Content -LiteralPath `$ContractPath -Raw | ConvertFrom-Json
`$env:NARADA_AGENT_ID = "$AgentId"
`$env:NARADA_SITE_ROOT = `$SiteRoot
`$env:NARADA_TARGET_SITE_ID = "$SiteId"
Set-Location -LiteralPath `$SiteRoot

`$GateResults = @()
foreach (`$gate in @(`$Contract.required_gates)) {
    `$path = Join-Path `$SiteRoot ([string]`$gate.evidence_path)
    `$state = [ordered]@{
        id = [string]`$gate.id
        evidence_path = `$path
        exists = Test-Path -LiteralPath `$path
        status = "missing"
    }
    if (`$state.exists) {
        try {
            `$evidence = Get-Content -LiteralPath `$path -Raw | ConvertFrom-Json
            `$state.status = [string]`$evidence.status
        } catch {
            `$state.status = "invalid_evidence"
        }
    }
    `$GateResults += [pscustomobject]`$state
}

`$Missing = @(`$GateResults | Where-Object { `$_.status -ne "verified" })
`$CarrierExecution = `$Contract.carrier_execution
`$CarrierCommand = if (`$CarrierExecution) { [string]`$CarrierExecution.command } else { `$null }
`$CarrierKind = if (`$CarrierExecution) { [string]`$CarrierExecution.command_kind } else { `$null }
`$CarrierLaunchMode = if (`$CarrierExecution -and `$CarrierExecution.launch_mode) { [string]`$CarrierExecution.launch_mode } else { "inline" }
`$CarrierReady = -not [string]::IsNullOrWhiteSpace(`$CarrierCommand) -and `$CarrierKind -eq "powershell"
`$Status = if (`$Missing.Count -gt 0) {
    "blocked_not_one_command"
} elseif (-not `$CarrierReady) {
    "blocked_missing_carrier_execution_surface"
} elseif (`$DryRun) {
    "ready_for_one_command_start"
} else {
    "ready_for_one_command_start"
}
`$CarrierResultPath = if (`$CarrierExecution -and `$CarrierExecution.result_path) {
    [string]`$CarrierExecution.result_path
} else {
    ".ai/runtime/launcher-results/$AgentId.json"
}
`$CarrierResultPath = `$CarrierResultPath.Replace("{{agent_id}}", `$env:NARADA_AGENT_ID).Replace("{{site_root}}", `$SiteRoot)
if (-not [System.IO.Path]::IsPathRooted(`$CarrierResultPath)) {
    `$CarrierResultPath = Join-Path `$SiteRoot `$CarrierResultPath
}
`$Result = [ordered]@{
    schema = "narada.site_start.launcher_result.v0"
    status = `$Status
    launcher = "$LauncherName"
    site_id = "$SiteId"
    agent_id = `$env:NARADA_AGENT_ID
    site_root = `$env:NARADA_SITE_ROOT
    cwd = (Get-Location).Path
    startup_contract_path = `$ContractPath
    preflight_status = if (`$Missing.Count -eq 0) { "verified" } else { "blocked" }
    execution_status = if (`$Missing.Count -gt 0) { "not_attempted_preflight_blocked" } elseif (-not `$CarrierReady) { "blocked_missing_carrier_execution_surface" } elseif (`$DryRun) { "dry_run_not_started" } else { "pending" }
    carrier_execution = `$CarrierExecution
    carrier_result_path = `$CarrierResultPath
    carrier_launch_result = `$null
    gate_results = @(`$GateResults)
    post_launch_evidence = @(`$Contract.post_launch_evidence)
    next_step = if (`$Missing.Count -gt 0) { "Verify missing startup gates; do not use manual prompt relay as one-command startup." } elseif (-not `$CarrierReady) { "Provide a sanctioned target-local carrier execution surface in startup-contract.json." } elseif (`$DryRun) { "Run without -DryRun to start the sanctioned carrier command." } else { "Carrier execution surface is ready." }
}

if (`$Missing.Count -gt 0 -or -not `$CarrierReady -or `$DryRun) {
    `$Result | ConvertTo-Json -Depth 16
    return
}

`$ResolvedCommand = `$CarrierCommand.Replace("{{agent_id}}", `$env:NARADA_AGENT_ID).Replace("{{site_root}}", `$SiteRoot)
`$WorkingDirectory = if (`$CarrierExecution -and `$CarrierExecution.working_directory) {
    [string]`$CarrierExecution.working_directory
} else {
    `$SiteRoot
}
`$WorkingDirectory = `$WorkingDirectory.Replace("{{agent_id}}", `$env:NARADA_AGENT_ID).Replace("{{site_root}}", `$SiteRoot)
if (-not [System.IO.Path]::IsPathRooted(`$WorkingDirectory)) {
    `$WorkingDirectory = Join-Path `$SiteRoot `$WorkingDirectory
}
`$PowerShellExe = (Get-Process -Id `$PID).Path
`$StartedAt = (Get-Date).ToUniversalTime().ToString("o")
`$LaunchEvidence = [ordered]@{
    schema = "narada.site_start.carrier_launch_result.v0"
    status = "started"
    launch_mode = `$CarrierLaunchMode
    command_kind = `$CarrierKind
    command = `$ResolvedCommand
    working_directory = `$WorkingDirectory
    started_at = `$StartedAt
    exit_code = `$null
    stdout = `$null
    stderr = `$null
    process_id = `$null
}
if (`$CarrierLaunchMode -eq "inline") {
    Push-Location -LiteralPath `$WorkingDirectory
    try {
        `$output = & `$PowerShellExe -NoProfile -ExecutionPolicy Bypass -Command `$ResolvedCommand 2>&1
        `$exitCode = if (`$null -eq `$LASTEXITCODE) { 0 } else { `$LASTEXITCODE }
    } finally {
        Pop-Location
    }
    `$LaunchEvidence.status = if (`$exitCode -eq 0) { "completed" } else { "failed" }
    `$LaunchEvidence.exit_code = `$exitCode
    `$LaunchEvidence.stdout = @(`$output | ForEach-Object { [string]`$_ })
} elseif (`$CarrierLaunchMode -eq "start_process") {
    `$process = Start-Process -FilePath `$PowerShellExe -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", `$ResolvedCommand) -WorkingDirectory `$WorkingDirectory -PassThru
    `$LaunchEvidence.process_id = `$process.Id
    `$LaunchEvidence.status = "started"
} elseif (`$CarrierLaunchMode -eq "inline_interactive") {
    Push-Location -LiteralPath `$WorkingDirectory
    try {
        & `$PowerShellExe -NoProfile -ExecutionPolicy Bypass -Command `$ResolvedCommand
        `$exitCode = if (`$null -eq `$LASTEXITCODE) { 0 } else { `$LASTEXITCODE }
    } finally {
        Pop-Location
    }
    `$LaunchEvidence.status = if (`$exitCode -eq 0) { "completed" } else { "failed" }
    `$LaunchEvidence.exit_code = `$exitCode
} else {
    `$LaunchEvidence.status = "failed"
    `$LaunchEvidence.stderr = "unsupported_launch_mode:`$CarrierLaunchMode"
}
`$Result.execution_status = `$LaunchEvidence.status
`$Result.carrier_launch_result = [pscustomobject]`$LaunchEvidence
`$Result.next_step = if (`$LaunchEvidence.status -eq "failed") { "Inspect carrier launch result evidence." } else { "Carrier command launched through sanctioned startup-contract surface." }
`$ResultDir = Split-Path -Parent `$CarrierResultPath
if (-not (Test-Path -LiteralPath `$ResultDir)) { New-Item -ItemType Directory -Path `$ResultDir -Force | Out-Null }
[System.IO.File]::WriteAllText(`$CarrierResultPath, (`$Result | ConvertTo-Json -Depth 16), [System.Text.Encoding]::UTF8)
`$Result | ConvertTo-Json -Depth 16
"@
}

function New-NaradaTargetLocalGateEvidence {
    param($StartupContract)

    $projection = $StartupContract.carrier_execution.mcp_server_projection
    $serverNames = @($projection.server_names)
    $expectedFilesystem = "$($StartupContract.site_id)-filesystem"
    $hasFilesystem = $serverNames -contains $expectedFilesystem
    $hasCloseoutSurface = ($serverNames -contains "$($StartupContract.site_id)-shell") -or ($serverNames -contains "$($StartupContract.site_id)-task-lifecycle")
    $verified = $projection.status -eq "target_local_projected" -and $hasFilesystem -and $hasCloseoutSurface
    [pscustomobject][ordered]@{
        schema = "narada.site_startup_gate_evidence.v0"
        gate_id = "target_local_mcp_or_closeout_surface"
        status = if ($verified) { "verified" } else { "blocked" }
        checked_at = (Get-Date).ToUniversalTime().ToString("o")
        target_site_id = [string]$StartupContract.site_id
        evidence_basis = "generated_carrier_execution_mcp_server_projection"
        expected_filesystem_server = $expectedFilesystem
        observed_servers = $serverNames
        reason = if ($verified) { "Generated carrier execution projects target-local filesystem and closeout-capable MCP surfaces." } else { "Generated carrier execution does not project required target-local filesystem and closeout-capable MCP surfaces." }
    }
}

function New-NaradaTargetSeedRoster {
    param([string]$SiteId)

    [pscustomobject][ordered]@{
        schema = "narada.agent.roster.v0"
        site_id = $SiteId
        generated_from = "site-target.json"
        agents = @(
            [ordered]@{
                agent_id = "$SiteId.Architect"
                role = "architect"
                capabilities = @("review", "route", "plan", "implement")
            },
            [ordered]@{
                agent_id = "$SiteId.Builder"
                role = "builder"
                capabilities = @("implement", "test", "report")
            }
        )
    }
}

function New-NaradaCapabilityResult {
    param($Capability)
    $blockingStates = @("missing", "blocked", "required")
    $isBlocking = $blockingStates -contains [string]$Capability.state
    [pscustomobject][ordered]@{
        id = [string]$Capability.id
        title = [string]$Capability.title
        state = [string]$Capability.state
        desired_outcome = [string]$Capability.desired_outcome
        evidence_refs = @($Capability.evidence_refs)
        blockers = @($Capability.blockers)
        next_step = [string]$Capability.next_step
        blocks_terminal_completion = $isBlocking
    }
}

if (-not (Test-Path -LiteralPath $UserSiteRoot)) {
    throw "user_site_root_missing: $UserSiteRoot"
}
$UserSiteRoot = (Resolve-Path -LiteralPath $UserSiteRoot).Path

if ([string]::IsNullOrWhiteSpace($DeclarationPath)) {
    if (-not [string]::IsNullOrWhiteSpace($TargetRoot)) {
        $DeclarationPath = Join-Path $TargetRoot "site-target.json"
    } else {
        if ([string]::IsNullOrWhiteSpace($SiteId)) { throw "site_id_or_declaration_path_required_for_setup_site" }
        $siteTargetPath = Join-Path $UserSiteRoot "declarations\site-targets\$SiteId.json"
        $legacyCapabilitiesPath = Join-Path $UserSiteRoot "declarations\site-target-capabilities\$SiteId.json"
        if (Test-Path -LiteralPath $siteTargetPath) {
            $DeclarationPath = $siteTargetPath
        } else {
            $DeclarationPath = $legacyCapabilitiesPath
        }
    }
} elseif (-not [System.IO.Path]::IsPathRooted($DeclarationPath)) {
    $DeclarationPath = Join-Path $UserSiteRoot $DeclarationPath
}

if (-not (Test-Path -LiteralPath $DeclarationPath)) {
    throw "site_target_or_capabilities_declaration_missing: $DeclarationPath"
}

$rawDeclaration = ConvertFrom-NaradaJsonText ([System.IO.File]::ReadAllText($DeclarationPath))
$siteTarget = $null
if ($rawDeclaration.schema -eq "narada.site_target.v0") {
    $siteTarget = $rawDeclaration
    $declaration = [pscustomobject][ordered]@{
        schema = "narada.site_target_capabilities.declaration.v0"
        site_target_schema = [string]$rawDeclaration.schema
        site_target_version = $rawDeclaration.version
        site_target_status = [string]$rawDeclaration.status
        target = $rawDeclaration.target
        site_id = [string]$rawDeclaration.site_id
        display_name = [string]$rawDeclaration.display_name
        source_site_id = [string]$rawDeclaration.source_site_id
        target_root = [string]$rawDeclaration.target_root
        source_refs = @($rawDeclaration.source_refs)
        site_spine = $rawDeclaration.site_spine
        authority_posture = $rawDeclaration.authority_posture
        setup = $rawDeclaration.setup
        pipeline = @($rawDeclaration.pipeline)
        capabilities = @($rawDeclaration.capability_projection.items)
        capability_projection_semantics = [string]$rawDeclaration.capability_projection.semantics
        legacy_projection_ref = [string]$rawDeclaration.capability_projection.legacy_projection_ref
    }
} else {
    $declaration = $rawDeclaration
}
$errors = New-Object System.Collections.Generic.List[string]

if ($declaration.schema -ne "narada.site_target_capabilities.declaration.v0") { $errors.Add("schema_mismatch") }
if ([string]::IsNullOrWhiteSpace($declaration.site_id)) { $errors.Add("site_id_required") }
if (-not [string]::IsNullOrWhiteSpace($SiteId) -and $declaration.site_id -ne $SiteId) { $errors.Add("site_id_declaration_mismatch:${SiteId}:$($declaration.site_id)") }
if ([string]::IsNullOrWhiteSpace($declaration.target_root) -and -not [string]::IsNullOrWhiteSpace($TargetRoot)) { $declaration.target_root = $TargetRoot }
if ([string]::IsNullOrWhiteSpace($declaration.target_root)) { $errors.Add("target_root_required") }
if ($declaration.authority_posture.source_site_may_write_target_root -ne $false) { $errors.Add("source_site_write_to_target_root_must_be_false") }
if ($Execute -and -not $AdmitTarget) { $errors.Add("target_admission_required_for_execute") }

$requiredCapabilities = if ($declaration.site_spine -and @($declaration.site_spine.proof_projection).Count -gt 0) {
    @($declaration.site_spine.proof_projection | ForEach-Object { [string]$_ })
} else {
    $errors.Add("site_spine_proof_projection_required")
    @()
}
$allowedStates = @("required", "present", "missing", "blocked", "deferred")
$capabilities = @($declaration.capabilities)
$capabilityIds = @($capabilities | ForEach-Object { [string]$_.id })
foreach ($requiredCapability in $requiredCapabilities) {
    if ($capabilityIds -notcontains $requiredCapability) { $errors.Add("missing_capability:$requiredCapability") }
}
foreach ($capability in $capabilities) {
    if ($allowedStates -notcontains [string]$capability.state) { $errors.Add("invalid_capability_state:$($capability.id):$($capability.state)") }
}

$setup = $declaration.setup
$contractDoc = if ($setup.contract_doc) { [string]$setup.contract_doc } else { "docs/site-config/site-target-capabilities-contract.md" }
$schemaPath = if ($setup.schema_path) { [string]$setup.schema_path } else { "schemas/narada.site-target-capabilities.declaration.v0.schema.json" }
$packagePath = if ($setup.package_path) { [string]$setup.package_path } else { $null }
$handoffRelativePath = if ($setup.handoff_path) { [string]$setup.handoff_path } else { "kb/site-lift/$($declaration.site_id)-site-target-capabilities-handoff.json" }
$genericCommand = if ($setup.generic_command) { [string]$setup.generic_command } else { ".\narada-andrey.ps1 setup-site -SiteId $($declaration.site_id) -PassThru" }
$genericDryRunCommand = if ($setup.generic_dry_run_command) { [string]$setup.generic_dry_run_command } else { ".\narada-andrey.ps1 setup-site -SiteId $($declaration.site_id) -DryRun -PassThru" }
$aliasCommand = if ($setup.alias_command) { [string]$setup.alias_command } else { $null }
$aliasDryRunCommand = if ($setup.alias_dry_run_command) { [string]$setup.alias_dry_run_command } else { $null }
$authorityStatement = if ($setup.authority_statement) { [string]$setup.authority_statement } else { "The source Site emits this handoff and must not write into the target root. Target-local mutation belongs to a bound target principal or explicit admitted setup path." }
$nextAuthorityStep = if ($setup.next_authority_step) { [string]$setup.next_authority_step } else { "The target Site admits and executes the handoff packet, then returns bound evidence." }
$completionStep = if ($setup.completion_step) { [string]$setup.completion_step } else { "Route completion evidence through an admitted inbox path." }

$siteSpine = if ($declaration.site_spine) {
    [pscustomobject][ordered]@{
        semantics = [string]$declaration.site_spine.semantics
        invariant_fields = @($declaration.site_spine.invariant_fields)
        projection_policy = [string]$declaration.site_spine.projection_policy
        proof_projection = @($requiredCapabilities)
    }
} else {
    $errors.Add("site_spine_required")
    [pscustomobject][ordered]@{
        semantics = $null
        invariant_fields = @()
        projection_policy = $null
        proof_projection = @()
    }
}

$capabilityResults = @($capabilities | ForEach-Object { New-NaradaCapabilityResult -Capability $_ })
$blocking = @($capabilityResults | Where-Object { $_.blocks_terminal_completion })
$status = if ($errors.Count -gt 0) {
    "invalid"
} elseif (-not $AdmitTarget) {
    "handoff_required"
} elseif ($blocking.Count -gt 0) {
    "handoff_required"
} else {
    "ready_for_materialization"
}
$siteBuilderRole = [pscustomobject][ordered]@{
    role = "site_builder"
    semantics = "Target-bound Site Target materialization executor; consumes admitted declarations and emits evidence without defining Site telos."
    allowed = @(
        "consume_site_target_declaration",
        "plan_target_local_materialization",
        "emit_setup_handoff",
        "record_evidence_and_residuals",
        "operator_authorized_target_root_bootstrap"
    )
    forbidden = @(
        "define_site_telos",
        "infer_target_authority",
        "ambient_write_target_root_from_source_site",
        "self_review_terminal_setup"
    )
    target_bound = $true
    admission_bound = $true
}
$executionIntent = [pscustomobject][ordered]@{
    command_surface = if ($SiteBuilderMode) { "site-build" } else { $CommandName }
    requested_execute = [bool]$Execute
    target_admitted = [bool]$AdmitTarget
    source_site_write_to_target_root = [bool]($Execute -and $AdmitTarget)
    mutation_posture = if ($Execute -and $AdmitTarget) { "operator_authorized_source_site_materialization" } elseif ($Execute) { "blocked_until_target_admission" } else { "plan_or_handoff_only" }
}

$relativeDeclarationPath = Get-NaradaRelativePath -Root $UserSiteRoot -Path $DeclarationPath
$handoffPath = Resolve-NaradaRelativePath -Root $UserSiteRoot -Path $handoffRelativePath
$handoff = [pscustomobject][ordered]@{
    schema = "narada.site_target.setup_handoff.v0"
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    source_site_id = if ($declaration.source_site_id) { [string]$declaration.source_site_id } else { "narada-andrey" }
    target_site_id = [string]$declaration.site_id
    target_root = [string]$declaration.target_root
    declaration_path = $relativeDeclarationPath
    declaration_schema = if ($siteTarget) { [string]$siteTarget.schema } else { [string]$rawDeclaration.schema }
    capability_projection_schema = "narada.site_target_capabilities.handoff.v0"
    site_target = $siteTarget
    site_builder_role = if ($SiteBuilderMode) { $siteBuilderRole } else { $null }
    execution_intent = $executionIntent
    contract_doc = $contractDoc
    schema_path = $schemaPath
    package_path = $packagePath
    exact_operator_command = $genericCommand
    dry_run_command = $genericDryRunCommand
    alias_command = $aliasCommand
    alias_dry_run_command = $aliasDryRunCommand
    invoked_as = $CommandName
    authority_boundary = [ordered]@{
        target_actor = [string]$declaration.authority_posture.target_actor
        source_site_role = [string]$declaration.authority_posture.source_site_role
        source_site_may_write_target_root = [bool]($Execute -and $AdmitTarget)
        statement = $authorityStatement
        write_authority_basis = if ($Execute -and $AdmitTarget) { "operator_explicit_execute_and_admit_target_flags" } else { $null }
    }
    site_spine = $siteSpine
    pipeline = @($declaration.pipeline)
    capability_projection = [ordered]@{
        semantics = if ($siteTarget) { [string]$siteTarget.capability_projection.semantics } else { "Compatibility capability projection from legacy declaration." }
        legacy_projection_ref = if ($siteTarget) { [string]$siteTarget.capability_projection.legacy_projection_ref } else { $null }
        results = $capabilityResults
    }
    capabilities = $capabilityResults
    blockers = @($blocking | ForEach-Object { [pscustomobject][ordered]@{ id = $_.id; state = $_.state; blockers = $_.blockers; next_step = $_.next_step } })
    validation_errors = @($errors)
    next_authority_step = $nextAuthorityStep
    unauthorized_target_write_performed = $false
}

$wroteHandoff = $false
$targetMaterialization = [pscustomobject][ordered]@{
    attempted = $false
    status = "not_requested"
    authority_basis = $null
    target_root = [string]$declaration.target_root
    writes = @()
    conflicts = @()
    admission_record = $null
}
if (-not $DryRun -and -not $PlanOnly) {
    $handoffDir = Split-Path -Parent $handoffPath
    if (-not (Test-Path -LiteralPath $handoffDir)) {
        New-Item -ItemType Directory -Path $handoffDir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($handoffPath, (ConvertTo-NaradaJsonText $handoff), [System.Text.Encoding]::UTF8)
    $wroteHandoff = $true
}

if ($Execute -and $AdmitTarget -and $errors.Count -eq 0) {
    $targetRoot = [string]$declaration.target_root
    $targetMaterialization.attempted = $true
    $targetMaterialization.status = "attempted"
    $targetMaterialization.authority_basis = "operator_explicit_execute_and_admit_target_flags"

    if (-not $DryRun -and -not $PlanOnly) {
        if (-not (Test-Path -LiteralPath $targetRoot)) {
            New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
        }

        $targetSiteTarget = if ($siteTarget) { $siteTarget } else { $rawDeclaration }
        $siteSlug = ([string]$declaration.site_id).Replace("narada-", "")
        $targetSiteTargetPath = Join-Path $targetRoot "site-target.json"
        $targetSiteTargetFullPath = [System.IO.Path]::GetFullPath($targetSiteTargetPath)
        $declarationFullPath = [System.IO.Path]::GetFullPath($DeclarationPath)
        if ($targetSiteTargetFullPath.Equals($declarationFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            $siteTargetWrite = [pscustomobject][ordered]@{
                path = $targetSiteTargetPath
                status = "already_current"
                wrote = $false
            }
        } else {
            $siteTargetWrite = Write-NaradaTextIfAbsentOrSame -Path $targetSiteTargetPath -Content (ConvertTo-NaradaJsonText $targetSiteTarget)
        }
        $startupContract = New-NaradaSiteStartupContract -Declaration $declaration
        $startupContractPath = Join-Path $targetRoot "startup-contract.json"
        $startupContractWrite = Write-NaradaGeneratedText -Path $startupContractPath -Content (ConvertTo-NaradaJsonText $startupContract) -Kind "startup_contract" -Refresh ([bool]$RefreshGenerated)
        $architectLauncherPath = Join-Path $targetRoot "launchers\start-$siteSlug-architect.ps1"
        $builderLauncherPath = Join-Path $targetRoot "launchers\start-$siteSlug-builder.ps1"
        $architectLauncherWrite = Write-NaradaGeneratedText -Path $architectLauncherPath -Content (New-NaradaGuardedLauncherScript -SiteId ([string]$declaration.site_id) -AgentId "$($declaration.site_id).Architect" -LauncherName "start-$siteSlug-architect.ps1") -Kind "launcher" -Refresh ([bool]$RefreshGenerated)
        $builderLauncherWrite = Write-NaradaGeneratedText -Path $builderLauncherPath -Content (New-NaradaGuardedLauncherScript -SiteId ([string]$declaration.site_id) -AgentId "$($declaration.site_id).Builder" -LauncherName "start-$siteSlug-builder.ps1") -Kind "launcher" -Refresh ([bool]$RefreshGenerated)
        $rosterPath = Join-Path $targetRoot ".ai\agents\roster.json"
        $rosterContent = ConvertTo-NaradaJsonText (New-NaradaTargetSeedRoster -SiteId ([string]$declaration.site_id))
        $rosterWrite = if ($RefreshGenerated) { Write-NaradaTextAlways -Path $rosterPath -Content $rosterContent } else { Write-NaradaTextIfAbsentOrSame -Path $rosterPath -Content $rosterContent }
        $migrationOneSource = Join-Path $UserSiteRoot ".ai\db\migrations\001-agent-context-materializations.sql"
        $migrationTwoSource = Join-Path $UserSiteRoot ".ai\db\migrations\002-agent-events.sql"
        $migrationOnePath = Join-Path $targetRoot ".ai\db\migrations\001-agent-context-materializations.sql"
        $migrationTwoPath = Join-Path $targetRoot ".ai\db\migrations\002-agent-events.sql"
        $migrationOneContent = [System.IO.File]::ReadAllText($migrationOneSource)
        $migrationTwoContent = [System.IO.File]::ReadAllText($migrationTwoSource)
        $migrationOneWrite = if ($RefreshGenerated) { Write-NaradaTextAlways -Path $migrationOnePath -Content $migrationOneContent } else { Write-NaradaTextIfAbsentOrSame -Path $migrationOnePath -Content $migrationOneContent }
        $migrationTwoWrite = if ($RefreshGenerated) { Write-NaradaTextAlways -Path $migrationTwoPath -Content $migrationTwoContent } else { Write-NaradaTextIfAbsentOrSame -Path $migrationTwoPath -Content $migrationTwoContent }
        $orientationPrimitivesPath = Join-Path $targetRoot "docs\site-evolution\orientation-primitives.json"
        $orientationPrimitivesContent = ConvertTo-NaradaJsonText (New-NaradaTargetOrientationPrimitives -Declaration $declaration)
        $orientationPrimitivesWrite = if ($RefreshGenerated) { Write-NaradaTextAlways -Path $orientationPrimitivesPath -Content $orientationPrimitivesContent } else { Write-NaradaTextIfAbsentOrSame -Path $orientationPrimitivesPath -Content $orientationPrimitivesContent }
        $genesisArcPath = Join-Path $targetRoot "docs\site-evolution\genesis-arc.md"
        $genesisArcWrite = if ($RefreshGenerated) { Write-NaradaTextAlways -Path $genesisArcPath -Content (New-NaradaTargetGenesisArc -Declaration $declaration) } else { Write-NaradaTextIfAbsentOrSame -Path $genesisArcPath -Content (New-NaradaTargetGenesisArc -Declaration $declaration) }

        $admission = [pscustomobject][ordered]@{
            schema = "narada.site_target.materialization_admission.v0"
            materialized_at = (Get-Date).ToUniversalTime().ToString("o")
            status = "operator_authorized_source_site_materialization"
            source_site_id = if ($declaration.source_site_id) { [string]$declaration.source_site_id } else { "narada-andrey" }
            target_site_id = [string]$declaration.site_id
            target_root = $targetRoot
            authority_basis = "operator_explicit_execute_and_admit_target_flags"
            write_principal = "narada-andrey.site_builder"
            source_site_write_to_target_root = $true
            declaration_path = $relativeDeclarationPath
            source_handoff_path = Get-NaradaRelativePath -Root $UserSiteRoot -Path $handoffPath
            materialized_paths = @("site-target.json", "startup-contract.json", "launchers/start-$siteSlug-architect.ps1", "launchers/start-$siteSlug-builder.ps1", ".ai/agents/roster.json", ".ai/db/migrations/001-agent-context-materializations.sql", ".ai/db/migrations/002-agent-events.sql", "docs/site-evolution/orientation-primitives.json", "docs/site-evolution/genesis-arc.md", "admissions/site-build-admission.json", ".ai/runtime/startup-gates/target-local-closeout-surface.json")
            caveat = "This is User Site operator-authorized bootstrap materialization, not independent target-agent proof."
        }
        $writes = @($siteTargetWrite, $startupContractWrite, $architectLauncherWrite, $builderLauncherWrite, $rosterWrite, $migrationOneWrite, $migrationTwoWrite, $orientationPrimitivesWrite, $genesisArcWrite)
        $conflicts = @($writes | Where-Object { $_.status -eq "conflict_existing_file_differs" })
        if ($conflicts.Count -eq 0) {
            $admissionPath = Join-Path $targetRoot "admissions\site-build-admission.json"
            $admissionWrite = Write-NaradaTextAlways -Path $admissionPath -Content (ConvertTo-NaradaJsonText $admission)
            $targetLocalGatePath = Join-Path $targetRoot ".ai\runtime\startup-gates\target-local-closeout-surface.json"
            $targetLocalGateEvidence = New-NaradaTargetLocalGateEvidence -StartupContract $startupContract
            $targetLocalGateWrite = Write-NaradaTextAlways -Path $targetLocalGatePath -Content (ConvertTo-NaradaJsonText $targetLocalGateEvidence)
            $writes = @($writes + @($admissionWrite, $targetLocalGateWrite))
        }

        $targetMaterialization.writes = $writes
        $targetMaterialization.conflicts = $conflicts
        $targetMaterialization.admission_record = $admission
        $targetMaterialization.status = if ($conflicts.Count -gt 0) { "blocked_by_existing_target_file_conflict" } elseif ($blocking.Count -gt 0) { "materialized_with_residuals" } else { "materialized" }
    } else {
        $targetMaterialization.status = "dry_run"
    }
}

if ($targetMaterialization.status -eq "blocked_by_existing_target_file_conflict") {
    $status = "materialization_blocked"
} elseif ($targetMaterialization.status -eq "materialized_with_residuals") {
    $status = "materialized_with_residuals"
} elseif ($targetMaterialization.status -eq "materialized") {
    $status = "materialized"
}

$targetRecordFulfillment = [pscustomobject][ordered]@{
    schema = "narada.site_target.record_fulfillment.v0"
    capa_ref = "env_568dfd12-b65e-4145-b132-dcd722ca0011"
    corrective_concept = "site_target_fulfillment_requires_authoritative_record_reconciliation"
    authority_surface = if ($siteTarget) { "declarations/site-targets/<site-id>.json or target-local site-target.json" } else { "legacy capability declaration; not authoritative site-target fulfillment" }
    record_status = if ($siteTarget) { [string]$siteTarget.status } else { $null }
    materialization_status = [string]$targetMaterialization.status
    operational_readiness_status = "separate_evidence_not_authoritative_record_fulfillment"
    can_report_fulfilled = [bool]($siteTarget -and [string]$siteTarget.status -eq "ready" -and $targetMaterialization.status -eq "materialized" -and $errors.Count -eq 0 -and $blocking.Count -eq 0)
    refusal_reason = if ($siteTarget -and [string]$siteTarget.status -eq "ready" -and $targetMaterialization.status -eq "materialized" -and $errors.Count -eq 0 -and $blocking.Count -eq 0) { $null } else { "fulfilled_refused_until_authoritative_site_target_record_is_reconciled_to_ready_without_blocking_residuals" }
    summary = "Operational readiness, ready_with_residuals, and materialization usability are not site-target fulfillment unless the authoritative site-target record/admission surface is reconciled."
}

$result = [pscustomobject][ordered]@{
    schema = "narada.site_target.setup_result.v0"
    status = $status
    site_id = [string]$declaration.site_id
    target_root = [string]$declaration.target_root
    declaration_path = $relativeDeclarationPath
    declaration_schema = if ($siteTarget) { [string]$siteTarget.schema } else { [string]$rawDeclaration.schema }
    capability_projection_schema = "narada.site_target_capabilities.setup_result.v0"
    target_record_fulfillment = $targetRecordFulfillment
    site_target = $siteTarget
    site_builder_role = if ($SiteBuilderMode) { $siteBuilderRole } else { $null }
    execution_intent = $executionIntent
    handoff_path = Get-NaradaRelativePath -Root $UserSiteRoot -Path $handoffPath
    wrote_handoff = $wroteHandoff
    unauthorized_target_write_performed = $false
    target_materialization = $targetMaterialization
    exact_operator_command = $genericCommand
    alias_command = $aliasCommand
    next_authority_step = if ($targetMaterialization.status -eq "materialized") { $completionStep } elseif ($targetMaterialization.status -eq "blocked_by_existing_target_file_conflict") { "Resolve target-local file conflict or admit overwrite policy before materialization." } elseif ($errors.Count -gt 0) { $nextAuthorityStep } elseif (-not $AdmitTarget) { $nextAuthorityStep } elseif ($blocking.Count -gt 0) { $nextAuthorityStep } else { $completionStep }
    site_spine = $siteSpine
    capability_projection_policy = $siteSpine.projection_policy
    capability_projection = [ordered]@{
        semantics = if ($siteTarget) { [string]$siteTarget.capability_projection.semantics } else { "Compatibility capability projection from legacy declaration." }
        legacy_projection_ref = if ($siteTarget) { [string]$siteTarget.capability_projection.legacy_projection_ref } else { $null }
        results = $capabilityResults
    }
    capability_counts = [ordered]@{
        total = $capabilityResults.Count
        proof_projection_required = @($requiredCapabilities).Count
        present = @($capabilityResults | Where-Object { $_.state -eq "present" }).Count
        blocking = $blocking.Count
        invalid = $errors.Count
    }
    handoff = $handoff
}

if ($PassThru) {
    ConvertTo-NaradaJsonText $result
} else {
    $result | Format-List
}
