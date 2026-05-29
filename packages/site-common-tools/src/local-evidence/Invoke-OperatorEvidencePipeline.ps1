param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("workboard", "overlay-inspect")]
    [string]$Source,

    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$NaradaCli = $(if ($env:NARADA_CLI) { $env:NARADA_CLI } else { "" }),
    [string]$NaradaCliRepairCommand = $(if ($env:NARADA_PROPER_ROOT) { "pnpm --dir `"$env:NARADA_PROPER_ROOT`" --filter @narada2/cli build" } else { "set NARADA_CLI or NARADA_PROPER_ROOT" }),
    [string]$ArtifactRoot,
    [string]$RawFixturePath,
    [string]$RunId,
    [int]$Limit = 20
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

function Write-NaradaJsonFile {
    param([string]$Path, [object]$Value, [int]$Depth = 20)

    $json = $Value | ConvertTo-Json -Depth $Depth
    [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine)
}

function New-ArtifactPaths {
    param([string]$Root, [string]$SourceName, [string]$GivenRunId)

    $id = if ($GivenRunId) { $GivenRunId } else { (Get-Date -Format "yyyyMMdd_HHmmss_fff") + "_" + ([Guid]::NewGuid().ToString("N").Substring(0, 8)) }
    $dir = Join-Path (Join-Path $Root $SourceName) $id
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    [pscustomobject][ordered]@{
        run_id = $id
        dir = $dir
        raw = Join-Path $dir "raw-evidence.json"
        extraction = Join-Path $dir "extraction.json"
        review = Join-Path $dir "review-packet.json"
        recommendation = Join-Path $dir "admission-action-recommendation.json"
    }
}

function Invoke-RawSource {
    param([string]$SourceName)

    if ($RawFixturePath) {
        return [pscustomobject][ordered]@{
            command = "fixture:$RawFixturePath"
            exit_code = 0
            stdout = [System.IO.File]::ReadAllText($RawFixturePath)
            stderr = ""
            fixture = $true
        }
    }

    $outFile = Join-Path ([System.IO.Path]::GetTempPath()) ("narada-evidence-out-" + [Guid]::NewGuid().ToString("N") + ".txt")
    $errFile = Join-Path ([System.IO.Path]::GetTempPath()) ("narada-evidence-err-" + [Guid]::NewGuid().ToString("N") + ".txt")
    try {
        if ($SourceName -eq "workboard") {
            $args = @($NaradaCli, "task", "workboard", "--format", "json", "--limit", [string]$Limit, "--cwd", $UserSiteRoot)
            $commandText = "node " + ($args -join " ")
            $process = Start-Process -FilePath "node" -ArgumentList $args -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
            $stdout = if (Test-Path -LiteralPath $outFile) { [System.IO.File]::ReadAllText($outFile) } else { "" }
            $stderr = if (Test-Path -LiteralPath $errFile) { [System.IO.File]::ReadAllText($errFile) } else { "" }
        } elseif ($SourceName -eq "overlay-inspect") {
            $script = Join-Path $UserSiteRoot "tools\window-surface-overlay\Inspect-WindowSurfaceOverlay.ps1"
            $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $script)
            $commandText = "pwsh.exe " + ($args -join " ")
            $process = Start-Process -FilePath "pwsh.exe" -ArgumentList $args -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
            $stdout = if (Test-Path -LiteralPath $outFile) { [System.IO.File]::ReadAllText($outFile) } else { "" }
            $stderr = if (Test-Path -LiteralPath $errFile) { [System.IO.File]::ReadAllText($errFile) } else { "" }
        } else {
            throw "Unsupported source: $SourceName"
        }

        [pscustomobject][ordered]@{
            command = $commandText
            exit_code = $process.ExitCode
            stdout = $stdout
            stderr = $stderr
            fixture = $false
        }
    } finally {
        Remove-Item -LiteralPath $outFile, $errFile -Force -ErrorAction SilentlyContinue
    }
}

function Convert-WorkboardEvidence {
    param([object]$Raw)

    $findings = New-Object System.Collections.Generic.List[string]
    try {
        $workboard = ConvertFrom-NaradaJson $Raw.stdout
        if ($workboard.tasks) {
            $tasks = @($workboard.tasks)
            $pendingReviews = @($tasks | Where-Object { $_.status -eq "in_review" })
            $inProgress = @($tasks | Where-Object { $_.status -eq "claimed" -or $_.status -eq "needs_continuation" })
            $localFollowups = @($tasks | Where-Object { $_.status -eq "opened" -or $_.status -eq "needs_continuation" })
            $sourceEnvelopes = @()
            $publications = @()
            $activeChapters = @()
        } else {
            $pendingReviews = @($workboard.pending_reviews)
            $inProgress = @($workboard.in_progress)
            $localFollowups = @($workboard.local_followups)
            $sourceEnvelopes = @($workboard.source_envelopes)
            $publications = @($workboard.upstream_publications)
            $activeChapters = @($workboard.active_chapters)
        }
        $architectTasks = @($inProgress | Where-Object { [string]$_.assigned_agent -match "architect" })
        $blockedOrUnderspecified = @($inProgress + $localFollowups | Where-Object {
            [string]$_.status -match "needs|blocked|underspecified" -or [string]$_.title -match "blocked|underspecified|handoff"
        })

        if ($pendingReviews.Count -gt 0) {
            $nextActor = "architect"
            $nextAction = "review pending task evidence"
        } elseif (@($inProgress | Where-Object { $_.assigned_agent -eq "narada-andrey.Bob" }).Count -gt 0) {
            $nextActor = "narada-andrey.Bob"
            $nextAction = "continue claimed task"
        } elseif ($inProgress.Count -gt 0) {
            $nextActor = "builder"
            $nextAction = "continue active claimed work"
        } elseif ($localFollowups.Count -gt 0) {
            $nextActor = "builder"
            $nextAction = "claim or route local followup"
        } else {
            $nextActor = "operator"
            $nextAction = "no active workboard pressure"
        }

        $extraction = [pscustomobject][ordered]@{
            schema = "narada.local_evidence.operator_tools.workboard.extraction.v0"
            counts = [ordered]@{
                active_chapters = $activeChapters.Count
                pending_reviews = $pendingReviews.Count
                in_progress = $inProgress.Count
                in_progress_architect_tasks = $architectTasks.Count
                blocked_or_underspecified_handoffs = $blockedOrUnderspecified.Count
                local_followups = $localFollowups.Count
                source_envelopes = $sourceEnvelopes.Count
                prepared_publications = $publications.Count
            }
            pending_reviews = @($pendingReviews | Select-Object task_number, status, assigned_agent, title)
            in_progress_architect_tasks = @($architectTasks | Select-Object task_number, status, assigned_agent, title)
            blocked_or_underspecified_handoffs = @($blockedOrUnderspecified | Select-Object task_number, status, assigned_agent, title)
            local_followups = @($localFollowups | Select-Object task_number, status, assigned_agent, title)
            next_recommended_actor = $nextActor
            next_recommended_action = $nextAction
        }
        $findings.Add("workboard_extracted")
        return [pscustomobject][ordered]@{ extraction = $extraction; findings = $findings.ToArray(); error = $null }
    } catch {
        return [pscustomobject][ordered]@{
            extraction = [pscustomobject][ordered]@{
                schema = "narada.local_evidence.operator_tools.workboard.extraction.v0"
                counts = [ordered]@{}
            }
            findings = @("workboard_schema_or_parse_error")
            error = $_.Exception.Message
        }
    }
}

function Convert-OverlayEvidence {
    param([object]$Raw)

    try {
        $parsed = ConvertFrom-NaradaJson $Raw.stdout
        $items = @($parsed)
        if ($items.Count -eq 1 -and $items[0] -is [System.Array]) {
            $items = @($items[0])
        }
        $matched = @($items | Where-Object { $null -ne $_.matched })
        $ignoredGroups = @($items | Where-Object { $null -ne $_.ignored_reason -and [string]$_.ignored_reason -ne "" } | Group-Object ignored_reason | Sort-Object Count -Descending | Select-Object -First 8)
        $bindings = @($matched | ForEach-Object {
            [pscustomobject][ordered]@{
                surface_id = $_.matched.surface_id
                site_id = $_.matched.site_id
                hwnd = $_.window.hwnd
                title = $_.window.title
                process_name = $_.window.process_name
                label = $_.matched.label
                label_rect = $_.matched.label_rect
            }
        })
        $extraction = [pscustomobject][ordered]@{
            schema = "narada.local_evidence.operator_tools.overlay_inspect.extraction.v0"
            counts = [ordered]@{
                inspected_windows = $items.Count
                matched_bindings = $bindings.Count
                ignored_reason_groups = $ignoredGroups.Count
            }
            bindings = $bindings
            ignored_reasons = @($ignoredGroups | ForEach-Object {
                [pscustomobject][ordered]@{ reason = $_.Name; count = $_.Count }
            })
        }
        return [pscustomobject][ordered]@{ extraction = $extraction; findings = @("overlay_inspect_extracted"); error = $null }
    } catch {
        return [pscustomobject][ordered]@{
            extraction = [pscustomobject][ordered]@{
                schema = "narada.local_evidence.operator_tools.overlay_inspect.extraction.v0"
                counts = [ordered]@{}
                bindings = @()
                ignored_reasons = @()
            }
            findings = @("overlay_inspect_schema_or_parse_error")
            error = $_.Exception.Message
        }
    }
}

if (-not $ArtifactRoot) {
    $ArtifactRoot = Join-Path $UserSiteRoot ".ai\runtime\local-evidence\operator-tools"
}

$paths = New-ArtifactPaths -Root $ArtifactRoot -SourceName $Source -GivenRunId $RunId
$raw = Invoke-RawSource -SourceName $Source
$capturedAt = Get-Date -Format "o"

$rawArtifact = [pscustomobject][ordered]@{
    schema = "narada.local_evidence.operator_tools.raw_evidence.v0"
    run_id = $paths.run_id
    source = $Source
    captured_at = $capturedAt
    command = $raw.command
    exit_code = $raw.exit_code
    fixture = $raw.fixture
    stdout = $raw.stdout
    stderr = $raw.stderr
}
Write-NaradaJsonFile -Path $paths.raw -Value $rawArtifact -Depth 50

$converted = if ($Source -eq "workboard") {
    Convert-WorkboardEvidence -Raw $raw
} else {
    Convert-OverlayEvidence -Raw $raw
}

$extraction = [pscustomobject][ordered]@{
    schema = $converted.extraction.schema
    run_id = $paths.run_id
    source = $Source
    extracted_at = (Get-Date -Format "o")
    source_exit_code = $raw.exit_code
    parse_error = $converted.error
    payload = $converted.extraction
}
Write-NaradaJsonFile -Path $paths.extraction -Value $extraction -Depth 50

$hasError = $null -ne $converted.error -or $raw.exit_code -ne 0
$blockers = New-Object System.Collections.Generic.List[string]
if ($hasError -and $converted.error) {
    $blockers.Add([string]$converted.error)
}
$isMissingWorkboard = $Source -eq "workboard" -and $raw.exit_code -ne 0 -and $raw.stderr -match "unknown command 'workboard'"
if ($isMissingWorkboard) {
    $blockers.Add("Configured Narada CLI embodiment does not expose task workboard.")
    $blockers.Add("Repair command: $NaradaCliRepairCommand")
}
$reviewPacket = [pscustomobject][ordered]@{
    schema = "narada.local_evidence.operator_tools.review_packet.v0"
    run_id = $paths.run_id
    source = $Source
    status = if ($hasError) { "needs_attention" } else { "ok" }
    findings = @($converted.findings)
    blockers = $blockers
    next_action = if ($isMissingWorkboard) { $NaradaCliRepairCommand } elseif ($hasError) { "inspect raw evidence and repair source schema or command" } elseif ($Source -eq "workboard") { $converted.extraction.next_recommended_action } else { "use compact binding evidence; inspect raw artifact only if needed" }
    evidence_paths = [ordered]@{
        raw_evidence = $paths.raw
        extraction = $paths.extraction
        review_packet = $paths.review
        admission_action_recommendation = $paths.recommendation
    }
    summary = if ($Source -eq "workboard") { $converted.extraction.counts } else { $converted.extraction.counts }
}
Write-NaradaJsonFile -Path $paths.review -Value $reviewPacket -Depth 30

$recommendation = [pscustomobject][ordered]@{
    schema = "narada.local_evidence.operator_tools.admission_action_recommendation.v0"
    run_id = $paths.run_id
    source = $Source
    recommendation = if ($hasError) { "do_not_admit; repair extractor or inspect raw artifact" } else { "retain as local runtime evidence; surface only compact packet unless a typed admission is requested" }
    authority_boundary = "verbose evidence remains below; authority crosses only through typed admission"
}
Write-NaradaJsonFile -Path $paths.recommendation -Value $recommendation -Depth 20

$reviewPacket | ConvertTo-Json -Depth 20
