param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$NaradaCli = $(if ($env:NARADA_CLI) { $env:NARADA_CLI } else { "" }),
    [string]$ArchitectIdentity = "narada-andrey.Kevin",
    [string]$WorkboardFixturePath,
    [string]$OsaFixturePath,
    [int]$ProjectionFreshnessSeconds = 600,
    [int]$SkipTaskNumber = -1,
    [string]$SkipReason,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([string]$Json)

    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Json | ConvertFrom-Json -Depth 100
    }
    return $Json | ConvertFrom-Json
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
        if ($Object.PSObject.Properties.Name -contains $name) {
            return $Object.$name
        }
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

function Read-Workboard {
    if ($WorkboardFixturePath) {
        return ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($WorkboardFixturePath))
    }

    $output = & node $NaradaCli task workboard --format json --limit 30 --cwd $UserSiteRoot
    if ($LASTEXITCODE -ne 0) {
        throw "architect_work_selection_workboard_failed: node $NaradaCli task workboard exited $LASTEXITCODE"
    }
    return ConvertFrom-NaradaJson ($output -join [Environment]::NewLine)
}

function Read-OsaProjection {
    $path = if ($OsaFixturePath) { $OsaFixturePath } else { Join-Path $UserSiteRoot "operator-surfaces\window-labels.json" }
    if (-not (Test-Path -LiteralPath $path)) {
        return [pscustomobject][ordered]@{
            path = $path
            parsed = $null
            available = $false
            reason = "projection_file_missing"
        }
    }

    return [pscustomobject][ordered]@{
        path = $path
        parsed = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($path))
        available = $true
        reason = $null
    }
}

function Read-ReviewPickupEscalations {
    $path = Join-Path $UserSiteRoot "operator-surfaces\review-pickup-escalations.json"
    if (-not (Test-Path -LiteralPath $path)) {
        return [pscustomobject][ordered]@{
            path = $path
            facts = @()
            available = $false
            reason = "review_pickup_escalations_file_missing"
        }
    }
    $parsed = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($path))
    return [pscustomobject][ordered]@{
        path = $path
        facts = @(Get-Array $parsed.facts)
        available = $true
        reason = $null
    }
}

function Get-WorkboardFacts {
    param($Workboard)

    if ($Workboard.PSObject.Properties.Name -contains "tasks") {
        $tasks = Get-Array $Workboard.tasks
        $pendingReviews = @($tasks | Where-Object { [string]$_.status -eq "in_review" })
        $inProgress = @($tasks | Where-Object { [string]$_.status -in @("claimed", "in_progress", "needs_continuation") })
        $localFollowups = @($tasks | Where-Object { [string]$_.status -eq "opened" })
        $sourceEnvelopes = @()
    } else {
        $pendingReviews = Get-Array $Workboard.pending_reviews
        $inProgress = Get-Array $Workboard.in_progress
        $localFollowups = Get-Array $Workboard.local_followups
        $sourceEnvelopes = Get-Array $Workboard.source_envelopes
    }

    [pscustomobject][ordered]@{
        pending_reviews = @($pendingReviews)
        in_progress = @($inProgress)
        local_followups = @($localFollowups)
        source_envelopes = @($sourceEnvelopes)
    }
}

function Test-DirectReviewRequest {
    param($Review, [string]$Identity)

    $names = @(
        "intended_reviewer",
        "requested_reviewer",
        "reviewer",
        "reviewer_identity",
        "target_identity",
        "target_operator_surface",
        "to_identity",
        "to"
    )
    foreach ($name in $names) {
        $value = Get-PropertyValue $Review @($name)
        foreach ($entry in (Get-Array $value)) {
            if ([string]$entry -eq $Identity) { return $true }
            if ($entry -and $entry.PSObject.Properties.Name -contains "identity_name" -and [string]$entry.identity_name -eq $Identity) { return $true }
        }
    }
    return $false
}

function Convert-ReviewFact {
    param($Review, [string]$Kind)

    [pscustomobject][ordered]@{
        kind = $Kind
        task_number = Get-TaskNumber $Review
        task_id = Get-PropertyValue $Review @("task_id", "id")
        title = Get-PropertyValue $Review @("title", "summary")
        status = Get-PropertyValue $Review @("status")
        authoritative_source = "task_workboard"
    }
}

