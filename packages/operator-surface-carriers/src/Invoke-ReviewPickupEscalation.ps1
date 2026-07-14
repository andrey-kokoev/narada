param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },
    [string]$NaradaCli,
    [string]$ReviewerIdentity = "andrey-user.Kevin",
    [string]$FromIdentity = "andrey-user.Bob",
    [int]$DelaySeconds = 30,
    [int]$ProjectionFreshnessSeconds = 600,
    [string]$NowIso,
    [string]$WorkboardFixturePath,
    [string]$ObligationsFixturePath,
    [string]$OsaFixturePath,
    [string]$StatePath,
    [string]$BridgeResultFixturePath,
    [switch]$EmitOsm,
    [switch]$NoStateWrite,
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

function Get-Array {
    param($Value)
    if ($null -eq $Value) { return @() }
    if ($Value -is [System.Array]) { return @($Value) }
    return @($Value)
}

function Get-PropertyValue {
    param($Object, [string[]]$Names)
    if ($null -eq $Object) { return $null }
    foreach ($name in $Names) {
        if ($Object.PSObject.Properties.Name -contains $name) { return $Object.$name }
    }
    return $null
}

function Get-TaskNumber {
    param($Object)
    $value = Get-PropertyValue $Object @("task_number", "taskNumber", "number", "task")
    if ($null -eq $value) { return $null }
    $parsed = 0
    if ([int]::TryParse([string]$value, [ref]$parsed)) { return $parsed }
    return $null
}

function Get-StableHash {
    param([string]$Value)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
        return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
        $sha.Dispose()
    }
}

function Write-JsonFile {
    param([string]$Path, [object]$Value)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $json = $Value | ConvertTo-Json -Depth 80
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Read-JsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return [System.IO.File]::ReadAllText($Path) | ConvertFrom-NaradaJson
}

function Read-NaradaSiteConfig {
    param([string]$Root)

    $path = Join-Path $Root "config.json"
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    return [System.IO.File]::ReadAllText($path) | ConvertFrom-NaradaJson
}

function Resolve-NaradaCliForReviewPickup {
    param(
        [string]$Root,
        [string]$Explicit
    )

    $missingCapabilityReport = "delegated CLI embodiment not loadable / missing EE-MCP capability"
    $candidates = [System.Collections.Generic.List[object]]::new()

    if (-not [string]::IsNullOrWhiteSpace($Explicit)) {
        $candidates.Add([pscustomobject][ordered]@{ source = "argument"; value = $Explicit })
    }
    if (-not [string]::IsNullOrWhiteSpace($env:NARADA_CLI)) {
        $candidates.Add([pscustomobject][ordered]@{ source = "env:NARADA_CLI"; value = $env:NARADA_CLI })
    }

    $config = Read-NaradaSiteConfig -Root $Root
    $declared = $config.narada_cli.windows.declared_entrypoint
    if (-not [string]::IsNullOrWhiteSpace($declared)) {
        $candidates.Add([pscustomobject][ordered]@{ source = "config:narada_cli.windows.declared_entrypoint"; value = [string]$declared })
    }

    foreach ($candidate in $candidates) {
        $value = [string]$candidate.value
        if ([string]::IsNullOrWhiteSpace($value)) { continue }

        $resolvedPath = $value
        if (Test-Path -LiteralPath $value -PathType Container) {
            $resolvedPath = Join-Path $value "packages\layers\cli\dist\main.js"
        } elseif ($value -notmatch "\.(mjs|cjs|js|cmd|bat|ps1|exe)$") {
            $rootCandidate = Join-Path $value "packages\layers\cli\dist\main.js"
            if (Test-Path -LiteralPath $rootCandidate -PathType Leaf) {
                $resolvedPath = $rootCandidate
            }
        }

        if (Test-Path -LiteralPath $resolvedPath -PathType Leaf) {
            if ($resolvedPath -match "\.(mjs|cjs|js)$") {
                return [pscustomobject][ordered]@{
                    available = $true
                    kind = "node_script"
                    executable = "node"
                    prefix_args = @($resolvedPath)
                    source = [string]$candidate.source
                    resolved_path = $resolvedPath
                    missing_capability_report = $missingCapabilityReport
                }
            }

            return [pscustomobject][ordered]@{
                available = $true
                kind = "executable"
                executable = $resolvedPath
                prefix_args = @()
                source = [string]$candidate.source
                resolved_path = $resolvedPath
                missing_capability_report = $missingCapabilityReport
            }
        }
    }

    $pathCommand = Get-Command narada -ErrorAction SilentlyContinue
    if ($pathCommand) {
        return [pscustomobject][ordered]@{
            available = $true
            kind = "path_command"
            executable = $pathCommand.Source
            prefix_args = @()
            source = "PATH:narada"
            resolved_path = $pathCommand.Source
            missing_capability_report = $missingCapabilityReport
        }
    }

    return [pscustomobject][ordered]@{
        available = $false
        kind = "missing_capability"
        executable = $null
        prefix_args = @()
        source = "unavailable"
        resolved_path = $null
        missing_capability_report = $missingCapabilityReport
    }
}

