param(
    [string]$TranscriptText,

    [string]$TranscriptFile,

    [ValidateSet("sample-text", "file")]
    [string]$RecognitionAdapter = "sample-text",

    [string]$SourceDevice = "prototype-text-input",

    [double]$SpeechConfidence = 0.80,

    [double]$RecognitionConfidence = 0.80,

    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),

    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },

    [switch]$DispatchDryRun,

    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertTo-NaradaJson {
    param($Value)

    $command = Get-Command ConvertTo-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Value | ConvertTo-Json -Depth 100
    }
    return $Value | ConvertTo-Json
}

function ConvertFrom-NaradaJson {
    param([string]$Json)

    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Json | ConvertFrom-Json -Depth 100
    }
    return $Json | ConvertFrom-Json
}

function New-NaradaEventId {
    param([string]$Prefix)
    "{0}_{1}" -f $Prefix, ([guid]::NewGuid().ToString("N"))
}

function Normalize-NaradaTranscript {
    param([string]$Value)
    (($Value -replace "\s+", " ").Trim())
}

if ($RecognitionAdapter -eq "file") {
    if ([string]::IsNullOrWhiteSpace($TranscriptFile)) {
        throw "TranscriptFile is required when RecognitionAdapter=file."
    }
    if (-not (Test-Path -LiteralPath $TranscriptFile)) {
        throw "TranscriptFile not found: $TranscriptFile"
    }
    $TranscriptText = [System.IO.File]::ReadAllText($TranscriptFile)
}

$transcript = Normalize-NaradaTranscript $TranscriptText
if ([string]::IsNullOrWhiteSpace($transcript)) {
    throw "Voice intent prototype requires non-empty transcript text."
}

$now = Get-Date -Format "o"
$runId = New-NaradaEventId "voice_run"
$runtimeRoot = Join-Path $PcSiteRoot "runtime\voice-intent-capture"
$runRoot = Join-Path $runtimeRoot $runId
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$privacy = [ordered]@{
    raw_audio_retained = $false
    raw_audio_retention = "none"
    transcript_retained = $true
    transcript_retention = "pc_site_runtime_until_operator_cleanup"
    remote_audio_allowed = $false
    remote_audio_note = "V1 harness accepts text/file transcript only. Remote recognition must be admitted by adapter config before use."
}

$speechSegment = [ordered]@{
    schema = "narada.voice.speech_segment_detected.v0"
    event_id = New-NaradaEventId "speech_segment"
    run_id = $runId
    observed_at = $now
    source_device = $SourceDevice
    detector = [ordered]@{
        kind = "local_vad_boundary"
        implementation = "prototype_stub"
        confidence = $SpeechConfidence
    }
    segment = [ordered]@{
        bounded = $true
        duration_ms = $null
        audio_path = $null
    }
    privacy = $privacy
}

$recognition = [ordered]@{
    schema = "narada.voice.recognition_result.v0"
    event_id = New-NaradaEventId "recognition_result"
    run_id = $runId
    observed_at = $now
    backend = [ordered]@{
        adapter = $RecognitionAdapter
        provider = if ($RecognitionAdapter -eq "file") { "local_file_transcript" } else { "local_sample_text" }
        remote = $false
    }
    source_event_id = $speechSegment.event_id
    transcript = [ordered]@{
        text = $transcript
        confidence = $RecognitionConfidence
        language = "unspecified"
    }
    privacy = $privacy
}

$interpreter = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Resolve-VoiceOperatorSurfaceIntent.ps1"
if (-not (Test-Path -LiteralPath $interpreter)) {
    throw "Resolve-VoiceOperatorSurfaceIntent.ps1 not found: $interpreter"
}
$interpretation = ConvertFrom-NaradaJson (& $interpreter -TranscriptText $transcript -UserSiteRoot $UserSiteRoot -PcSiteRoot $PcSiteRoot -PassThru)
$selectedCandidate = $interpretation.selected_candidate
$autoFocusAllowed = (
    $selectedCandidate -and
    [string]$selectedCandidate.intent_kind -eq "operator_surface.focus_identity" -and
    $selectedCandidate.automatic_execution_allowed -eq $true
)
$autoGestureLifecycleAllowed = (
    $selectedCandidate -and
    ([string]$selectedCandidate.intent_kind).StartsWith("operator_surface.camera_gesture_sensing.") -and
    $selectedCandidate.automatic_execution_allowed -eq $true
)
$autoReadOnlyAllowed = (
    $selectedCandidate -and
    [string]$selectedCandidate.risk_class -in @("local_status_read_only", "local_panel_show_only") -and
    $selectedCandidate.automatic_execution_allowed -eq $true
)
$admission = if ($interpretation.candidate_count -gt 0) { "candidate_operator_surface_intent" } else { "requires_operator_review" }

$intentDraft = [ordered]@{
    schema = "narada.operator_surface.operator_intent_draft.v0"
    event_id = New-NaradaEventId "operator_intent_draft"
    run_id = $runId
    observed_at = $now
    source_kind = "voice_transcript"
    source_event_id = $recognition.event_id
    text = $transcript
    confidence = [Math]::Min($SpeechConfidence, $RecognitionConfidence)
    interpretation = $interpretation
    admission = [ordered]@{
        status = $admission
        destructive_dispatch_allowed = $false
        confirmation_required = -not ($autoFocusAllowed -or $autoGestureLifecycleAllowed -or $autoReadOnlyAllowed)
        admitted_dispatch_path = if ($autoFocusAllowed) { "tools/operator-surface-carriers/Focus-OperatorSurfaceIdentity.ps1" } elseif ($autoGestureLifecycleAllowed) { "tools/operator-surface-carriers/Set-CameraGestureSensingLifecycle.ps1" } elseif ($autoReadOnlyAllowed) { "read_only_status_or_panel_projection" } else { "intent_draft_only" }
    }
    privacy = $privacy
}

