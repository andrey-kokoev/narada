param(
    [Parameter(Mandatory = $true)]
    [string]$TranscriptText,

    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),

    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },

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

function ConvertTo-NaradaJson {
    param($Value)

    $command = Get-Command ConvertTo-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Value | ConvertTo-Json -Depth 100
    }
    return $Value | ConvertTo-Json
}

function Normalize-VoiceText {
    param([string]$Value)
    ((($Value -replace "[\.,;:!\?`"'\(\)\[\]\{\}]", " ") -replace "\s+", " ").Trim()).ToLowerInvariant()
}

function Get-LiveIdentityNames {
    param([string]$UserSiteRoot)

    $labelPath = Join-Path $UserSiteRoot "operator-surfaces\window-labels.json"
    if (-not (Test-Path -LiteralPath $labelPath)) {
        return @()
    }
    $labels = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($labelPath))
    $runtimePath = [string]$labels.runtime_binding_path
    if ([string]::IsNullOrWhiteSpace($runtimePath) -or -not (Test-Path -LiteralPath $runtimePath)) {
        return @()
    }
    $runtime = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($runtimePath))
    @($runtime.bindings | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.identity_name) } | ForEach-Object { [string]$_.identity_name } | Select-Object -Unique)
}

function New-Candidate {
    param(
        [string]$IntentKind,
        [string]$TargetIdentity,
        [string]$TargetAlias,
        [double]$Confidence,
        [string]$Basis,
        [bool]$TargetAdmitted,
        [bool]$TargetLive,
        [double]$AutoMinConfidence
    )

    $autoAllowed = (
        $IntentKind -eq "operator_surface.focus_identity" -and
        $TargetAdmitted -and
        $TargetLive -and
        $Confidence -ge $AutoMinConfidence
    )
    $recommendation = if ($autoAllowed) {
        "admit_auto_execute"
    } elseif ($TargetAdmitted -and $Confidence -ge 0.6) {
        "requires_confirmation"
    } elseif (-not $TargetAdmitted) {
        "reject_unknown_target"
    } else {
        "intent_draft_only"
    }

    [ordered]@{
        intent_kind = $IntentKind
        target_identity = $TargetIdentity
        target_alias = $TargetAlias
        confidence = [Math]::Round($Confidence, 3)
        basis = $Basis
        target_admitted = $TargetAdmitted
        target_live = $TargetLive
        admission_recommendation = $recommendation
        automatic_execution_allowed = $autoAllowed
        risk_class = "local_attention_focus_only"
    }
}

function New-ReadOnlyCandidate {
    param(
        [string]$IntentKind,
        [double]$Confidence,
        [string]$Basis,
        [string]$RiskClass,
        [double]$AutoMinConfidence
    )

    $autoAllowed = ($Confidence -ge $AutoMinConfidence)
    [ordered]@{
        intent_kind = $IntentKind
        target_identity = $null
        target_alias = $null
        confidence = [Math]::Round($Confidence, 3)
        basis = $Basis
        target_admitted = $true
        target_live = $true
        admission_recommendation = if ($autoAllowed) { "admit_auto_execute" } else { "requires_confirmation" }
        automatic_execution_allowed = $autoAllowed
        risk_class = $RiskClass
    }
}

function New-MessageCandidate {
    param(
        [string]$IntentKind,
        [string]$TargetIdentity,
        [string]$TargetAlias,
        [string]$Message,
        [double]$Confidence,
        [string]$Basis,
        [bool]$TargetAdmitted,
        [bool]$TargetLive
    )

    $recommendation = if (-not $TargetAdmitted) {
        "reject_unknown_target"
    } elseif ($Confidence -ge 0.6) {
        "requires_confirmation"
    } else {
        "intent_draft_only"
    }

    [ordered]@{
        intent_kind = $IntentKind
        target_identity = $TargetIdentity
        target_alias = $TargetAlias
        message = $Message
        confidence = [Math]::Round($Confidence, 3)
        basis = $Basis
        target_admitted = $TargetAdmitted
        target_live = $TargetLive
        admission_recommendation = $recommendation
        automatic_execution_allowed = $false
        risk_class = "operator_surface_message_requires_confirmation"
    }
}