function Read-TaskAuthority {
    param([int]$TaskNumber)

    $output = & node $NaradaCli task read $TaskNumber --format json --cwd $UserSiteRoot
    if ($LASTEXITCODE -ne 0) {
        throw "architect_work_selection_task_read_failed: task $TaskNumber exited $LASTEXITCODE"
    }
    $parsed = ConvertFrom-NaradaJson ($output -join [Environment]::NewLine)
    return $parsed.task
}

function Get-DependencyNumbers {
    param($Task)

    $value = Get-PropertyValue $Task @("dependencies", "depends_on", "dependsOn")
    $numbers = New-Object System.Collections.Generic.List[int]
    foreach ($entry in (Get-Array $value)) {
        $parsed = 0
        if ([int]::TryParse([string]$entry, [ref]$parsed)) {
            $numbers.Add($parsed)
        }
    }
    return $numbers.ToArray()
}

function Get-DependencyStatusFromFixture {
    param($Task, [int]$DependencyNumber)

    $statuses = Get-PropertyValue $Task @("dependency_statuses", "dependencyStatuses")
    if ($null -eq $statuses) { return $null }
    $key = [string]$DependencyNumber
    if ($statuses -is [hashtable] -and $statuses.ContainsKey($key)) { return [string]$statuses[$key] }
    if ($statuses.PSObject.Properties.Name -contains $key) { return [string]$statuses.$key }
    return $null
}

function Get-TaskDependencyGate {
    param($Task)

    $taskNumber = Get-TaskNumber $Task
    $taskAuthority = $Task
    $dependencies = Get-DependencyNumbers $taskAuthority
    $source = "workboard_task"

    if ($dependencies.Count -eq 0 -and $taskNumber -and -not $WorkboardFixturePath) {
        $taskAuthority = Read-TaskAuthority $taskNumber
        $dependencies = Get-DependencyNumbers $taskAuthority
        $source = "task_read"
    }

    $unmet = New-Object System.Collections.Generic.List[object]
    foreach ($dependency in $dependencies) {
        $status = Get-DependencyStatusFromFixture $taskAuthority $dependency
        $statusSource = "task_fixture"
        if ([string]::IsNullOrWhiteSpace($status)) {
            if ($WorkboardFixturePath) {
                $status = "unknown"
                $statusSource = "fixture_missing_dependency_status"
            } else {
                $depTask = Read-TaskAuthority $dependency
                $status = [string]$depTask.status
                $statusSource = "task_read"
            }
        }

        if ($status -ne "closed") {
            $unmet.Add([pscustomobject][ordered]@{
                task_number = $dependency
                status = $status
                source = $statusSource
            })
        }
    }

    [pscustomobject][ordered]@{
        task_number = $taskNumber
        dependencies = $dependencies
        blocked = $unmet.Count -gt 0
        unmet_dependencies = $unmet.ToArray()
        source = $source
    }
}