function Invoke-NaradaCliJson {
    param(
        $ResolvedCli,
        [string[]]$Arguments
    )

    if (-not $ResolvedCli.available) { throw $ResolvedCli.missing_capability_report }
    $argv = @($ResolvedCli.prefix_args) + @($Arguments)
    $output = & $ResolvedCli.executable @argv
    if ($LASTEXITCODE -ne 0) { throw "review_pickup_workboard_failed: $LASTEXITCODE" }
    return $output | ConvertFrom-NaradaJson
}

function Read-Workboard {
    if ($WorkboardFixturePath) { return Read-JsonFile $WorkboardFixturePath }
    return Invoke-NaradaCliJson -ResolvedCli $script:ResolvedNaradaCliForReviewPickup -Arguments @("task", "workboard", "--format", "json", "--limit", "50", "--cwd", $UserSiteRoot)
}

function Read-Obligations {
    if ($ObligationsFixturePath) {
        $fixture = Read-JsonFile $ObligationsFixturePath
        if ($fixture.PSObject.Properties.Name -contains "obligations") { return @(Get-Array $fixture.obligations) }
        return @(Get-Array $fixture)
    }
    return @()
}

function Read-OsaProjection {
    $path = if ($OsaFixturePath) { $OsaFixturePath } else { Join-Path $UserSiteRoot "operator-surfaces\window-labels.json" }
    $parsed = Read-JsonFile $path
    if ($null -eq $parsed) {
        return [pscustomobject][ordered]@{ available = $false; path = $path; parsed = $null; reason = "projection_file_missing" }
    }
    return [pscustomobject][ordered]@{ available = $true; path = $path; parsed = $parsed; reason = $null }
}

function Get-PendingReviews {
    param($Workboard)
    if ($Workboard.PSObject.Properties.Name -contains "pending_reviews") { return @(Get-Array $Workboard.pending_reviews) }
    if ($Workboard.PSObject.Properties.Name -contains "tasks") {
        return @(Get-Array $Workboard.tasks | Where-Object { [string]$_.status -eq "in_review" })
    }
    return @()
}

function Test-TargetsReviewer {
    param($Object, [string]$Identity)
    foreach ($name in @("intended_reviewer", "requested_reviewer", "reviewer", "reviewer_identity", "target_identity", "target_agent_id", "to_identity", "to")) {
        $value = Get-PropertyValue $Object @($name)
        foreach ($entry in (Get-Array $value)) {
            if ([string]$entry -eq $Identity) { return $true }
            if ($entry -and $entry.PSObject.Properties.Name -contains "identity_name" -and [string]$entry.identity_name -eq $Identity) { return $true }
        }
    }
    return $false
}