$events = @($speechSegment, $recognition, $intentDraft)
foreach ($event in $events) {
    $path = Join-Path $runRoot ("{0}.json" -f $event.event_id)
    ConvertTo-NaradaJson $event | Set-Content -Encoding UTF8 -Path $path
}

$dispatch = [ordered]@{
    attempted = $false
    dry_run = $true
    command = $null
    result = $null
}

if ($DispatchDryRun -or $autoFocusAllowed -or $autoGestureLifecycleAllowed -or $autoReadOnlyAllowed) {
    if (-not $selectedCandidate) {
        $dispatch.result = "not_dispatched_unsupported_intent_shape"
    } elseif ([string]$selectedCandidate.intent_kind -eq "operator_surface.focus_identity" -and (-not $selectedCandidate.target_admitted -or [string]::IsNullOrWhiteSpace([string]$selectedCandidate.target_identity))) {
        $dispatch.result = "not_dispatched_unadmitted_or_unknown_target"
    } else {
        if (-not $DispatchDryRun -and -not ($autoFocusAllowed -or $autoGestureLifecycleAllowed -or $autoReadOnlyAllowed)) {
            $dispatch.result = "not_dispatched_requires_confirmation"
        } else {
        $dispatch.attempted = $true
        $dispatch.dry_run = [bool]$DispatchDryRun
        if ([string]$selectedCandidate.intent_kind -eq "operator_surface.focus_identity") {
            $sendIntent = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Send-OperatorSurfaceIntent.ps1"
            if (-not (Test-Path -LiteralPath $sendIntent)) {
                throw "Send-OperatorSurfaceIntent.ps1 not found: $sendIntent"
            }
            $dispatch.command = if ($DispatchDryRun) { "$sendIntent focus $($selectedCandidate.target_identity) -DryRun" } else { "$sendIntent focus $($selectedCandidate.target_identity)" }
            if ($DispatchDryRun) {
                $output = & $sendIntent "focus" ([string]$selectedCandidate.target_identity) -DryRun -PassThru 2>&1
            } else {
                $output = & $sendIntent "focus" ([string]$selectedCandidate.target_identity) -PassThru 2>&1
            }
        } elseif (([string]$selectedCandidate.intent_kind).StartsWith("operator_surface.camera_gesture_sensing.")) {
            $lifecycleScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Set-CameraGestureSensingLifecycle.ps1"
            if (-not (Test-Path -LiteralPath $lifecycleScript)) {
                throw "Set-CameraGestureSensingLifecycle.ps1 not found: $lifecycleScript"
            }
            $action = [string]$selectedCandidate.lifecycle_action
            $dispatch.command = if ($DispatchDryRun) { "$lifecycleScript -Action $action -DryRun" } else { "$lifecycleScript -Action $action" }
            if ($DispatchDryRun) {
                $output = & $lifecycleScript -Action $action -DryRun -PassThru -UserSiteRoot $UserSiteRoot -PcSiteRoot $PcSiteRoot 2>&1
            } else {
                $output = & $lifecycleScript -Action $action -PassThru -UserSiteRoot $UserSiteRoot -PcSiteRoot $PcSiteRoot 2>&1
            }
        } else {
            $intentKind = [string]$selectedCandidate.intent_kind
            if ($intentKind -eq "operator_surface.health_status.show") {
                $healthScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Get-KomorebiShortcutAndRoleBorderHealth.ps1"
                if (-not (Test-Path -LiteralPath $healthScript)) {
                    throw "Get-KomorebiShortcutAndRoleBorderHealth.ps1 not found: $healthScript"
                }
                $dispatch.command = "$healthScript -PassThru"
                if ($DispatchDryRun) {
                    $output = @("dry_run_read_only_health_status")
                } else {
                    $output = & $healthScript -UserSiteRoot $UserSiteRoot -PcSiteRoot $PcSiteRoot -PassThru 2>&1
                }
            } elseif ($intentKind -eq "operator_surface.voice_status.show") {
                $statePath = Join-Path $PcSiteRoot "runtime\voice-intent-capture\state\current.json"
                $dispatch.command = "read $statePath"
                if (Test-Path -LiteralPath $statePath) {
                    $output = @([System.IO.File]::ReadAllText($statePath))
                } else {
                    $output = @("voice_status_unavailable: $statePath")
                }
            } elseif ($intentKind -eq "operator_surface.keyboard_shortcuts.show") {
                $dispatch.command = "show keyboard shortcuts panel"
                $output = @("keyboard_shortcuts_panel_request_recorded")
            } else {
                $dispatch.command = "intent_draft_only"
                $output = @("not_dispatched_requires_confirmation")
            }
        }
        $dispatch.result = @($output | ForEach-Object { [string]$_ })
        }
    }
}

$summary = [ordered]@{
    schema = "narada.voice.intent_capture_run.v0"
    run_id = $runId
    created_at = $now
    runtime_path = $runRoot
    events = @($events | ForEach-Object { $_.event_id })
    transcript_preview = if ($transcript.Length -gt 80) { $transcript.Substring(0, 80) + "..." } else { $transcript }
    intent_admission = $admission
    interpretation_status = $interpretation.status
    selected_intent = $selectedCandidate
    dispatch = $dispatch
}

ConvertTo-NaradaJson $summary | Set-Content -Encoding UTF8 -Path (Join-Path $runRoot "run.json")

if ($PassThru) {
    ConvertTo-NaradaJson $summary
} else {
    [pscustomobject]@{
        RunId = $runId
        IntentAdmission = $admission
        DispatchAttempted = $dispatch.attempted
        RuntimePath = $runRoot
    } | Format-List
}