function Get-OsaSignals {
    param($Projection, [datetime]$Now)

    $accepted = New-Object System.Collections.Generic.List[object]
    $rejected = New-Object System.Collections.Generic.List[object]

    if (-not $Projection.available) {
        $rejected.Add([pscustomobject][ordered]@{ reason = $Projection.reason; path = $Projection.path })
        return [pscustomobject][ordered]@{ accepted = $accepted.ToArray(); rejected = $rejected.ToArray() }
    }

    $parsed = $Projection.parsed
    $generatedAtRaw = Get-PropertyValue $parsed @("generated_at", "updated_at")
    $generatedAt = [datetime]::MinValue
    $fresh = $false
    if ($generatedAtRaw -and [datetime]::TryParse([string]$generatedAtRaw, [ref]$generatedAt)) {
        $age = [Math]::Abs(($Now - $generatedAt).TotalSeconds)
        $fresh = $age -le $ProjectionFreshnessSeconds
    }

    foreach ($binding in (Get-Array $parsed.bindings)) {
        $identity = Get-PropertyValue $binding @("surface_id", "identity_name")
        $activity = Get-PropertyValue $binding @("operator_activity")
        if ($null -eq $activity) { continue }

        $state = [string](Get-PropertyValue $activity @("state"))
        $taskNumber = Get-TaskNumber $activity
        $hasAmbiguityPosture = $activity.PSObject.Properties.Name -contains "ambiguous"
        $ambiguous = if ($hasAmbiguityPosture) { [bool]$activity.ambiguous } else { $true }
        $source = [string](Get-PropertyValue $activity @("source"))
        $factSource = [string](Get-PropertyValue $activity @("activity_fact_source"))

        $record = [pscustomobject][ordered]@{
            identity_name = $identity
            state = $state
            task_number = $taskNumber
            title = Get-PropertyValue $activity @("title")
            status = Get-PropertyValue $activity @("status")
            source = $source
            activity_fact_source = $factSource
            generated_at = if ($generatedAtRaw) { [string]$generatedAtRaw } else { $null }
            fresh = $fresh
            ambiguous = $ambiguous
        }

        if ($state -notin @("awaiting_review", "reviewing")) { continue }
        if (-not $taskNumber) {
            $rejected.Add([pscustomobject][ordered]@{ reason = "missing_task_number"; signal = $record })
            continue
        }
        if (-not $fresh) {
            $rejected.Add([pscustomobject][ordered]@{ reason = "stale_or_missing_generated_at"; signal = $record })
            continue
        }
        if ([string]::IsNullOrWhiteSpace($source) -or [string]::IsNullOrWhiteSpace($factSource)) {
            $rejected.Add([pscustomobject][ordered]@{ reason = "missing_provenance"; signal = $record })
            continue
        }
        if ($ambiguous) {
            $rejected.Add([pscustomobject][ordered]@{ reason = "ambiguous_projection"; signal = $record })
            continue
        }

        $accepted.Add($record)
    }

    [pscustomobject][ordered]@{ accepted = $accepted.ToArray(); rejected = $rejected.ToArray() }
}

$now = Get-Date
$workboard = Read-Workboard
$projection = Read-OsaProjection
$reviewPickupEscalations = Read-ReviewPickupEscalations
$facts = Get-WorkboardFacts $workboard
$pendingReviews = @($facts.pending_reviews | ForEach-Object { Convert-ReviewFact $_ "pending_review" } | Where-Object { $null -ne $_.task_number })
$directReviews = @($facts.pending_reviews | Where-Object { Test-DirectReviewRequest $_ $ArchitectIdentity } | ForEach-Object { Convert-ReviewFact $_ "direct_review_request" } | Where-Object { $null -ne $_.task_number })
$osaSignals = Get-OsaSignals $projection $now
$runnableFollowups = New-Object System.Collections.Generic.List[object]
$blockedFollowups = New-Object System.Collections.Generic.List[object]
foreach ($followup in (Get-Array $facts.local_followups)) {
    $gate = Get-TaskDependencyGate $followup
    if ($gate.blocked) {
        $blockedFollowups.Add([pscustomobject][ordered]@{
            task_number = $gate.task_number
            title = Get-PropertyValue $followup @("title")
            status = Get-PropertyValue $followup @("status")
            dependency_gate = $gate
        })
    } else {
        $runnableFollowups.Add($followup)
    }
}

$pendingByTask = @{}
foreach ($review in $pendingReviews) {
    if (-not $pendingByTask.ContainsKey($review.task_number)) {
        $pendingByTask[$review.task_number] = $review
    }
}

$activeBlockers = New-Object System.Collections.Generic.List[object]
$rejectedSignals = New-Object System.Collections.Generic.List[object]
foreach ($signal in $osaSignals.accepted) {
    if ([string]$signal.identity_name -eq $ArchitectIdentity) { continue }
    if ($pendingByTask.ContainsKey($signal.task_number)) {
        $review = $pendingByTask[$signal.task_number]
        $activeBlockers.Add([pscustomobject][ordered]@{
            kind = "active_collaborator_review_blocker"
            task_number = $signal.task_number
            task_id = $review.task_id
            title = if ($review.title) { $review.title } else { $signal.title }
            status = $review.status
            collaborator_identity = $signal.identity_name
            authoritative_source = "task_workboard"
            projection_source = "operator_surface_activity"
            projection_provenance = [ordered]@{
                source = $signal.source
                activity_fact_source = $signal.activity_fact_source
                generated_at = $signal.generated_at
                fresh = $signal.fresh
                ambiguous = $signal.ambiguous
            }
        })
    } else {
        $rejectedSignals.Add([pscustomobject][ordered]@{
            reason = "no_authoritative_pending_review_fact"
            signal = $signal
        })
    }
}
foreach ($rejected in $osaSignals.rejected) { $rejectedSignals.Add($rejected) }

