param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("doctor", "site-doctor", "submit-observation", "work-next", "next-obligation", "materialize-workspace", "switch-workspace", "site-build", "site-materialize", "setup-site", "setup-utz-site", "reground-doctrines", "task", "task-read", "task-list", "task-claim", "task-unclaim", "task-continue", "task-finish", "task-close", "task-review", "task-inspect", "task-admin", "task-obligations", "agent-start", "agent-sessions")]
    [string]$Command,

    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2",
    [string]$WorkspaceId,
    [string]$SiteId,
    [string]$DeclarationPath,
    [string]$TargetRoot,
    [string]$TargetSiteId,
    [string]$TargetSiteRoot,
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
    [switch]$RefreshGenerated,
    [string]$NaradaCli,

    [string]$SourceKind = "agent_report",
    [string]$SourceRef,
    [string]$Title,
    [string]$Summary,
    [string[]]$Evidence = @(),
    [string[]]$Proposal = @(),
    [string]$Recommendation,
    [string]$Principal,
    [string]$AuthorityLevel = "agent_reported",
    [string]$TargetLocus = "local_site",
    [Alias("AgentId")]
    [string]$Agent = "narada-andrey.Bob",
    [int]$Limit = 8,
    [int]$MaxHumanLines = 18,
    [int]$MaxHumanBytes = 2400,
    [int]$IntendedTaskNumber = -1,
    [ValidateSet("none", "review", "commit", "inbox", "task_lifecycle")]
    [string]$BeforeMutation = "none",
    [string[]]$MutationPath = @(),
    [string]$ObligationsPath,

    [switch]$DryRun,
    [switch]$PassThru,

    [int]$TaskNumber = -1,
    [string]$Status,
    [string]$Reason,
    [string]$Verdict,
    [string]$FindingsJson,

    [string]$ObligationId,
    [string]$TargetRole,

    [string]$Runtime = "kimi",
    [ValidateSet("openai-api", "kimi-api", "anthropic-api")]
    [string]$IntelligenceProvider,
    [switch]$NoLint,
    [switch]$Json,
    [switch]$StrictLint,
    [switch]$AdmitSession,
    [switch]$AdmitTarget,
    [switch]$Execute,
    [string]$ShowAdmission,
    [switch]$Exec,
    [switch]$EnableNativeShell,
    [string]$DateFrom,
    [string]$DateTo,
    [string]$Substrate
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([string]$Json)
    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Json | ConvertFrom-Json -Depth 100 }
    return $Json | ConvertFrom-Json
}

function ConvertTo-NaradaJson {
    param($Value)
    $command = Get-Command ConvertTo-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Value | ConvertTo-Json -Depth 100 }
    return $Value | ConvertTo-Json
}

function Read-NaradaConfig {
    param([string]$Root)
    $path = Join-Path $Root "config.json"
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    return ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($path))
}

function Read-TypedMcpSurface {
    param([string]$Root, [string]$SurfaceId)
    $path = Join-Path $Root ".narada\capabilities\mcp-surfaces.json"
    if (-not (Test-Path -LiteralPath $path)) {
        return [pscustomobject][ordered]@{ declared = $false; path = $path; surface = $null; reason = "mcp_surface_registry_missing" }
    }
    $registry = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($path))
    $surface = @($registry.surfaces | Where-Object { $_.surface_id -eq $SurfaceId }) | Select-Object -First 1
    [pscustomobject][ordered]@{ declared = [bool]$surface; path = $path; surface = $surface; reason = $null }
}

function Test-RelativePathExists {
    param([string]$Root, [string]$RelativePath)
    $path = Join-Path $Root $RelativePath
    return [pscustomobject][ordered]@{
        path = $path
        exists = Test-Path -LiteralPath $path
    }
}

