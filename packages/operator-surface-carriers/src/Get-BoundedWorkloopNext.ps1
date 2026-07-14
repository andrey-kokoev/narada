param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$NaradaCli,
    [string]$Agent = "andrey-user.Bob",
    [int]$Limit = 8,
    [int]$MaxHumanLines = 18,
    [int]$MaxHumanBytes = 2400,
    [int]$IntendedTaskNumber = -1,
    [ValidateSet("none", "review", "commit", "inbox", "task_lifecycle")]
    [string]$BeforeMutation = "none",
    [string[]]$MutationPath = @(),
    [string]$WorkboardFixturePath,
    [string]$GitStatusFixturePath,
    [string]$ObligationsPath,
    [switch]$PassThru
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
    if ($command.Parameters.ContainsKey("Depth")) { return $Value | ConvertTo-Json -Depth 100 -Compress }
    return $Value | ConvertTo-Json -Compress
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

function Read-NaradaSiteConfig {
    param([string]$Root)

    $path = Join-Path $Root "config.json"
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    return ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($path))
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

    $scriptPath = Join-Path $UserSiteRoot "tools\task-lifecycle\generate-workboard.mjs"
    if (Test-Path -LiteralPath $scriptPath) {
        try {
            $output = & node $scriptPath $UserSiteRoot $Limit $Agent 2>&1
            if ($LASTEXITCODE -eq 0) {
                return ConvertFrom-NaradaJson ($output -join [Environment]::NewLine)
            }
        } catch {
            # Fall through to diagnostic
        }
    }

    $workboardPath = Join-Path $UserSiteRoot "state\workboard.json"
    if (Test-Path -LiteralPath $workboardPath) {
        return ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($workboardPath))
    }

    return [pscustomobject][ordered]@{
        pending_reviews = @()
        in_progress = @()
        local_followups = @()
        diagnostics = @([ordered]@{ kind = "workboard_not_available"; reason = "Local task-lifecycle library not available and no workboard state found." })
    }
}

function Read-DirectedObligationView {
    param($Workboard)

    $script = Join-Path $PSScriptRoot "Get-DirectedObligations.ps1"
    if (-not (Test-Path -LiteralPath $script)) {
        return [pscustomobject][ordered]@{
            available = $false
            due_obligations = @()
            diagnostics = @([ordered]@{ kind = "directed_obligation_reader_missing"; path = $script })
        }
    }

    $args = @{
        UserSiteRoot = $UserSiteRoot
        IdentityName = $Agent
        PassThru = $true
    }
    if ($ObligationsPath) { $args.ObligationsPath = $ObligationsPath }
    if ($WorkboardFixturePath) { $args.WorkboardFixturePath = $WorkboardFixturePath }
    if ($Workboard -and -not $WorkboardFixturePath) { $args.WorkboardJson = ConvertTo-NaradaJson $Workboard }

    try {
        $view = & $script @args
        return ConvertFrom-NaradaJson ($view -join [Environment]::NewLine)
    } catch {
        return [pscustomobject][ordered]@{
            available = $false
            due_obligations = @()
            diagnostics = @([ordered]@{ kind = "directed_obligation_read_failed"; message = $_.Exception.Message })
        }
    }
}

function Convert-DirectedObligationFact {
    param($Obligation)

    if ($null -eq $Obligation) { return $null }
    $payload = Get-PropertyValue $Obligation @("payload")
    $title = [string](Get-PropertyValue $payload @("summary", "title"))
    if ([string]::IsNullOrWhiteSpace($title)) { $title = [string]$Obligation.kind }

    [pscustomobject][ordered]@{
        obligation_id = [string]$Obligation.obligation_id
        kind = [string]$Obligation.kind
        task_number = Get-TaskNumber $Obligation
        title = $title
        source = "directed_obligations"
        target = $Obligation.target
        dedupe_key = [string]$Obligation.dedupe_key
        authority = $Obligation.authority
    }
}