function Get-ReviewerActivity {
    param($Projection, [string]$Identity, [datetime]$Now)
    if (-not $Projection.available) {
        return [pscustomobject][ordered]@{ state = "unavailable"; admissible = $false; reason = $Projection.reason; provenance = $null }
    }

    $parsed = $Projection.parsed
    $generatedAtRaw = Get-PropertyValue $parsed @("generated_at", "updated_at")
    $generatedAt = [datetime]::MinValue
    $fresh = $false
    if ($generatedAtRaw -and [datetime]::TryParse([string]$generatedAtRaw, [ref]$generatedAt)) {
        $fresh = [Math]::Abs(($Now - $generatedAt).TotalSeconds) -le $ProjectionFreshnessSeconds
    }

    $binding = @(Get-Array $parsed.bindings | Where-Object {
        [string](Get-PropertyValue $_ @("surface_id", "identity_name")) -eq $Identity
    } | Select-Object -First 1)[0]
    if ($null -eq $binding) {
        return [pscustomobject][ordered]@{ state = "unavailable"; admissible = $false; reason = "identity_not_in_projection"; provenance = $null }
    }

    $activity = Get-PropertyValue $binding @("operator_activity")
    if ($null -eq $activity) {
        return [pscustomobject][ordered]@{ state = "idle"; admissible = $true; reason = "no_activity_renders_as_idle"; provenance = [ordered]@{ generated_at = [string]$generatedAtRaw } }
    }

    $state = [string](Get-PropertyValue $activity @("state"))
    $source = [string](Get-PropertyValue $activity @("source"))
    $factSource = [string](Get-PropertyValue $activity @("activity_fact_source"))
    $ambiguous = if ($activity.PSObject.Properties.Name -contains "ambiguous") { [bool]$activity.ambiguous } else { $true }
    $admissible = $fresh -and -not $ambiguous -and -not [string]::IsNullOrWhiteSpace($source) -and -not [string]::IsNullOrWhiteSpace($factSource)

    [pscustomobject][ordered]@{
        state = if ($state) { $state } else { "idle" }
        task_number = Get-TaskNumber $activity
        admissible = $admissible
        reason = if ($admissible) { "fresh_admitted_operator_surface_activity" } else { "stale_ambiguous_or_unprovenanced_activity" }
        provenance = [ordered]@{
            source = $source
            activity_fact_source = $factSource
            generated_at = [string]$generatedAtRaw
            fresh = $fresh
            ambiguous = $ambiguous
        }
    }
}

function Read-State {
    param([string]$Path)
    $state = Read-JsonFile $Path
    if ($null -eq $state) {
        return [ordered]@{ schema = "narada.operator_surfaces.review_pickup_escalation_state.v0"; items = @() }
    }
    return $state
}

function Find-StateItem {
    param($State, [string]$Fingerprint)
    return @(Get-Array $State.items | Where-Object { [string]$_.fingerprint -eq $Fingerprint } | Select-Object -First 1)[0]
}

function Set-StateItem {
    param([ref]$State, $Item)
    $items = New-Object System.Collections.Generic.List[object]
    $replaced = $false
    foreach ($existing in (Get-Array $State.Value.items)) {
        if ([string]$existing.fingerprint -eq [string]$Item.fingerprint) {
            $items.Add($Item)
            $replaced = $true
        } else {
            $items.Add($existing)
        }
    }
    if (-not $replaced) { $items.Add($Item) }
    $State.Value.items = @($items.ToArray())
}

if (-not (Test-Path -LiteralPath $UserSiteRoot)) { throw "user_site_root_missing: $UserSiteRoot" }
$UserSiteRoot = (Resolve-Path -LiteralPath $UserSiteRoot).Path
$script:ResolvedNaradaCliForReviewPickup = Resolve-NaradaCliForReviewPickup -Root $UserSiteRoot -Explicit $NaradaCli
if ([string]::IsNullOrWhiteSpace($StatePath)) {
    $StatePath = Join-Path $PcSiteRoot "runtime\review-pickup-escalation\state.json"
}
$surfaceFactsPath = Join-Path $UserSiteRoot "operator-surfaces\review-pickup-escalations.json"
$now = if ($NowIso) { [datetime]::Parse($NowIso) } else { Get-Date }

$workboard = Read-Workboard
$obligations = @(Read-Obligations)
$projection = Read-OsaProjection
$activity = Get-ReviewerActivity -Projection $projection -Identity $ReviewerIdentity -Now $now
$state = Read-State $StatePath