$recommendation = $null
if ($directReviews.Count -gt 0) {
    $selected = @($directReviews | Sort-Object task_number | Select-Object -First 1)[0]
    $recommendation = [pscustomobject][ordered]@{
        action = "review_task"
        priority = 1
        selection_rule = "direct_review_request_addressed_to_architect"
        task_number = $selected.task_number
        title = $selected.title
        authoritative_facts = @($selected)
    }
} elseif ($activeBlockers.Count -gt 0) {
    $selected = @($activeBlockers | Sort-Object task_number | Select-Object -First 1)[0]
    $recommendation = [pscustomobject][ordered]@{
        action = "review_task"
        priority = 2
        selection_rule = "active_collaborator_blocked_on_review"
        task_number = $selected.task_number
        title = $selected.title
        authoritative_facts = @($pendingByTask[$selected.task_number])
        projection_facts = @($selected)
    }
} elseif ($pendingReviews.Count -gt 0) {
    $selected = @($pendingReviews | Select-Object -First 1)[0]
    $recommendation = [pscustomobject][ordered]@{
        action = "review_task"
        priority = 3
        selection_rule = "ordinary_pending_review"
        task_number = $selected.task_number
        title = $selected.title
        authoritative_facts = @($selected)
    }
} elseif ($runnableFollowups.Count -gt 0) {
    $selected = @($runnableFollowups.ToArray() | Select-Object -First 1)[0]
    $recommendation = [pscustomobject][ordered]@{
        action = "inspect_followup"
        priority = 4
        selection_rule = "local_followup"
        task_number = Get-TaskNumber $selected
        title = Get-PropertyValue $selected @("title")
        authoritative_facts = @($selected)
    }
} else {
    $recommendation = [pscustomobject][ordered]@{
        action = "no_action"
        priority = 99
        selection_rule = "no_current_architect_work"
        task_number = $null
        title = $null
        authoritative_facts = @()
    }
}

$skip = $null
if ($SkipTaskNumber -ge 0 -and $recommendation.task_number -and $SkipTaskNumber -ne [int]$recommendation.task_number) {
    if ($recommendation.priority -le 2 -and [string]::IsNullOrWhiteSpace($SkipReason)) {
        throw "explicit_skip_reason_required: recommended task $($recommendation.task_number) by $($recommendation.selection_rule); attempted task $SkipTaskNumber"
    }
    $skip = [pscustomobject][ordered]@{
        attempted_task_number = $SkipTaskNumber
        skipped_recommended_task_number = $recommendation.task_number
        skipped_selection_rule = $recommendation.selection_rule
        reason = $SkipReason
        recorded_at = $now.ToString("o")
    }
}

$result = [pscustomobject][ordered]@{
    schema = "narada.operator_surfaces.architect_work_selection.v0"
    generated_at = $now.ToString("o")
    architect_identity = $ArchitectIdentity
    recommendation = $recommendation
    skip = $skip
    facts = [ordered]@{
        direct_review_requests = @($directReviews)
        active_collaborator_review_blockers = $activeBlockers.ToArray()
        pending_reviews = @($pendingReviews)
        runnable_local_followups = $runnableFollowups.ToArray()
        blocked_local_followups = $blockedFollowups.ToArray()
        local_followups = @($facts.local_followups)
        review_pickup_escalations = @($reviewPickupEscalations.facts)
    }
    projection = [ordered]@{
        source_path = $projection.path
        freshness_seconds = $ProjectionFreshnessSeconds
        accepted_signals = @($osaSignals.accepted)
        rejected_signals = $rejectedSignals.ToArray()
        review_pickup_escalations_path = $reviewPickupEscalations.path
    }
}

if ($PassThru) {
    return $result
}

$result | ConvertTo-Json -Depth 20