function Get-WorkboardFacts {
    param($Workboard)

    if ($Workboard.PSObject.Properties.Name -contains "tasks") {
        $tasks = Get-Array $Workboard.tasks
        return [pscustomobject][ordered]@{
            pending_reviews = @($tasks | Where-Object { [string]$_.status -eq "in_review" })
            in_progress = @($tasks | Where-Object { [string]$_.status -in @("claimed", "in_progress", "needs_continuation") })
            local_followups = @($tasks | Where-Object { [string]$_.status -eq "opened" })
            source_envelopes = @()
        }
    }

    [pscustomobject][ordered]@{
        pending_reviews = Get-Array $Workboard.pending_reviews
        in_progress = Get-Array $Workboard.in_progress
        local_followups = Get-Array $Workboard.local_followups
        source_envelopes = Get-Array $Workboard.source_envelopes
    }
}

function Convert-TaskFact {
    param($Task)

    if ($null -eq $Task) { return $null }
    [pscustomobject][ordered]@{
        task_number = Get-TaskNumber $Task
        title = [string](Get-PropertyValue $Task @("title", "summary"))
        status = [string](Get-PropertyValue $Task @("status"))
        chapter = [string](Get-PropertyValue $Task @("chapter"))
        assigned_agent = [string](Get-PropertyValue $Task @("assigned_agent", "agent_id", "assignee"))
        target_role = [string](Get-PropertyValue $Task @("target_role"))
        preferred_agent_id = [string](Get-PropertyValue $Task @("preferred_agent_id"))
    }
}

function Read-GitStatusLines {
    if ($GitStatusFixturePath) {
        return [System.IO.File]::ReadAllLines($GitStatusFixturePath)
    }

    $output = & git -C $UserSiteRoot status --porcelain=v1
    if ($LASTEXITCODE -ne 0) { throw "bounded_workloop_git_status_failed: git status exited $LASTEXITCODE" }
    return @($output)
}