$pendingReviews = @(Get-PendingReviews $workboard)
$targets = New-Object System.Collections.Generic.List[object]
foreach ($review in $pendingReviews) {
    $taskNumber = Get-TaskNumber $review
    if ($null -eq $taskNumber) { continue }

    $matchingObligations = @($obligations | Where-Object {
        [string](Get-PropertyValue $_ @("kind")) -eq "review_request" -and
        [string](Get-PropertyValue $_ @("status")) -in @("", "open") -and
        (Get-TaskNumber $_) -eq $taskNumber -and
        (Test-TargetsReviewer $_ $ReviewerIdentity)
    })

    $targetSource = $null
    $obligation = $null
    if ($matchingObligations.Count -gt 0) {
        $obligation = $matchingObligations[0]
        $targetSource = "directed_review_obligation"
    } elseif (Test-TargetsReviewer $review $ReviewerIdentity) {
        $targetSource = "workboard_review_target"
    }

    if (-not $targetSource) { continue }

    $reportId = Get-PropertyValue $obligation @("report_id", "source_report_id")
    if (-not $reportId) { $reportId = Get-PropertyValue $review @("report_id", "source_report_id") }
    $title = Get-PropertyValue $review @("title", "summary")
    $summary = if ($title) { [string]$title } else { "Task $taskNumber review requested" }
    $nextActionArgs = @("task", "review", [string]$taskNumber, "--agent", $ReviewerIdentity, "--verdict", "accepted", "--cwd", $UserSiteRoot)
    if ($reportId) { $nextActionArgs = @("task", "review", [string]$taskNumber, "--agent", $ReviewerIdentity, "--verdict", "accepted", "--report", [string]$reportId, "--cwd", $UserSiteRoot) }
    $nextAction = [ordered]@{
        surface = "configured_windows_narada_cli"
        available = [bool]$script:ResolvedNaradaCliForReviewPickup.available
        command_label = if ($reportId) { "task review $taskNumber --report $reportId" } else { "task review $taskNumber" }
        argv = @($nextActionArgs)
        cli_source = [string]$script:ResolvedNaradaCliForReviewPickup.source
        missing_capability_report = [string]$script:ResolvedNaradaCliForReviewPickup.missing_capability_report
    }

    $signature = "{0}|{1}|{2}|{3}|{4}" -f $taskNumber, $ReviewerIdentity, $reportId, (Get-PropertyValue $review @("status")), $summary
    $fingerprint = Get-StableHash $signature
    $targets.Add([pscustomobject][ordered]@{
        task_number = $taskNumber
        task_id = Get-PropertyValue $review @("task_id", "id")
        title = $title
        summary = $summary
        report_id = if ($reportId) { [string]$reportId } else { $null }
        reviewer_identity = $ReviewerIdentity
        target_source = $targetSource
        obligation_id = Get-PropertyValue $obligation @("obligation_id")
        next_action = $nextAction
        fingerprint = $fingerprint
    })
}

$facts = New-Object System.Collections.Generic.List[object]
$sent = New-Object System.Collections.Generic.List[object]
$suppressed = New-Object System.Collections.Generic.List[object]