function New-LifecycleCandidate {
    param(
        [string]$IntentKind,
        [string]$Action,
        [double]$Confidence,
        [string]$Basis,
        [double]$AutoMinConfidence
    )

    $autoAllowed = ($Confidence -ge $AutoMinConfidence)
    [ordered]@{
        intent_kind = $IntentKind
        lifecycle_action = $Action
        target_identity = $null
        target_alias = $null
        confidence = [Math]::Round($Confidence, 3)
        basis = $Basis
        target_admitted = $true
        target_live = $true
        admission_recommendation = if ($autoAllowed) { "admit_auto_execute" } else { "requires_confirmation" }
        automatic_execution_allowed = $autoAllowed
        risk_class = "local_sensing_lifecycle_only"
    }
}

$catalogPath = Join-Path $UserSiteRoot "operator-surfaces\voice-intent-catalog.json"
$aliasPath = Join-Path $UserSiteRoot "operator-surfaces\input-aliases.json"
$identityPath = Join-Path $UserSiteRoot "operator-surfaces\identities.json"
foreach ($requiredPath in @($catalogPath, $aliasPath, $identityPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required voice intent authority not found: $requiredPath"
    }
}

$catalog = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($catalogPath))
$focusIntent = @($catalog.intents | Where-Object { $_.intent_kind -eq "operator_surface.focus_identity" -and $_.enabled -eq $true }) | Select-Object -First 1
if (-not $focusIntent) {
    throw "operator_surface.focus_identity is not enabled in voice intent catalog."
}
$lifecycleIntents = @($catalog.intents | Where-Object { ([string]$_.intent_kind).StartsWith("operator_surface.camera_gesture_sensing.") -and $_.enabled -eq $true })
$readOnlyIntents = @($catalog.intents | Where-Object { $_.enabled -eq $true -and $_.risk_class -in @("local_status_read_only", "local_panel_show_only") })
$nudgeIntent = @($catalog.intents | Where-Object { $_.intent_kind -eq "operator_surface.nudge_identity_next" -and $_.enabled -eq $true }) | Select-Object -First 1
$tellIntent = @($catalog.intents | Where-Object { $_.intent_kind -eq "operator_surface.tell_identity" -and $_.enabled -eq $true }) | Select-Object -First 1

$identityRegistry = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($identityPath))
$admittedIdentities = @($identityRegistry.identities | ForEach-Object { [string]$_.identity_name })
$aliases = @((ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($aliasPath))).aliases | Where-Object { $_.enabled -eq $true })
$liveIdentities = @(Get-LiveIdentityNames -UserSiteRoot $UserSiteRoot)
$autoMinConfidence = [double]$focusIntent.auto_execute_when.min_confidence
if ($autoMinConfidence -le 0) { $autoMinConfidence = 0.9 }