function Invoke-NaradaAndreyDoctor {
    param([string]$Root)

    $inbox = Read-TypedMcpSurface -Root $Root -SurfaceId "inbox-mcp.local"
    $guardScript = Join-Path $Root "tools\narada-andrey\Assert-NoRawWslCrossing.ps1"
    $guard = if (Test-Path -LiteralPath $guardScript) {
        ConvertFrom-NaradaJson (& $guardScript -Root $Root -NoThrow -PassThru)
    } else {
        [pscustomobject][ordered]@{ status = "missing"; ok = $false; violations = @("guard_script_missing") }
    }
    $reviewPickupScript = Join-Path $Root "tools\operator-surface-carriers\Invoke-ReviewPickupEscalation.ps1"
    $reviewPickup = if (Test-Path -LiteralPath $reviewPickupScript) {
        try {
            ConvertFrom-NaradaJson (& $reviewPickupScript -UserSiteRoot $Root -NoStateWrite -PassThru)
        } catch {
            [pscustomobject][ordered]@{ status = "unavailable"; reason = $_.Exception.Message; facts = @() }
        }
    } else {
        [pscustomobject][ordered]@{ status = "missing"; reason = "review_pickup_escalation_script_missing"; facts = @() }
    }
    $directedObligationScript = Join-Path $Root "tools\operator-surface-carriers\Invoke-DirectedObligationDispatcher.ps1"
    $directedObligations = if (Test-Path -LiteralPath $directedObligationScript) {
        try {
            $doArgs = @{
                UserSiteRoot = $Root
                IdentityName = $Agent
                NoStateWrite = $true
                PassThru = $true
            }
            if ($ObligationsPath) { $doArgs.ObligationsPath = $ObligationsPath }
            ConvertFrom-NaradaJson (& $directedObligationScript @doArgs)
        } catch {
            [pscustomobject][ordered]@{ status = "unavailable"; reason = $_.Exception.Message; due_count = 0; next_obligation = $null }
        }
    } else {
        [pscustomobject][ordered]@{ status = "missing"; reason = "directed_obligation_dispatcher_missing"; due_count = 0; next_obligation = $null }
    }

    $rosterDivergenceScript = Join-Path $Root "tools\task-lifecycle\check-roster-divergence.mjs"
    $rosterDivergence = if (Test-Path -LiteralPath $rosterDivergenceScript) {
        try {
            $node = (Get-Command node).Source
            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = $node
            $psi.Arguments = '"' + $rosterDivergenceScript + '" "' + $Root + '"'
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError = $true
            $psi.UseShellExecute = $false
            $proc = [System.Diagnostics.Process]::Start($psi)
            $stdout = $proc.StandardOutput.ReadToEnd()
            $stderr = $proc.StandardError.ReadToEnd()
            $proc.WaitForExit()
            if ($proc.ExitCode -ne 0) {
                throw "Node exit $($proc.ExitCode): $stderr"
            }
            ConvertFrom-NaradaJson ($stdout.Trim())
        } catch {
            [pscustomobject][ordered]@{ ok = $false; status = "unavailable"; reason = $_.Exception.Message; divergences = 0; details = @() }
        }
    } else {
        [pscustomobject][ordered]@{ ok = $true; status = "missing"; divergences = 0; details = @(); note = "check-roster-divergence.mjs not found" }
    }

    $filenameConsistencyScript = Join-Path $Root "tools\task-lifecycle\check-task-filename-consistency.mjs"
    $filenameConsistency = if (Test-Path -LiteralPath $filenameConsistencyScript) {
        try {
            $node = (Get-Command node).Source
            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = $node
            $psi.Arguments = '"' + $filenameConsistencyScript + '" "' + $Root + '"'
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError = $true
            $psi.UseShellExecute = $false
            $proc = [System.Diagnostics.Process]::Start($psi)
            $stdout = $proc.StandardOutput.ReadToEnd()
            $stderr = $proc.StandardError.ReadToEnd()
            $proc.WaitForExit()
            if ($proc.ExitCode -ne 0) {
                throw "Node exit $($proc.ExitCode): $stderr"
            }
            ConvertFrom-NaradaJson ($stdout.Trim())
        } catch {
            [pscustomobject][ordered]@{ ok = $false; status = "unavailable"; reason = $_.Exception.Message; mismatch_count = 0; mismatches = @() }
        }
    } else {
        [pscustomobject][ordered]@{ ok = $true; status = "missing"; mismatch_count = 0; mismatches = @(); note = "check-task-filename-consistency.mjs not found" }
    }

    $bindSelector = Test-RelativePathExists -Root $Root -RelativePath "tools\operator-surface-carriers\Show-FocusedWindowIdentityBindingDialog.ps1"
    $bindAlias = Test-RelativePathExists -Root $Root -RelativePath "tools\operator-surface-carriers\Show-OperatorSurfaceBindDialog.ps1"
    $bindingOk = $bindSelector.exists -and $bindAlias.exists

    $wslName = "w" + "sl"
    $status = if ($inbox.declared -and $guard.ok -and $rosterDivergence.ok -and $filenameConsistency.ok -and $bindingOk) { "ok" } else { "needs_attention" }

    [pscustomobject][ordered]@{
        schema = "narada.andrey.windows_surface.doctor.v0"
        status = $status
        occurred_at = (Get-Date -Format "o")
        site_root = $Root
        inbox_mcp = [ordered]@{
            declared = [bool]$inbox.declared
            map_path = $inbox.path
            prototype = Test-RelativePathExists -Root $Root -RelativePath "tools\typed-mcp\Invoke-InboxMcpPrototype.ps1"
            server = Test-RelativePathExists -Root $Root -RelativePath "tools\typed-mcp\inbox-mcp-server.mjs"
            submit_observation_command = ".\narada-andrey.ps1 submit-observation -Principal <identity> -SourceRef <source> -Title <title> -Summary <summary> -Evidence @('<fact 1>','<fact 2>') -Proposal @('<proposal 1>','<proposal 2>')"
        }
        raw_wsl_crossing = [ordered]@{
            posture = "forbidden"
            forbidden_narada_shape = "$wslName -d * -- bash -lc '*narada *'"
            forbidden_narada_shape_exe = "$wslName.exe -d * -- bash -lc '*narada *'"
            guard_status = $guard.status
            violation_count = @($guard.violations).Count
            if_missing_capability_report = "Use inbox-mcp.local for cross-Site interaction."
        }
        review_pickup_escalation = [ordered]@{
            status = if (@($reviewPickup.fallback_facts).Count -gt 0) { "attention" } elseif (@($reviewPickup.facts).Count -gt 0) { "observed" } else { "clear" }
            source = "Invoke-ReviewPickupEscalation.ps1"
            reviewer_identity = $reviewPickup.reviewer_identity
            facts = @($reviewPickup.facts)
            fallback_facts = @($reviewPickup.fallback_facts)
            state_path = $reviewPickup.state_path
            surface_facts_path = $reviewPickup.surface_facts_path
        }
        directed_obligations = [ordered]@{
            status = if ($directedObligations.due_count -gt 0) { "due" } elseif ($directedObligations.status) { [string]$directedObligations.status } else { "clear" }
            source = "operator-surfaces/directed-obligations.json"
            identity_name = $Agent
            due_count = if ($directedObligations.due_count -ne $null) { [int]$directedObligations.due_count } else { 0 }
            next_obligation = $directedObligations.next_obligation
            fallback_fact = $directedObligations.fallback_fact
            surface_facts_path = $directedObligations.surface_facts_path
            projection_authority = $false
        }
        roster_divergence = [ordered]@{
            status = if ($rosterDivergence.ok) { "ok" } else { "divergent" }
            divergences = if ($rosterDivergence.divergences -ne $null) { [int]$rosterDivergence.divergences } else { 0 }
            details = @($rosterDivergence.details)
            json_agent_count = $rosterDivergence.json_agent_count
            sql_agent_count = $rosterDivergence.sql_agent_count
            json_default_reviewer_role = $rosterDivergence.json_default_reviewer_role
            sql_default_reviewer_role = $rosterDivergence.sql_default_reviewer_role
            authoritative_locus = "JSON is authoritative; run: node tools/task-lifecycle/sync-roster.mjs <cwd>"
            sync_command = "node tools/task-lifecycle/sync-roster.mjs `"$Root`""
        }
        filename_consistency = [ordered]@{
            status = if ($filenameConsistency.ok) { "ok" } else { "mismatched" }
            mismatch_count = if ($filenameConsistency.mismatch_count -ne $null) { [int]$filenameConsistency.mismatch_count } else { 0 }
            mismatches = @($filenameConsistency.mismatches)
        }
        operator_surface_binding = [ordered]@{
            status = if ($bindingOk) { "ok" } else { "missing" }
            canonical_selector = $bindSelector
            legacy_alias = $bindAlias
            note = "Both scripts must exist. The legacy alias delegates to the canonical selector."
        }
        next_commands = [ordered]@{
            doctor = ".\narada-andrey.ps1 doctor"
            work_next = ".\narada-andrey.ps1 work-next -BeforeMutation commit -IntendedTaskNumber <task>"
            next_obligation = ".\narada-andrey.ps1 next-obligation -Agent <identity> -PassThru"
            submit_observation = ".\narada-andrey.ps1 submit-observation -Principal <identity> -SourceRef <source> -Title <title> -Summary <summary> -Evidence @('<fact 1>','<fact 2>') -Proposal @('<proposal 1>','<proposal 2>')"
            materialize_workspace = ".\narada-andrey.ps1 materialize-workspace -WorkspaceId <workspace> -MutatingAuthorized <authority> -PassThru"
            site_build = ".\narada-andrey.ps1 site-build -SiteId <site-id> -DryRun -PassThru"
            site_materialize = ".\narada-andrey.ps1 site-materialize -SiteId <site-id> -PassThru"
            cross_site_interaction = "Use inbox-mcp.local."
            review_pickup_escalation = ".\tools\operator-surface-carriers\Invoke-ReviewPickupEscalation.ps1 -EmitOsm -PassThru"
        }
    }
}

function Invoke-NaradaAndreySubmitObservation {
    param(
        [string]$Root
    )

    if ([string]::IsNullOrWhiteSpace($SourceRef)) { throw "source_ref_required" }
    if ([string]::IsNullOrWhiteSpace($Title)) { throw "title_required" }
    if ([string]::IsNullOrWhiteSpace($Principal)) { throw "principal_required_for_submit_observation" }

    $script = Join-Path $Root "tools\typed-mcp\Invoke-InboxMcpPrototype.ps1"
    if (-not (Test-Path -LiteralPath $script)) {
        throw "inbox_mcp_wrapper_missing: $script"
    }

    $args = @{
        Operation      = "submit_observation"
        UserSiteRoot   = $Root
        TargetSiteRoot = $Root
        SourceKind     = $SourceKind
        SourceRef      = $SourceRef
        Title          = $Title
        AuthorityLevel = $AuthorityLevel
        Principal      = $Principal
        TargetLocus    = $TargetLocus
    }
    if ($Summary) { $args.Summary = $Summary }
    if ($Evidence.Count -gt 0) { $args.Evidence = $Evidence }
    if ($Proposal.Count -gt 0) { $args.Proposal = $Proposal }
    if ($Recommendation) { $args.Recommendation = $Recommendation }
    if ($DryRun) { $args.DryRun = $true }
    if ($PassThru) { $args.PassThru = $true }

    & $script @args
}

function Invoke-NaradaAndreyMaterializeWorkspace {
    param(
        [string]$Root,
        [string]$PcRoot
    )

    $script = Join-Path $Root "tools\operator-surface-carriers\Save-CurrentOperatorWorkspace.ps1"
    if (-not (Test-Path -LiteralPath $script)) {
        throw "save_current_operator_workspace_missing: $script"
    }

    $args = @{
        UserSiteRoot = $Root
        PcSiteRoot = $PcRoot
    }
    if ($WorkspaceId) { $args.WorkspaceId = $WorkspaceId }
    if ($WorkspaceDisplayName) { $args.WorkspaceDisplayName = $WorkspaceDisplayName }
    if ($WorkspaceIntent) { $args.WorkspaceIntent = $WorkspaceIntent }
    if ($WorkspaceStatePath) { $args.WorkspaceStatePath = $WorkspaceStatePath }
    if ($IdentityPath) { $args.IdentityPath = $IdentityPath }
    if ($InspectPath) { $args.InspectPath = $InspectPath }
    if ($KomorebiStatePath) { $args.KomorebiStatePath = $KomorebiStatePath }
    if ($FocusedHwnd -ne 0) { $args.FocusedHwnd = $FocusedHwnd }
    if ($MutatingAuthorized) { $args.MutatingAuthorized = $MutatingAuthorized }
    if ($CreateIfMissing) { $args.CreateIfMissing = $true }
    if ($SingleMonitor) { $args.SingleMonitor = $true }
    if ($PlanOnly) { $args.PlanOnly = $true }
    if ($PassThru) { $args.PassThru = $true }

    & $script @args
}

if (-not (Test-Path -LiteralPath $UserSiteRoot)) {
    throw "user_site_root_missing: $UserSiteRoot"
}
$UserSiteRoot = (Resolve-Path -LiteralPath $UserSiteRoot).Path

if ($Command -eq "doctor") {
    $result = Invoke-NaradaAndreyDoctor -Root $UserSiteRoot
    if ($PassThru) { ConvertTo-NaradaJson $result } else { $result | Format-List }
    return
}

if ($Command -eq "site-doctor") {
    $script = Join-Path $UserSiteRoot "tools\narada-andrey\site-doctor.mjs"
    if (-not (Test-Path -LiteralPath $script)) { throw "site_doctor_surface_missing: $script" }
    $jsonFlag = if ($PassThru -or $Json) { "--json" } else { "" }
    if ($jsonFlag) {
        & node $script --site-root $UserSiteRoot $jsonFlag
    } else {
        & node $script --site-root $UserSiteRoot
    }
    return
}

if ($Command -eq "work-next") {
    $script = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Get-BoundedWorkloopNext.ps1"
    if (-not (Test-Path -LiteralPath $script)) { throw "bounded_workloop_surface_missing: $script" }
    $args = @{
        UserSiteRoot       = $UserSiteRoot
        Agent              = $Agent
        Limit              = $Limit
        MaxHumanLines      = $MaxHumanLines
        MaxHumanBytes      = $MaxHumanBytes
        IntendedTaskNumber = $IntendedTaskNumber
        BeforeMutation     = $BeforeMutation
        MutationPath       = $MutationPath
    }
    if ($NaradaCli) { $args.NaradaCli = $NaradaCli }
    if ($ObligationsPath) { $args.ObligationsPath = $ObligationsPath }
    if ($PassThru) {
        $result = & $script @args -PassThru
        ConvertTo-NaradaJson $result
    } else {
        & $script @args
    }
    return
}

if ($Command -eq "next-obligation") {
    $script = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Invoke-DirectedObligationDispatcher.ps1"
    if (-not (Test-Path -LiteralPath $script)) { throw "directed_obligation_dispatcher_missing: $script" }
    $args = @{
        UserSiteRoot = $UserSiteRoot
        IdentityName = $Agent
        FromIdentity = $Principal
        NoStateWrite = $true
        PassThru = $true
    }
    if ($ObligationsPath) { $args.ObligationsPath = $ObligationsPath }
    $result = & $script @args
    if ($PassThru) { ConvertTo-NaradaJson (ConvertFrom-NaradaJson $result) } else { ConvertFrom-NaradaJson $result | Format-List }
    return
}

if ($Command -eq "materialize-workspace") {
    Invoke-NaradaAndreyMaterializeWorkspace -Root $UserSiteRoot -PcRoot $PcSiteRoot
    return
}

if ($Command -eq "site-build" -or $Command -eq "site-materialize" -or $Command -eq "setup-site" -or $Command -eq "setup-utz-site") {
    $script = Join-Path $UserSiteRoot "tools\narada-andrey\Invoke-SiteTargetCapabilities.ps1"
    if (-not (Test-Path -LiteralPath $script)) { throw "site_target_capabilities_surface_missing: $script" }
    $resolvedSiteId = if ($Command -eq "setup-utz-site") { "narada-utz" } elseif ($SiteId) { $SiteId } else { $null }
    if (-not $resolvedSiteId -and -not $DeclarationPath -and -not $TargetRoot) { throw "site_id_or_declaration_path_required: use -SiteId <site-id>, -DeclarationPath <path>, or -TargetRoot <path>" }
    $args = @{
        UserSiteRoot = $UserSiteRoot
        CommandName = $Command
    }
    if ($resolvedSiteId) { $args.SiteId = $resolvedSiteId }
    if ($DeclarationPath) { $args.DeclarationPath = $DeclarationPath }
    if ($TargetRoot) { $args.TargetRoot = $TargetRoot }
    if ($Command -eq "site-build" -or $Command -eq "site-materialize") { $args.SiteBuilderMode = $true }
    if ($Command -eq "site-materialize") {
        $args.AdmitTarget = $true
        $args.Execute = $true
    }
    if ($PlanOnly) { $args.PlanOnly = $true }
    if ($DryRun) { $args.DryRun = $true }
    if ($RefreshGenerated) { $args.RefreshGenerated = $true }
    if ($AdmitTarget) { $args.AdmitTarget = $true }
    if ($Execute) { $args.Execute = $true }
    if ($PassThru) { $args.PassThru = $true }
    & $script @args
    return
}

if ($Command -eq "switch-workspace") {
    $script = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Switch-OperatorWorkspace.ps1"
    if (-not (Test-Path -LiteralPath $script)) { throw "switch_operator_workspace_missing: $script" }
    $args = @{
        UserSiteRoot = $UserSiteRoot
        PcSiteRoot = $PcSiteRoot
        Apply = $true
        MutatingAuthorized = if ($MutatingAuthorized) { $MutatingAuthorized } else { "narada-andrey.Robin" }
    }
    if ($WorkspaceId) { $args.WorkspaceId = $WorkspaceId }
    if ($PassThru) { $args.PassThru = $true }
    & $script @args
    return
}

if ($Command -eq "reground-doctrines") {
    $script = Join-Path $UserSiteRoot "tools\agent-context\doctrinal-reground.mjs"
    if (-not (Test-Path -LiteralPath $script)) { throw "doctrinal_reground_script_missing: $script" }
    $format = if ($Json) { "json" } else { "markdown" }
    & node $script --format $format
    return
}

$taskLifecycleDir = Join-Path $UserSiteRoot "tools\task-lifecycle"
$node = "node"

if ($Command -eq "task") {
    $script = Join-Path $taskLifecycleDir "task.mjs"
    & $node $script help
    return
}

if ($Command -eq "task-read") {
    if ($TaskNumber -lt 0) { throw "task_number_required" }
    $script = Join-Path $taskLifecycleDir "task-read.mjs"
    & $node $script $UserSiteRoot $TaskNumber
    return
}

if ($Command -eq "task-list") {
    $script = Join-Path $taskLifecycleDir "task-list.mjs"
    if ($Status) {
        & $node $script $UserSiteRoot $Status
    } else {
        & $node $script $UserSiteRoot
    }
    return
}

if ($Command -eq "task-claim") {
    if ($TaskNumber -lt 0) { throw "task_number_required" }
    $script = Join-Path $taskLifecycleDir "task-claim.mjs"
    & $node $script $UserSiteRoot $TaskNumber $Agent $Reason
    return
}

if ($Command -eq "task-unclaim") {
    if ($TaskNumber -lt 0) { throw "task_number_required" }
    $script = Join-Path $taskLifecycleDir "task-unclaim.mjs"
    & $node $script $UserSiteRoot $TaskNumber $Agent
    return
}

if ($Command -eq "task-continue") {
    if ($TaskNumber -lt 0) { throw "task_number_required" }
    $script = Join-Path $taskLifecycleDir "task-continue.mjs"
    & $node $script $UserSiteRoot $TaskNumber $Agent $Reason
    return
}

if ($Command -eq "task-finish") {
    if ($TaskNumber -lt 0) { throw "task_number_required" }
    $script = Join-Path $taskLifecycleDir "task-finish.mjs"
    & $node $script $UserSiteRoot $TaskNumber $Agent $Summary
    return
}

if ($Command -eq "task-close") {
    if ($TaskNumber -lt 0) { throw "task_number_required" }
    $script = Join-Path $taskLifecycleDir "task-close.mjs"
    & $node $script $UserSiteRoot $TaskNumber $Agent $Reason
    return
}

if ($Command -eq "task-review") {
    if ($TaskNumber -lt 0) { throw "task_number_required" }
    $script = Join-Path $taskLifecycleDir "task-review.mjs"
    & $node $script $UserSiteRoot $TaskNumber $Agent $Verdict $FindingsJson
    return
}

if ($Command -eq "task-inspect") {
    $script = Join-Path $taskLifecycleDir "task-inspect.mjs"
    if ($TaskNumber -ge 0) {
        & $node $script $UserSiteRoot --task $TaskNumber
    } elseif ($Status) {
        & $node $script $UserSiteRoot --table $Status
    } else {
        & $node $script $UserSiteRoot --tables
    }
    return
}

if ($Command -eq "task-admin") {
    $script = Join-Path $taskLifecycleDir "task-admin.mjs"
    if (-not $Status) { throw "task_admin_flag_required: specify -Status with --sql, --eval, or --file" }
    if (-not $Reason) { throw "task_admin_arg_required: specify -Reason with the SQL, expression, or file path" }
    & $node $script $UserSiteRoot $Status $Reason
    return
}

if ($Command -eq "agent-sessions") {
    $script = Join-Path $UserSiteRoot "tools\agent-context\list-sessions.mjs"
    if (-not (Test-Path -LiteralPath $script)) { throw "agent_sessions_script_missing: $script" }
    $flags = @($UserSiteRoot, "--limit", $Limit)
    if ($Agent) { $flags += @("--identity", $Agent) }
    if ($DateFrom) { $flags += @("--date-from", $DateFrom) }
    if ($DateTo) { $flags += @("--date-to", $DateTo) }
    if ($Substrate) { $flags += @("--substrate", $Substrate) } elseif ($Runtime) { $flags += @("--substrate", $Runtime) }
    if ($Json -or $PassThru) { $flags += "--json" }
    & $node $script @flags
    return
}

if ($Command -eq "agent-start") {
    $script = Join-Path $UserSiteRoot "tools\agent-start\start-agent.mjs"
    if (-not (Test-Path -LiteralPath $script)) { throw "agent_start_script_missing: $script" }
    $flags = @($Agent, "--pc-site-root", $PcSiteRoot, "--launch-source", "narada-andrey.ps1 agent-start")
    if ($Runtime) { $flags += @("--runtime", $Runtime) }
    if ($IntelligenceProvider) { $flags += @("--intelligence-provider", $IntelligenceProvider) }
    if ($TargetSiteId) { $flags += @("--target-site-id", $TargetSiteId) }
    if ($TargetSiteRoot) { $flags += @("--target-site-root", $TargetSiteRoot) }
    if ($Json) { $flags += "--json" }
    if ($AdmitSession) { $flags += "--admit-session" }
    if ($ShowAdmission) { $flags += @("--show-admission", $ShowAdmission) }
    if ($Exec) { $flags += "--exec" }
    if ($EnableNativeShell) { $flags += "--enable-native-shell" }
    if ($DryRun) { $flags += "--dry-run" }
    $env:NARADA_AGENT_ID = $Agent
    & $node $script @flags
    return
}

if ($Command -eq "task-obligations") {
    $script = Join-Path $taskLifecycleDir "task-obligations.mjs"
    if (-not $ObligationsPath) { throw "task_obligations_subcommand_required: specify -ObligationsPath with list, task, create, or route" }
    $flags = @($UserSiteRoot, "--$ObligationsPath")
    if ($TaskNumber -ge 0) { $flags += @("--task", $TaskNumber) }
    if ($Status) { $flags += @("--status", $Status) }
    if ($ObligationId) { $flags += @("--obligation-id", $ObligationId) }
    if ($Reason) { $flags += @("--kind", $Reason) }
    if ($TargetRole) { $flags += @("--target-role", $TargetRole) }
    if ($Agent) {
        if ($ObligationsPath -eq "route") {
            $flags += @("--target-agent", $Agent)
        } else {
            $flags += @("--agent", $Agent)
        }
    }
    & $node $script @flags
    return
}

Invoke-NaradaAndreySubmitObservation -Root $UserSiteRoot