foreach ($target in $targets) {
    $record = Find-StateItem -State $state -Fingerprint $target.fingerprint
    if ($null -eq $record) {
        $record = [pscustomobject][ordered]@{
            fingerprint = $target.fingerprint
            first_observed_at = $now.ToString("o")
            sent_at = $null
            sent_count = 0
        }
        if (-not $NoStateWrite) { Set-StateItem ([ref]$state) $record }
    }

    $firstObserved = [datetime]::Parse([string]$record.first_observed_at)
    $ageSeconds = [Math]::Floor(($now - $firstObserved).TotalSeconds)
    $activityBlocks = $activity.admissible -and [string]$activity.state -eq "reviewing" -and $activity.task_number -eq $target.task_number
    $reviewerIdle = $activity.admissible -and [string]$activity.state -eq "idle"

    $fact = [ordered]@{
        kind = "pending_review_pickup_escalation"
        task_number = $target.task_number
        task_id = $target.task_id
        report_id = $target.report_id
        summary = $target.summary
        reviewer_identity = $target.reviewer_identity
        target_source = $target.target_source
        obligation_id = $target.obligation_id
        next_action = $target.next_action
        fingerprint = $target.fingerprint
        first_observed_at = [string]$record.first_observed_at
        age_seconds = $ageSeconds
        delay_seconds = $DelaySeconds
        reviewer_activity = $activity
        due = $false
        suppressed = $false
        delivery_issue_exposed = $false
        reason = $null
    }

    if ($record.sent_at) {
        $fact.suppressed = $true
        $fact.reason = "already_escalated_for_unchanged_review_item"
        $suppressed.Add([pscustomobject]$fact)
    } elseif ($activityBlocks) {
        $fact.reason = "reviewer_active_on_item"
    } elseif (-not $reviewerIdle) {
        $fact.reason = if ($activity.admissible) { "reviewer_not_idle" } else { "reviewer_activity_not_admissible" }
        $fact.delivery_issue_exposed = $true
    } elseif ($ageSeconds -lt $DelaySeconds) {
        $fact.reason = "delay_not_elapsed"
    } else {
        $fact.due = $true
        $reportLabel = if ($target.report_id) { [string]$target.report_id } else { "none" }
        $nextActionLabel = if ($target.next_action.available) {
            "$($target.next_action.command_label) via configured Windows Narada CLI"
        } else {
            $target.next_action.missing_capability_report
        }
        $message = "Review pickup request: task #$($target.task_number). Report: $reportLabel. $($target.summary). Next action: $nextActionLabel"
        if ($EmitOsm) {
            $bus = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Send-OperatorSurfaceMessageBus.ps1"
            if (-not (Test-Path -LiteralPath $bus)) {
                $bus = Join-Path $PSScriptRoot "Send-OperatorSurfaceMessageBus.ps1"
            }
            $args = @{
                UserSiteRoot = $UserSiteRoot
                PcSiteRoot = $PcSiteRoot
                IdentityName = $ReviewerIdentity
                FromIdentity = $FromIdentity
                Text = $message
                MessagePosture = "note"
                DedupeKey = "review-pickup:$($target.fingerprint)"
                PassThru = $true
            }
            if ($BridgeResultFixturePath) { $args.BridgeResultFixturePath = $BridgeResultFixturePath }
            $delivery = (& $bus @args) | ConvertFrom-NaradaJson
            $fact.delivery = $delivery
            $fact.delivery_issue_exposed = [string]$delivery.delivery_state -ne "delivered"
        } else {
            $fact.reason = "due_without_emit_osm"
            $fact.delivery_issue_exposed = $true
        }
        $record.sent_at = $now.ToString("o")
        $record.sent_count = [int]$record.sent_count + 1
        if (-not $NoStateWrite) { Set-StateItem ([ref]$state) $record }
        $sent.Add([pscustomobject]$fact)
    }

    $facts.Add([pscustomobject]$fact)
}

if (-not $NoStateWrite) {
    $state.updated_at = $now.ToString("o")
    Write-JsonFile -Path $StatePath -Value $state
    Write-JsonFile -Path $surfaceFactsPath -Value ([ordered]@{
        schema = "narada.operator_surfaces.review_pickup_escalations.v0"
        generated_at = $now.ToString("o")
        source = "Invoke-ReviewPickupEscalation.ps1"
        facts = @($facts.ToArray())
    })
}

$result = [pscustomobject][ordered]@{
    schema = "narada.operator_surfaces.review_pickup_escalation.v0"
    generated_at = $now.ToString("o")
    reviewer_identity = $ReviewerIdentity
    source_envelope = "env_2274a163-9944-4c6a-bce3-34d0054df8be"
    state_path = $StatePath
    surface_facts_path = $surfaceFactsPath
    narada_cli = [ordered]@{
        available = [bool]$script:ResolvedNaradaCliForReviewPickup.available
        source = [string]$script:ResolvedNaradaCliForReviewPickup.source
        kind = [string]$script:ResolvedNaradaCliForReviewPickup.kind
        missing_capability_report = [string]$script:ResolvedNaradaCliForReviewPickup.missing_capability_report
    }
    targeted_reviews = @($targets.ToArray())
    facts = @($facts.ToArray())
    sent = @($sent.ToArray())
    suppressed = @($suppressed.ToArray())
    delivery_issue_facts = @($facts.ToArray() | Where-Object { $_.delivery_issue_exposed -eq $true })
}

if ($PassThru) { $result | ConvertTo-Json -Depth 80 } else { $result }