$normalized = Normalize-VoiceText $TranscriptText
$tokens = @($normalized -split "\s+" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$candidateList = New-Object System.Collections.Generic.List[object]

if ($tokens.Count -gt 0) {
    foreach ($readOnlyIntent in $readOnlyIntents) {
        $intentKind = [string]$readOnlyIntent.intent_kind
        $riskClass = [string]$readOnlyIntent.risk_class
        $minReadOnlyConfidence = [double]$readOnlyIntent.auto_execute_when.min_confidence
        if ($minReadOnlyConfidence -le 0) { $minReadOnlyConfidence = 0.9 }
        foreach ($phrase in @($readOnlyIntent.phrases)) {
            $phraseNormalized = Normalize-VoiceText ([string]$phrase)
            if ($normalized -eq $phraseNormalized) {
                $candidateList.Add((New-ReadOnlyCandidate -IntentKind $intentKind -Confidence 0.95 -Basis "exact_read_only_phrase" -RiskClass $riskClass -AutoMinConfidence $minReadOnlyConfidence))
            } elseif ($normalized.Length -ge 6 -and ($phraseNormalized.StartsWith($normalized) -or $normalized.StartsWith($phraseNormalized))) {
                $candidateList.Add((New-ReadOnlyCandidate -IntentKind $intentKind -Confidence 0.72 -Basis "partial_read_only_phrase" -RiskClass $riskClass -AutoMinConfidence $minReadOnlyConfidence))
            }
        }
    }

    foreach ($lifecycleIntent in $lifecycleIntents) {
        $intentKind = [string]$lifecycleIntent.intent_kind
        $action = if ($intentKind.EndsWith(".enable")) { "enable" } elseif ($intentKind.EndsWith(".disable")) { "disable" } else { "" }
        if ([string]::IsNullOrWhiteSpace($action)) { continue }
        $minLifecycleConfidence = [double]$lifecycleIntent.auto_execute_when.min_confidence
        if ($minLifecycleConfidence -le 0) { $minLifecycleConfidence = 0.92 }
        foreach ($phrase in @($lifecycleIntent.phrases)) {
            $phraseNormalized = Normalize-VoiceText ([string]$phrase)
            if ($normalized -eq $phraseNormalized) {
                $candidateList.Add((New-LifecycleCandidate -IntentKind $intentKind -Action $action -Confidence 0.96 -Basis "exact_lifecycle_phrase" -AutoMinConfidence $minLifecycleConfidence))
            } elseif ($normalized.Length -ge 6 -and ($phraseNormalized.StartsWith($normalized) -or $normalized.StartsWith($phraseNormalized))) {
                $candidateList.Add((New-LifecycleCandidate -IntentKind $intentKind -Action $action -Confidence 0.74 -Basis "partial_lifecycle_phrase" -AutoMinConfidence $minLifecycleConfidence))
            }
        }
    }

    $verbs = @($focusIntent.verbs | ForEach-Object { Normalize-VoiceText ([string]$_) })
    $firstToken = [string]$tokens[0]
    $hasFocusVerb = $firstToken -in $verbs
    $targetTokens = if ($hasFocusVerb -and $tokens.Count -gt 1) { @($tokens | Select-Object -Skip 1) } else { @($tokens) }
    $targetText = ($targetTokens -join " ").Trim()

    foreach ($alias in $aliases) {
        $aliasText = [string]$alias.alias
        $identityName = [string]$alias.identity_name
        $aliasNormalized = Normalize-VoiceText $aliasText
        $identityNormalized = Normalize-VoiceText $identityName
        $targetAdmitted = $identityName -in $admittedIdentities
        $targetLive = $identityName -in $liveIdentities

        if ($hasFocusVerb -and ($targetText -eq $aliasNormalized -or $targetText -eq $identityNormalized)) {
            $candidateList.Add((New-Candidate -IntentKind "operator_surface.focus_identity" -TargetIdentity $identityName -TargetAlias $aliasText -Confidence 0.95 -Basis "focus_verb_exact_target" -TargetAdmitted $targetAdmitted -TargetLive $targetLive -AutoMinConfidence $autoMinConfidence))
        } elseif ($hasFocusVerb -and $targetText.Length -ge 1 -and ($aliasNormalized.StartsWith($targetText) -or $identityNormalized.EndsWith($targetText))) {
            $candidateList.Add((New-Candidate -IntentKind "operator_surface.focus_identity" -TargetIdentity $identityName -TargetAlias $aliasText -Confidence 0.72 -Basis "focus_verb_partial_target" -TargetAdmitted $targetAdmitted -TargetLive $targetLive -AutoMinConfidence $autoMinConfidence))
        } elseif (-not $hasFocusVerb -and [bool]$focusIntent.allow_target_only_confirmation_candidate -and ($normalized -eq $aliasNormalized -or $normalized -eq $identityNormalized)) {
            $candidateList.Add((New-Candidate -IntentKind "operator_surface.focus_identity" -TargetIdentity $identityName -TargetAlias $aliasText -Confidence 0.65 -Basis "target_only_without_verb" -TargetAdmitted $targetAdmitted -TargetLive $targetLive -AutoMinConfidence $autoMinConfidence))
        }
    }

    if ($hasFocusVerb -and $targetTokens.Count -gt 0 -and $candidateList.Count -eq 0) {
        $candidateList.Add((New-Candidate -IntentKind "operator_surface.focus_identity" -TargetIdentity $null -TargetAlias ($targetTokens -join " ") -Confidence 0.4 -Basis "focus_verb_unknown_target" -TargetAdmitted $false -TargetLive $false -AutoMinConfidence $autoMinConfidence))
    }

    if ($nudgeIntent -or $tellIntent) {
        $messageIntentKind = $null
        $messageText = $null
        $messageTargetTokens = @()
        $messageBasis = $null
        $messageConfidence = 0.88

        if ($nudgeIntent -and $firstToken -eq "nudge" -and $tokens.Count -gt 1) {
            $messageIntentKind = "operator_surface.nudge_identity_next"
            $messageText = "next"
            $messageTargetTokens = @($tokens | Select-Object -Skip 1)
            $messageBasis = "nudge_verb_target"
        } elseif ($nudgeIntent -and $firstToken -eq "next" -and $tokens.Count -gt 1) {
            $messageIntentKind = "operator_surface.nudge_identity_next"
            $messageText = "next"
            $messageTargetTokens = @($tokens | Select-Object -Skip 1)
            $messageBasis = "next_verb_target"
        } elseif ($tellIntent -and $firstToken -eq "tell" -and $tokens.Count -gt 2) {
            $messageIntentKind = "operator_surface.tell_identity"
            $remaining = @($tokens | Select-Object -Skip 1)
            foreach ($alias in $aliases) {
                $aliasText = [string]$alias.alias
                $aliasNormalized = Normalize-VoiceText $aliasText
                $aliasTokens = @($aliasNormalized -split "\s+")
                if ($remaining.Count -ge $aliasTokens.Count -and (($remaining | Select-Object -First $aliasTokens.Count) -join " ") -eq $aliasNormalized) {
                    $messageTargetTokens = @($remaining | Select-Object -First $aliasTokens.Count)
                    $messageText = (@($remaining | Select-Object -Skip $aliasTokens.Count) -join " ").Trim()
                    $messageBasis = "tell_verb_exact_target"
                    break
                }
            }
            if ([string]::IsNullOrWhiteSpace($messageText) -and $tokens.Count -ge 3) {
                $messageTargetTokens = @($tokens[1])
                $messageText = (@($tokens | Select-Object -Skip 2) -join " ").Trim()
                $messageBasis = "tell_verb_single_token_target"
                $messageConfidence = 0.62
            }
        } elseif ($nudgeIntent -and $tokens.Count -gt 1 -and [string]$tokens[-1] -eq "next") {
            $messageIntentKind = "operator_surface.nudge_identity_next"
            $messageText = "next"
            $messageTargetTokens = @($tokens | Select-Object -First ($tokens.Count - 1))
            $messageBasis = "target_then_next"
        }

        if ($messageIntentKind -and $messageTargetTokens.Count -gt 0) {
            $messageTargetText = ($messageTargetTokens -join " ").Trim()
            $matchedAnyMessageTarget = $false
            foreach ($alias in $aliases) {
                $aliasText = [string]$alias.alias
                $identityName = [string]$alias.identity_name
                $aliasNormalized = Normalize-VoiceText $aliasText
                $identityNormalized = Normalize-VoiceText $identityName
                if ($messageTargetText -eq $aliasNormalized -or $messageTargetText -eq $identityNormalized -or ($messageTargetText.Length -ge 1 -and ($aliasNormalized.StartsWith($messageTargetText) -or $identityNormalized.EndsWith($messageTargetText)))) {
                    $matchedAnyMessageTarget = $true
                    $targetAdmitted = $identityName -in $admittedIdentities
                    $targetLive = $identityName -in $liveIdentities
                    $confidence = if ($messageTargetText -eq $aliasNormalized -or $messageTargetText -eq $identityNormalized) { $messageConfidence } else { 0.62 }
                    $candidateList.Add((New-MessageCandidate -IntentKind $messageIntentKind -TargetIdentity $identityName -TargetAlias $aliasText -Message $messageText -Confidence $confidence -Basis $messageBasis -TargetAdmitted $targetAdmitted -TargetLive $targetLive))
                }
            }
            if (-not $matchedAnyMessageTarget) {
                $candidateList.Add((New-MessageCandidate -IntentKind $messageIntentKind -TargetIdentity $null -TargetAlias $messageTargetText -Message $messageText -Confidence 0.4 -Basis "message_unknown_target" -TargetAdmitted $false -TargetLive $false))
            }
        }
    }
}

$candidates = @($candidateList | Sort-Object -Property @{ Expression = { [double]$_.confidence }; Descending = $true }, @{ Expression = { [string]$_.target_alias }; Ascending = $true })
$semanticGroups = @($candidates | Group-Object -Property {
        $candidate = $_
        @(
            [string]$candidate.intent_kind,
            [string]$candidate.target_identity,
            [string]$candidate.lifecycle_action
        ) -join "|"
    })
$selected = if ($candidates.Count -eq 1) {
    $candidates[0]
} elseif ($semanticGroups.Count -eq 1) {
    $candidates[0]
} else {
    $null
}
$status = if ($candidates.Count -eq 0) {
    "unsupported_transcript"
} elseif ($selected) {
    [string]$selected.admission_recommendation
} else {
    "ambiguous_requires_confirmation"
}

$result = [ordered]@{
    schema = "narada.operator_surfaces.voice_intent_interpretation.v0"
    transcript = $TranscriptText
    normalized_transcript = $normalized
    catalog_path = "operator-surfaces/voice-intent-catalog.json"
    candidate_count = $candidates.Count
    status = $status
    selected_candidate = $selected
    candidates = $candidates
    denied_effects = @("nudge", "tell", "text_submission", "repo_mutation", "mailbox_action", "external_side_effect")
}

if ($PassThru) {
    ConvertTo-NaradaJson $result
} else {
    $result | Format-List
}