function Convert-GitStatusLine {
    param([string]$Line)
    if ([string]::IsNullOrWhiteSpace($Line) -or $Line.Length -lt 4) { return $null }

    $status = $Line.Substring(0, 2)
    $pathText = $Line.Substring(3).Trim()
    if ($pathText -match " -> ") {
        $parts = $pathText -split " -> ", 2
        $pathText = $parts[1]
    }

    [pscustomobject][ordered]@{
        status = $status
        path = $pathText.Replace("\", "/")
    }
}

function Find-TaskFile {
    param([int]$TaskNumber)
    $patterns = @(
        (Join-Path $UserSiteRoot (".ai\do-not-open\tasks\*-{0}-*.md" -f $TaskNumber)),
        (Join-Path $UserSiteRoot (".ai\tasks\*-{0}-*.md" -f $TaskNumber))
    )
    foreach ($pattern in $patterns) {
        $match = @(Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($match.Count -gt 0) { return $match[0].FullName }
    }
    return $null
}

function Get-TaskNumberFromPath {
    param([string]$Path)
    if ($Path -match "^\.ai/(do-not-open/)?tasks/\d{8}-(\d+)-") {
        return [int]$Matches[2]
    }
    return $null
}

function Test-TaskMentionsPath {
    param([string]$TaskPath, [string]$DirtyPath)
    if (-not $TaskPath -or -not (Test-Path -LiteralPath $TaskPath)) { return $false }
    $text = [System.IO.File]::ReadAllText($TaskPath)
    $normalized = $DirtyPath.Replace("\", "/")
    $basename = [System.IO.Path]::GetFileName($normalized)
    if ($text -like "*$normalized*") { return $true }
    if ($basename.Length -ge 12 -and $text -like "*$basename*") { return $true }
    return $false
}

function Get-DirtyFileFacts {
    param($ActiveTasks)

    $taskByNumber = @{}
    foreach ($task in $ActiveTasks) {
        $number = Get-TaskNumber $task
        if ($number) { $taskByNumber[[int]$number] = $task }
    }

    $facts = New-Object System.Collections.Generic.List[object]
    foreach ($line in (Read-GitStatusLines)) {
        $entry = Convert-GitStatusLine $line
        if ($null -eq $entry) { continue }

        $likelyTasks = New-Object System.Collections.Generic.List[object]
        $pathTask = Get-TaskNumberFromPath $entry.path
        if ($pathTask) {
            $task = $taskByNumber[[int]$pathTask]
            $likelyTasks.Add([pscustomobject][ordered]@{
                task_number = [int]$pathTask
                owner = if ($task) { [string](Get-PropertyValue $task @("assigned_agent", "agent_id", "assignee")) } else { $null }
                reason = "task_file_path"
            })
        }

        foreach ($taskNumber in $taskByNumber.Keys) {
            if ($pathTask -and [int]$pathTask -eq [int]$taskNumber) { continue }
            $taskPath = Find-TaskFile ([int]$taskNumber)
            if (Test-TaskMentionsPath -TaskPath $taskPath -DirtyPath $entry.path) {
                $task = $taskByNumber[[int]$taskNumber]
                $likelyTasks.Add([pscustomobject][ordered]@{
                    task_number = [int]$taskNumber
                    owner = [string](Get-PropertyValue $task @("assigned_agent", "agent_id", "assignee"))
                    reason = "task_mentions_path"
                })
            }
        }

        $facts.Add([pscustomobject][ordered]@{
            path = $entry.path
            git_status = $entry.status
            likely_tasks = @($likelyTasks.ToArray() | Select-Object -First 4)
            ownership_posture = if ($likelyTasks.Count -gt 0) { "likely_owned" } else { "unknown" }
        })
    }

    return $facts.ToArray()
}

function Get-MutationPreflight {
    param($DirtyFiles)

    $warnings = New-Object System.Collections.Generic.List[string]
    $blocking = New-Object System.Collections.Generic.List[object]
    $unknown = @($DirtyFiles | Where-Object { $_.ownership_posture -eq "unknown" })
    $normalizedMutationPaths = @($MutationPath | ForEach-Object { ([string]$_).Replace("\", "/").Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    if ($BeforeMutation -eq "none") {
        return [pscustomobject][ordered]@{
            before_mutation = "none"
            intended_task_number = if ($IntendedTaskNumber -gt 0) { $IntendedTaskNumber } else { $null }
            mutation_paths = @($normalizedMutationPaths)
            posture = "observe_only"
            blocking_dirty_files = @()
            warnings = @()
        }
    }

    if ($IntendedTaskNumber -le 0) {
        $warnings.Add("intended_task_number_missing_for_$BeforeMutation")
    }

    foreach ($file in $DirtyFiles) {
        $tasks = @(Get-Array $file.likely_tasks)
        if ($tasks.Count -eq 0) { continue }
        $matchesIntended = $false
        foreach ($task in $tasks) {
            if ($IntendedTaskNumber -gt 0 -and [int]$task.task_number -eq $IntendedTaskNumber) {
                $matchesIntended = $true
            }
        }
        if (-not $matchesIntended) {
            $includedInMutation = $normalizedMutationPaths.Count -eq 0 -or @($normalizedMutationPaths | Where-Object { $file.path -eq $_ -or $file.path.StartsWith($_.TrimEnd("/") + "/") }).Count -gt 0
            if ($includedInMutation) {
                $blocking.Add([pscustomobject][ordered]@{
                    path = $file.path
                    git_status = $file.git_status
                    likely_tasks = $tasks
                })
            }
        }
    }

    if ($unknown.Count -gt 0) {
        $warnings.Add(("unknown_dirty_ownership_count={0}" -f $unknown.Count))
    }
    if ($normalizedMutationPaths.Count -gt 0) {
        $excludedDirty = @($DirtyFiles | Where-Object {
            $path = $_.path
            @($normalizedMutationPaths | Where-Object { $path -eq $_ -or $path.StartsWith($_.TrimEnd("/") + "/") }).Count -eq 0
        })
        if ($excludedDirty.Count -gt 0) {
            $warnings.Add(("dirty_files_excluded_from_mutation_count={0}" -f $excludedDirty.Count))
        }
    }

    $posture = if ($blocking.Count -gt 0 -or $IntendedTaskNumber -le 0) {
        "refuse"
    } elseif ($warnings.Count -gt 0) {
        "warn"
    } else {
        "safe"
    }

    [pscustomobject][ordered]@{
        before_mutation = $BeforeMutation
        intended_task_number = if ($IntendedTaskNumber -gt 0) { $IntendedTaskNumber } else { $null }
        mutation_paths = @($normalizedMutationPaths)
        posture = $posture
        blocking_dirty_files = $blocking.ToArray()
        warnings = $warnings.ToArray()
    }
}

function New-HumanSummary {
    param($Facts, $Preflight, [string[]]$Warnings)

    $lines = New-Object System.Collections.Generic.List[string]
    $next = $Facts.next_action
    $lines.Add(("Next: {0}{1}" -f $next.action, $(if ($next.task_number) { " task #$($next.task_number)" } else { "" })))
    if ($next.title) { $lines.Add(("Title: {0}" -f $next.title)) }
    $lines.Add(("Workboard: {0} reviews, {1} in progress, {2} followups" -f $Facts.counts.pending_reviews, $Facts.counts.in_progress, $Facts.counts.local_followups))
    $lines.Add(("Dirty: {0} files; mutation preflight: {1}" -f $Facts.counts.dirty_files, $Preflight.posture))
    foreach ($warning in $Warnings) { $lines.Add(("Warning: {0}" -f $warning)) }
    foreach ($file in @($Facts.dirty_files | Select-Object -First 5)) {
        $owners = @($file.likely_tasks | ForEach-Object { "#{0}:{1}" -f $_.task_number, $_.reason })
        $lines.Add(("Dirty {0} {1} {2}" -f $file.git_status.Trim(), $file.path, $(if ($owners.Count -gt 0) { "[" + ($owners -join ",") + "]" } else { "[unknown]" })))
    }

    $out = New-Object System.Collections.Generic.List[string]
    $byteCount = 0
    foreach ($line in $lines) {
        if ($out.Count -ge $MaxHumanLines) { break }
        $candidateBytes = [System.Text.Encoding]::UTF8.GetByteCount((($out.ToArray() + $line) -join [Environment]::NewLine))
        if ($candidateBytes -gt $MaxHumanBytes) { break }
        $out.Add($line)
        $byteCount = $candidateBytes
    }
    return [pscustomobject][ordered]@{
        lines = $out.ToArray()
        actual_lines = $out.Count
        actual_bytes = $byteCount
        capped = $out.Count -lt $lines.Count
    }
}

if (-not (Test-Path -LiteralPath $UserSiteRoot)) { throw "user_site_root_missing: $UserSiteRoot" }
$UserSiteRoot = (Resolve-Path -LiteralPath $UserSiteRoot).Path
$workboard = Read-Workboard
$directedObligationView = Read-DirectedObligationView -Workboard $workboard
$dueDirectedObligations = @(Get-Array $directedObligationView.due_obligations)
$nextDirectedObligation = if ($dueDirectedObligations.Count -gt 0) { Convert-DirectedObligationFact $dueDirectedObligations[0] } else { $null }
$workboardFacts = Get-WorkboardFacts $workboard
$pendingReviews = @($workboardFacts.pending_reviews | ForEach-Object { Convert-TaskFact $_ } | Where-Object { $null -ne $_.task_number } | Sort-Object { if ($_.preferred_agent_id -eq $Agent) { 0 } else { 1 } } | Select-Object -First $Limit)
$inProgress = @($workboardFacts.in_progress | ForEach-Object { Convert-TaskFact $_ } | Where-Object { $null -ne $_.task_number } | Sort-Object { if ($_.preferred_agent_id -eq $Agent) { 0 } else { 1 } } | Select-Object -First $Limit)
$localFollowups = @($workboardFacts.local_followups | ForEach-Object { Convert-TaskFact $_ } | Where-Object { $null -ne $_.task_number } | Sort-Object { if ($_.preferred_agent_id -eq $Agent) { 0 } else { 1 } } | Select-Object -First $Limit)
$activeRawTasks = @()
$activeRawTasks += @(Get-Array $workboardFacts.pending_reviews)
$activeRawTasks += @(Get-Array $workboardFacts.in_progress)
$activeRawTasks += @(Get-Array $workboardFacts.local_followups)

$mine = @($inProgress | Where-Object { $_.assigned_agent -eq $Agent -or $_.task_number -eq $IntendedTaskNumber } | Select-Object -First 1)
$nextAction = if ($nextDirectedObligation) {
    [pscustomobject][ordered]@{ action = "directed_obligation"; task_number = $nextDirectedObligation.task_number; title = $nextDirectedObligation.title; source = "directed_obligations"; obligation_id = $nextDirectedObligation.obligation_id; kind = $nextDirectedObligation.kind }
} elseif ($mine.Count -gt 0) {
    $selected = $mine[0]
    [pscustomobject][ordered]@{ action = "continue"; task_number = $selected.task_number; title = $selected.title; source = "in_progress" }
} elseif ($pendingReviews.Count -gt 0) {
    [pscustomobject][ordered]@{ action = "review"; task_number = $pendingReviews[0].task_number; title = $pendingReviews[0].title; source = "pending_review" }
} elseif ($inProgress.Count -gt 0) {
    $selected = $inProgress[0]
    [pscustomobject][ordered]@{ action = "inspect_in_progress"; task_number = $selected.task_number; title = $selected.title; source = "in_progress" }
} elseif ($localFollowups.Count -gt 0) {
    [pscustomobject][ordered]@{ action = "inspect"; task_number = $localFollowups[0].task_number; title = $localFollowups[0].title; source = "local_followup" }
} else {
    [pscustomobject][ordered]@{ action = "idle"; task_number = $null; title = $null; source = "workboard_empty" }
}

$dirtyFiles = @(Get-DirtyFileFacts -ActiveTasks $activeRawTasks | Select-Object -First $Limit)
$preflight = Get-MutationPreflight -DirtyFiles $dirtyFiles
$warnings = New-Object System.Collections.Generic.List[string]
foreach ($warning in @($preflight.warnings)) { $warnings.Add($warning) }
if ($preflight.posture -eq "refuse") { $warnings.Add("dirty_ownership_blocks_$BeforeMutation") }

$facts = [pscustomobject][ordered]@{
    next_action = $nextAction
    counts = [ordered]@{
        pending_reviews = $pendingReviews.Count
        in_progress = $inProgress.Count
        local_followups = $localFollowups.Count
        directed_obligations = $dueDirectedObligations.Count
        dirty_files = $dirtyFiles.Count
    }
    directed_obligations = @($dueDirectedObligations | ForEach-Object { Convert-DirectedObligationFact $_ } | Select-Object -First 3)
    pending_reviews = @($pendingReviews | Select-Object -First 3)
    in_progress = @($inProgress | Select-Object -First 3)
    local_followups = @($localFollowups | Select-Object -First 3)
    dirty_files = @($dirtyFiles)
}
$summary = New-HumanSummary -Facts $facts -Preflight $preflight -Warnings $warnings.ToArray()

$result = [pscustomobject][ordered]@{
    schema = "narada.operator_surfaces.bounded_workloop_next.v0"
    generated_at = (Get-Date -Format "o")
    agent = $Agent
    status = if ($preflight.posture -eq "refuse") { "blocked" } elseif ($warnings.Count -gt 0) { "warning" } else { "ok" }
    output_budget = [ordered]@{
        max_human_lines = $MaxHumanLines
        max_human_bytes = $MaxHumanBytes
        actual_human_lines = $summary.actual_lines
        actual_human_bytes = $summary.actual_bytes
        capped = $summary.capped
    }
    facts = $facts
    warnings = $warnings.ToArray()
    diagnostics = [ordered]@{
        workboard_source = if ($WorkboardFixturePath) { "fixture" } elseif (Test-Path -LiteralPath (Join-Path $UserSiteRoot "tools\task-lifecycle\generate-workboard.mjs")) { "task_lifecycle_lib" } elseif (Test-Path -LiteralPath (Join-Path $UserSiteRoot "state\workboard.json")) { "local_state" } else { "unavailable" }
        git_status_source = if ($GitStatusFixturePath) { "fixture" } else { "git_status" }
        directed_obligation_source = if ($directedObligationView.source_path) { [string]$directedObligationView.source_path } else { "unavailable" }
        limit = $Limit
        machine_output_shape = "facts_warnings_diagnostics_separated"
    }
    mutation_preflight = $preflight
    human_summary = $summary.lines
}

if ($PassThru) {
    return $result
}

$summary.lines
