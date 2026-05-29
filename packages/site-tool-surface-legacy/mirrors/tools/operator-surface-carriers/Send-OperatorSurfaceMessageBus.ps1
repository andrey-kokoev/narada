param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = $(if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" }),
    [string]$IdentityName,
    [Int64]$Hwnd = 0,
    [string]$Text,
    [string]$FromIdentity,
    [ValidateSet("short_command", "note")]
    [string]$MessagePosture = "short_command",
    [ValidateSet("type_only", "operator_confirmed_submit", "known_surface_submit")]
    [string]$SubmitStrategy = "type_only",
    [string]$AssertedBy = "operator",
    [int]$MaxAttempts = 2,
    [int]$BackoffMs = 750,
    [int]$ExpiresAfterMs = 10000,
    [string]$DedupeKey,
    [string]$AuthorityBasisKind,
    [string]$AuthorityBasisSummary,
    [switch]$ExplicitOperatorOsmRequest,
    [switch]$NoDedupe,
    [string]$BridgeResultFixturePath,
    [string]$PreFocusWarningDecisionFixture,
    [switch]$DryRun,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([Parameter(ValueFromPipeline = $true)]$Json)
    begin { $chunks = New-Object System.Collections.Generic.List[string] }
    process { if ($null -ne $Json) { $chunks.Add([string]$Json) } }
    end {
        $raw = $chunks -join [Environment]::NewLine
        $command = Get-Command ConvertFrom-Json
        if ($command.Parameters.ContainsKey("Depth")) { return $raw | ConvertFrom-Json -Depth 100 }
        return $raw | ConvertFrom-Json
    }
}

function Write-JsonFile {
    param([string]$Path, [object]$Value)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $json = $Value | ConvertTo-Json -Depth 50
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function ConvertTo-SafeFileToken {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return "empty" }
    return ($Value -replace "[^A-Za-z0-9_.-]", "_")
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

function New-OperatorSurfacePayloadId {
    "osmpayload_{0}_{1}" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
}

function New-OperatorSurfaceMessagePayloadObject {
    param(
        [string]$PayloadRoot,
        [string]$PayloadId,
        [string]$OriginalText,
        [string]$BridgeText,
        [string]$ToIdentity,
        [string]$FromIdentityName,
        [string]$AssertedPrincipal,
        [string]$Posture,
        [string]$DedupeKeyValue,
        [string]$BusEventId,
        [string]$BusEventPath,
        [int]$BridgeLimit
    )

    $createdAt = Get-Date -Format "o"
    $sha = Get-StableHash $OriginalText
    $payloadPath = Join-Path $PayloadRoot ((ConvertTo-SafeFileToken $PayloadId) + ".json")
    $summary = ($OriginalText -replace "\s+", " ").Trim()
    if ($summary.Length -gt 160) { $summary = $summary.Substring(0, 160) + "..." }

    $payload = [ordered]@{
        schema = "narada.operator_surfaces.message_payload_ref.v0"
        payload_id = $PayloadId
        payload_ref = "osm_payload:$PayloadId@v1"
        created_at = $createdAt
        sender = [ordered]@{
            identity_name = if ($FromIdentityName) { $FromIdentityName } else { $null }
            asserted_by = $AssertedPrincipal
        }
        recipient = [ordered]@{
            identity_name = $ToIdentity
        }
        message_posture = $Posture
        content = [ordered]@{
            encoding = "plain_text"
            length = $OriginalText.Length
            sha256 = $sha
            summary = $summary
            text = $OriginalText
        }
        bridge = [ordered]@{
            inline_text_limit = $BridgeLimit
            delivered_text = $BridgeText
            delivered_text_length = $BridgeText.Length
            strategy = "payload_reference_compact_notice"
        }
        audit = [ordered]@{
            dedupe_key = $DedupeKeyValue
            bus_event_id = $BusEventId
            bus_event_path = $BusEventPath
            payload_path = $payloadPath
            immutable_revision = "v1"
        }
    }

    Write-JsonFile -Path $payloadPath -Value $payload
    return [ordered]@{
        payload_id = $PayloadId
        payload_ref = $payload.payload_ref
        payload_path = $payloadPath
        content_sha256 = $sha
        content_length = $OriginalText.Length
        summary = $summary
        bridge_text = $BridgeText
        bridge_text_length = $BridgeText.Length
    }
}

function Get-DeliveryStateForBridgeResult {
    param([object]$Result)

    $status = if ($Result.PSObject.Properties.Name -contains "status") { [string]$Result.status } else { "" }
    $errMsg = if ($Result.PSObject.Properties.Name -contains "error") { [string]$Result.error } else { "" }
    $failure = if ($Result.PSObject.Properties.Name -contains "failure_reason") { [string]$Result.failure_reason } else { "" }
    $text = @($status, $errMsg, $failure) -join " "

    if ($status -eq "submitted_with_known_strategy" -or $status -eq "operator_confirmation_required") {
        return [ordered]@{ state = "delivered"; reason = $status }
    }
    if ($status -eq "typed_only") {
        return [ordered]@{ state = "fallback_notified"; reason = "typed_only_not_submitted" }
    }
    if ($status -eq "dry_run") {
        return [ordered]@{ state = "delivered"; reason = "dry_run_planned" }
    }
    if ($status -eq "queued_waiting_for_idle_expired" -or $text -match "operator_active_input_timeout|queued_waiting_for_idle_expired") {
        return [ordered]@{ state = "queued_waiting_for_idle"; reason = "operator_active_input_timeout" }
    }
    if ($text -match "stale_runtime_binding") {
        return [ordered]@{ state = "refused"; reason = if ($failure) { $failure } else { $text.Trim() } }
    }
    if ($text -match "ambiguous_identity_binding") {
        return [ordered]@{ state = "refused"; reason = if ($failure) { $failure } else { $text.Trim() } }
    }
    if ($text -match "cross_site_operator_surface_binding_lookup") {
        return [ordered]@{ state = "refused"; reason = if ($failure) { $failure } else { $text.Trim() } }
    }
    if ($text -match "target_window_not_visible|no_live_binding_for_identity") {
        return [ordered]@{ state = "fallback_notified"; reason = "target_not_visible_or_no_live_binding" }
    }
    if ($status -eq "refused" -or $text -match "refused|unavailable|unsupported|unknown") {
        return [ordered]@{ state = "refused"; reason = if ($failure) { $failure } else { $error } }
    }
    return [ordered]@{ state = "refused"; reason = if ($text.Trim()) { $text.Trim() } else { "unclassified_bridge_result" } }
}

function Invoke-BridgeAttempt {
    param([int]$AttemptIndex)

    if ($script:bridgeFixtures) {
        $index = [Math]::Min($AttemptIndex - 1, @($script:bridgeFixtures).Count - 1)
        return @($script:bridgeFixtures)[$index]
    }

    $bridge = Join-Path $UserSiteRoot "tools\operator-surface-carriers\windows-glue\Send-OperatorSurfaceInput.ps1"
    if (-not (Test-Path -LiteralPath $bridge)) {
        return [pscustomobject]@{ status = "refused"; error = "bridge_not_found: $bridge" }
    }

    $args = @{
        UserSiteRoot = $UserSiteRoot
        IdentityName = $IdentityName
        Text = $Text
        SubmitStrategy = $SubmitStrategy
        AssertedBy = $AssertedBy
        MessagePosture = $MessagePosture
        ActiveInputPolicy = "queue_waiting_for_idle"
        RequiredIdleMs = 750
        IdleWaitTimeoutMs = [Math]::Max(250, [Math]::Min($ExpiresAfterMs, 5000))
        FallbackPolicy = "sender_notification"
        PassThru = $true
    }
    if ($Hwnd -ne 0) { $args.Hwnd = $Hwnd }
    if ($FromIdentity) { $args.FromIdentity = $FromIdentity }
    if ($DryRun) { $args.DryRun = $true }

    try {
        $output = & $bridge @args 2>&1
        return ($output | ConvertFrom-NaradaJson)
    } catch {
        return [pscustomobject]@{
            status = "bridge_error"
            error = $_.Exception.Message
        }
    }
}

function Get-PreFocusWarningConfig {
    $policyPath = Join-Path $UserSiteRoot "operator-surfaces\input-delivery-policy.json"
    $default = [ordered]@{
        enabled = $false
        warning_seconds = 5
        delay_ms = 10000
        policy_path = $policyPath
    }

    if (-not (Test-Path -LiteralPath $policyPath)) { return $default }

    try {
        $policy = [System.IO.File]::ReadAllText($policyPath) | ConvertFrom-NaradaJson
        if (-not ($policy.PSObject.Properties.Name -contains "pre_focus_warning")) { return $default }
        $warning = $policy.pre_focus_warning
        return [ordered]@{
            enabled = [bool]$warning.enabled
            warning_seconds = if ($warning.PSObject.Properties.Name -contains "warning_seconds") { [int]$warning.warning_seconds } else { 5 }
            delay_ms = if ($warning.PSObject.Properties.Name -contains "delay_ms") { [int]$warning.delay_ms } else { 10000 }
            policy_path = $policyPath
        }
    } catch {
        return [ordered]@{
            enabled = $false
            warning_seconds = 5
            delay_ms = 10000
            policy_path = $policyPath
            error = $_.Exception.Message
        }
    }
}

function Invoke-PreFocusWarningPrompt {
    param([object]$Config)

    $warningSeconds = [Math]::Max(1, [int]$Config.warning_seconds)
    $delayMs = [Math]::Max(0, [int]$Config.delay_ms)

    if ($PreFocusWarningDecisionFixture) {
        $decisions = @($PreFocusWarningDecisionFixture -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        if ($decisions.Count -lt 1) { $decisions = @("countdown_elapsed") }
        $index = [Math]::Min([int]$script:preFocusWarningFixtureIndex, $decisions.Count - 1)
        $script:preFocusWarningFixtureIndex++
        return [ordered]@{
            decision = [string]$decisions[$index]
            source = "fixture"
            warning_seconds = $warningSeconds
            delay_ms = $delayMs
        }
    }

    if ($DryRun) {
        return [ordered]@{
            decision = "countdown_elapsed"
            source = "dry_run"
            warning_seconds = $warningSeconds
            delay_ms = $delayMs
        }
    }

    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing

        $form = New-Object System.Windows.Forms.Form
        $form.Text = "OSM delivery warning"
        $form.StartPosition = "CenterScreen"
        $form.TopMost = $true
        $form.Width = 440
        $form.Height = 180
        $form.FormBorderStyle = "FixedDialog"
        $form.MaximizeBox = $false
        $form.MinimizeBox = $false

        $label = New-Object System.Windows.Forms.Label
        $label.AutoSize = $false
        $label.Left = 16
        $label.Top = 16
        $label.Width = 390
        $label.Height = 54
        $label.Text = "OSM is about to focus or send input to $IdentityName."
        $form.Controls.Add($label)

        $countdown = New-Object System.Windows.Forms.Label
        $countdown.AutoSize = $false
        $countdown.Left = 16
        $countdown.Top = 72
        $countdown.Width = 390
        $countdown.Height = 24
        $countdown.Text = "Proceeding in $warningSeconds seconds."
        $form.Controls.Add($countdown)

        $buttonCancel = New-Object System.Windows.Forms.Button
        $buttonCancel.Text = "Cancel"
        $buttonCancel.Left = 72
        $buttonCancel.Top = 104
        $buttonCancel.Width = 84
        $form.Controls.Add($buttonCancel)

        $buttonDelay = New-Object System.Windows.Forms.Button
        $buttonDelay.Text = "Delay"
        $buttonDelay.Left = 176
        $buttonDelay.Top = 104
        $buttonDelay.Width = 84
        $form.Controls.Add($buttonDelay)

        $buttonProceed = New-Object System.Windows.Forms.Button
        $buttonProceed.Text = "Proceed Now"
        $buttonProceed.Left = 280
        $buttonProceed.Top = 104
        $buttonProceed.Width = 100
        $form.Controls.Add($buttonProceed)

        $state = [ordered]@{ decision = "countdown_elapsed"; remaining = $warningSeconds }
        $timer = New-Object System.Windows.Forms.Timer
        $timer.Interval = 1000
        $timer.Add_Tick({
            $state.remaining = [Math]::Max(0, [int]$state.remaining - 1)
            $countdown.Text = "Proceeding in $($state.remaining) seconds."
            if ($state.remaining -le 0) {
                $timer.Stop()
                $form.Close()
            }
        })
        $buttonCancel.Add_Click({ $state.decision = "cancel"; $timer.Stop(); $form.Close() })
        $buttonDelay.Add_Click({ $state.decision = "delay"; $timer.Stop(); $form.Close() })
        $buttonProceed.Add_Click({ $state.decision = "proceed_now"; $timer.Stop(); $form.Close() })

        $timer.Start()
        [void]$form.ShowDialog()
        $timer.Dispose()
        $form.Dispose()

        return [ordered]@{
            decision = [string]$state.decision
            source = "operator_popup"
            warning_seconds = $warningSeconds
            delay_ms = $delayMs
        }
    } catch {
        return [ordered]@{
            decision = "unavailable"
            source = "operator_popup"
            warning_seconds = $warningSeconds
            delay_ms = $delayMs
            error = $_.Exception.Message
        }
    }
}

function Get-OsmSendPermissionPolicy {
    $default = [ordered]@{
        schema = "narada.site.osm_send_permission_policy.v0"
        mode = "allowed"
        source = "default_missing_site_config"
        modes = @("allowed", "not_allowed", "on_operator_request_only")
        explicit_request_required = $false
        generic_continuation_phrases_do_not_authorize = @("go on", "next", "continue", "proceed", "try now", "retry")
    }

    $configPath = Join-Path $UserSiteRoot "config.json"
    if (-not (Test-Path -LiteralPath $configPath)) { return $default }

    try {
        $config = [System.IO.File]::ReadAllText($configPath) | ConvertFrom-NaradaJson
        $policyContainer = $null
        if ($config.PSObject.Properties.Name -contains "runtime_config" -and $config.runtime_config.PSObject.Properties.Name -contains "operator_surface_message_send_permission_policy") {
            $policyContainer = $config.runtime_config.operator_surface_message_send_permission_policy.current_value
        } elseif ($config.PSObject.Properties.Name -contains "structural_config" -and $config.structural_config.PSObject.Properties.Name -contains "operator_surface_message_send_permission_policy") {
            $policyContainer = $config.structural_config.operator_surface_message_send_permission_policy
        }
        if ($null -eq $policyContainer) { return $default }

        $phrases = if ($policyContainer.PSObject.Properties.Name -contains "generic_continuation_phrases_do_not_authorize") {
            @($policyContainer.generic_continuation_phrases_do_not_authorize)
        } else {
            $default.generic_continuation_phrases_do_not_authorize
        }
        return [ordered]@{
            schema = if ($policyContainer.schema) { [string]$policyContainer.schema } else { $default.schema }
            mode = if ($policyContainer.mode) { [string]$policyContainer.mode } else { $default.mode }
            source = "config.json"
            modes = if ($policyContainer.modes) { @($policyContainer.modes) } else { $default.modes }
            explicit_request_required = [bool]$policyContainer.explicit_request_required
            generic_continuation_phrases_do_not_authorize = $phrases
        }
    } catch {
        return [ordered]@{
            schema = $default.schema
            mode = $default.mode
            source = "config_json_unreadable"
            modes = $default.modes
            explicit_request_required = $default.explicit_request_required
            generic_continuation_phrases_do_not_authorize = $default.generic_continuation_phrases_do_not_authorize
            error = $_.Exception.Message
        }
    }
}

function Test-ExplicitOsmAuthority {
    if ($AuthorityBasisKind -ne "operator_direct_instruction") { return $false }
    $summary = if ($AuthorityBasisSummary) { $AuthorityBasisSummary.ToLowerInvariant() } else { "" }
    return ($summary -match "\b(osm|operator surface message|message bus|send message|send osm|handoff)\b")
}

function Test-GenericContinuationAuthority {
    param([object]$Policy)
    $summary = if ($AuthorityBasisSummary) { $AuthorityBasisSummary.Trim().ToLowerInvariant() } else { "" }
    if ([string]::IsNullOrWhiteSpace($summary)) { return $false }
    return @($Policy.generic_continuation_phrases_do_not_authorize) -contains $summary
}

function Test-OsmSendPermission {
    $policy = Get-OsmSendPermissionPolicy
    $explicitAuthorityBasis = Test-ExplicitOsmAuthority
    $genericContinuationOnly = Test-GenericContinuationAuthority -Policy $policy
    $authorityBasis = if ($AuthorityBasisKind -or $AuthorityBasisSummary) {
        [ordered]@{ kind = if ($AuthorityBasisKind) { $AuthorityBasisKind } else { $null }; summary = if ($AuthorityBasisSummary) { $AuthorityBasisSummary } else { $null } }
    } else { $null }

    if ($policy.mode -eq "allowed") {
        return [ordered]@{ allowed = $true; reason = "policy_allowed"; policy = $policy; authority_basis = $authorityBasis; evidence = [ordered]@{ policy_mode = $policy.mode; decision = "allowed"; authority_basis_kind = $AuthorityBasisKind } }
    }
    if ($policy.mode -eq "not_allowed") {
        return [ordered]@{ allowed = $false; reason = "site_policy_not_allowed"; policy = $policy; authority_basis = $authorityBasis; evidence = [ordered]@{ policy_mode = $policy.mode; decision = "refused"; refusal_before_bus_artifacts = $true } }
    }
    if ($policy.mode -eq "on_operator_request_only") {
        if (-not $explicitAuthorityBasis -or $genericContinuationOnly) {
            return [ordered]@{
                allowed = $false
                reason = if ($genericContinuationOnly) { "generic_continuation_does_not_authorize_osm_send" } else { "explicit_operator_osm_request_required" }
                policy = $policy
                authority_basis = $authorityBasis
                evidence = [ordered]@{
                    policy_mode = $policy.mode
                    decision = "refused"
                    explicit_operator_osm_request = $explicitAuthorityBasis
                    explicit_operator_osm_request_flag = [bool]$ExplicitOperatorOsmRequest
                    explicit_authority_basis = $explicitAuthorityBasis
                    generic_continuation_only = $genericContinuationOnly
                    refusal_before_bus_artifacts = $true
                }
            }
        }
        return [ordered]@{ allowed = $true; reason = "explicit_operator_osm_request_present"; policy = $policy; authority_basis = $authorityBasis; evidence = [ordered]@{ policy_mode = $policy.mode; decision = "allowed"; authority_basis_kind = $AuthorityBasisKind; explicit_operator_osm_request = $true } }
    }
    return [ordered]@{ allowed = $false; reason = "unknown_osm_send_permission_policy_mode:$($policy.mode)"; policy = $policy; authority_basis = $authorityBasis; evidence = [ordered]@{ policy_mode = $policy.mode; decision = "refused"; refusal_before_bus_artifacts = $true } }
}

if ([string]::IsNullOrWhiteSpace($IdentityName)) { throw "IdentityName is required." }
if ($null -eq $Text) { throw "Text is required." }
if ($MaxAttempts -lt 1) { throw "MaxAttempts must be >= 1." }
if ($ExpiresAfterMs -lt 1) { throw "ExpiresAfterMs must be >= 1." }

$permissionDecision = Test-OsmSendPermission
if (-not [bool]$permissionDecision.allowed) {
    $refusal = [ordered]@{
        status = "refused"
        capability = "operator_surface_message_bus"
        refusal_kind = "osm_send_permission_policy"
        reason = $permissionDecision.reason
        policy = $permissionDecision.policy
        authority_basis = $permissionDecision.authority_basis
        evidence = $permissionDecision.evidence
        no_bus_event_created = $true
        no_payload_created = $true
        no_delivery_artifact_created = $true
    }
    if ($PassThru) { $refusal | ConvertTo-Json -Depth 50 } else { Write-Host ("refused: {0}" -f $permissionDecision.reason) }
    exit 0
}

$runtimeRoot = Join-Path $PcSiteRoot "runtime\operator-surface-message-bus"
$dedupeRoot = Join-Path $runtimeRoot "dedupe"
$payloadRoot = Join-Path $runtimeRoot "payloads"
New-Item -ItemType Directory -Force -Path $runtimeRoot, $dedupeRoot, $payloadRoot | Out-Null

$script:bridgeFixtures = $null
if ($BridgeResultFixturePath) {
    $fixture = [System.IO.File]::ReadAllText($BridgeResultFixturePath) | ConvertFrom-NaradaJson
    $script:bridgeFixtures = if ($fixture.PSObject.Properties.Name -contains "attempts") { @($fixture.attempts) } else { @($fixture) }
}

$preFocusWarningConfig = Get-PreFocusWarningConfig
$script:preFocusWarningFixtureIndex = 0

if ([string]::IsNullOrWhiteSpace($DedupeKey)) {
    $DedupeKey = Get-StableHash ("{0}`n{1}`n{2}`n{3}" -f $IdentityName, $FromIdentity, $MessagePosture, $Text)
}
$dedupePath = Join-Path $dedupeRoot ((ConvertTo-SafeFileToken $DedupeKey) + ".json")
$originalText = $Text
$bridgeInlineLimit = 2000
$payloadId = New-OperatorSurfacePayloadId
$busEventId = "osmbus_{0}_{1}" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
$senderLabel = if ($FromIdentity) { $FromIdentity } else { $AssertedBy }
$compactText = @(
    "OSM payload reference: osm_payload:$payloadId@v1"
    "From: $senderLabel"
    "To: $IdentityName"
    "Content length: $($originalText.Length) chars"
    "Retrieve: operator_surface_message_bus_state bus_event_id=$busEventId."
) -join [Environment]::NewLine

if (-not $NoDedupe -and (Test-Path -LiteralPath $dedupePath)) {
    $existingPointer = [System.IO.File]::ReadAllText($dedupePath) | ConvertFrom-NaradaJson
    if ($existingPointer.event_path -and (Test-Path -LiteralPath ([string]$existingPointer.event_path))) {
        $existing = [System.IO.File]::ReadAllText([string]$existingPointer.event_path) | ConvertFrom-NaradaJson
        $terminalStates = @("delivered", "expired", "refused", "fallback_notified")
        if ($existing.delivery_state -in $terminalStates) {
            $existing | Add-Member -NotePropertyName deduped -NotePropertyValue $true -Force
            if ($PassThru) { $existing | ConvertTo-Json -Depth 50 } else { Write-Host ("{0}: deduped existing OSM bus event {1}" -f $existing.delivery_state, $existing.bus_event_id) }
            exit 0
        }
    }
}

$eventPath = Join-Path $runtimeRoot ($busEventId + ".json")
$payloadRef = New-OperatorSurfaceMessagePayloadObject `
    -PayloadRoot $payloadRoot `
    -PayloadId $payloadId `
    -OriginalText $originalText `
    -BridgeText $compactText `
    -ToIdentity $IdentityName `
    -FromIdentityName $FromIdentity `
    -AssertedPrincipal $AssertedBy `
    -Posture $MessagePosture `
    -DedupeKeyValue $DedupeKey `
    -BusEventId $busEventId `
    -BusEventPath $eventPath `
    -BridgeLimit $bridgeInlineLimit
$Text = $compactText
$startedAt = Get-Date
$expiresAt = $startedAt.AddMilliseconds($ExpiresAfterMs)
$attempts = New-Object System.Collections.Generic.List[object]

$event = [ordered]@{
    schema = "narada.operator_surfaces.message_bus.delivery.v0"
    bus_event_id = $busEventId
    started_at = $startedAt.ToString("o")
    updated_at = $startedAt.ToString("o")
    expires_at = $expiresAt.ToString("o")
    user_site_root = $UserSiteRoot
    pc_site_root = $PcSiteRoot
    identity_name = $IdentityName
    from_identity = if ($FromIdentity) { $FromIdentity } else { $null }
    asserted_by = $AssertedBy
    message_posture = $MessagePosture
    submit_strategy = $SubmitStrategy
    dedupe_key = $DedupeKey
    delivery_state = "queued_waiting_for_idle"
    delivery_states_allowed = @("delivered", "queued_waiting_for_idle", "expired", "refused", "fallback_notified")
    policy = [ordered]@{
        max_attempts = $MaxAttempts
        backoff_ms = $BackoffMs
        expires_after_ms = $ExpiresAfterMs
        idle_gate_owned_by_bus = $true
        dedupe_owned_by_bus = $true
    }
    pre_focus_warning = $preFocusWarningConfig
    attempts = @()
    final_reason = $null
    bridge_result_fixture_path = $BridgeResultFixturePath
    osm_send_permission_policy = $permissionDecision.evidence
    payload_reference = $payloadRef
    original_text = [ordered]@{
        length = $originalText.Length
        sha256 = Get-StableHash $originalText
        bridged_inline = $false
    }
}

Write-JsonFile -Path $eventPath -Value $event
Write-JsonFile -Path $dedupePath -Value ([ordered]@{ dedupe_key = $DedupeKey; event_path = $eventPath; bus_event_id = $busEventId; updated_at = (Get-Date -Format "o") })

for ($attemptNumber = 1; $attemptNumber -le $MaxAttempts; $attemptNumber++) {
    $now = Get-Date
    if ($now -gt $expiresAt) {
        $event.delivery_state = "expired"
        $event.final_reason = "expired_before_attempt"
        break
    }

    $attempt = [ordered]@{
        attempt = $attemptNumber
        attempted_at = (Get-Date -Format "o")
        state = "bridge_invoked"
        reason = "bridge_attempt_started"
        bridge_status = $null
        bridge_error = $null
        bridge_failure_reason = $null
        bridge_event_id = $null
        bridge_message_id = $null
        pre_focus_warning = $null
    }
    $attempts.Add($attempt)
    $event.attempts = @($attempts.ToArray())
    $event.delivery_state = "queued_waiting_for_idle"
    $event.final_reason = "bridge_attempt_started"
    $event.updated_at = Get-Date -Format "o"
    Write-JsonFile -Path $eventPath -Value $event

    if ([bool]$preFocusWarningConfig.enabled) {
        $warningDecision = Invoke-PreFocusWarningPrompt -Config $preFocusWarningConfig
        $attempt.pre_focus_warning = $warningDecision
        $event.pre_focus_warning_last_decision = $warningDecision
        $event.updated_at = Get-Date -Format "o"

        if ($warningDecision.decision -eq "cancel") {
            $attempt.state = "refused"
            $attempt.reason = "pre_focus_warning_cancelled"
            $event.delivery_state = "refused"
            $event.final_reason = "pre_focus_warning_cancelled"
            $event.attempts = @($attempts.ToArray())
            Write-JsonFile -Path $eventPath -Value $event
            break
        }

        if ($warningDecision.decision -eq "delay") {
            $attempt.state = "queued_waiting_for_idle"
            $attempt.reason = "pre_focus_warning_delayed"
            $event.delivery_state = "queued_waiting_for_idle"
            $event.final_reason = "pre_focus_warning_delayed"
            $event.attempts = @($attempts.ToArray())
            Write-JsonFile -Path $eventPath -Value $event

            $delayMs = [Math]::Max(0, [int]$warningDecision.delay_ms)
            if ($attemptNumber -ge $MaxAttempts -or (Get-Date).AddMilliseconds($delayMs) -gt $expiresAt) {
                $event.delivery_state = "expired"
                $event.final_reason = "pre_focus_warning_delay_expired"
                Write-JsonFile -Path $eventPath -Value $event
                break
            }
            if ($delayMs -gt 0 -and -not $DryRun -and -not $BridgeResultFixturePath) {
                Start-Sleep -Milliseconds $delayMs
            }
            continue
        }

        if ($warningDecision.decision -eq "unavailable") {
            $attempt.state = "refused"
            $attempt.reason = if ($warningDecision.error) { "pre_focus_warning_unavailable: $($warningDecision.error)" } else { "pre_focus_warning_unavailable" }
            $event.delivery_state = "refused"
            $event.final_reason = $attempt.reason
            $event.attempts = @($attempts.ToArray())
            Write-JsonFile -Path $eventPath -Value $event
            break
        }

        $attempt.reason = if ($warningDecision.decision -eq "proceed_now") { "pre_focus_warning_proceed_now" } else { "pre_focus_warning_countdown_elapsed" }
        $event.final_reason = $attempt.reason
        $event.attempts = @($attempts.ToArray())
        Write-JsonFile -Path $eventPath -Value $event
    }

    $bridgeResult = Invoke-BridgeAttempt -AttemptIndex $attemptNumber
    $classified = Get-DeliveryStateForBridgeResult -Result $bridgeResult
    $attempt.state = $classified.state
    $attempt.reason = $classified.reason
    $attempt.bridge_status = if ($bridgeResult.PSObject.Properties.Name -contains "status") { [string]$bridgeResult.status } else { $null }
    $attempt.bridge_error = if ($bridgeResult.PSObject.Properties.Name -contains "error") { [string]$bridgeResult.error } else { $null }
    $attempt.bridge_failure_reason = if ($bridgeResult.PSObject.Properties.Name -contains "failure_reason") { [string]$bridgeResult.failure_reason } else { $null }
    $attempt.bridge_event_id = if ($bridgeResult.PSObject.Properties.Name -contains "event_id") { [string]$bridgeResult.event_id } else { $null }
    $attempt.bridge_message_id = if ($bridgeResult.PSObject.Properties.Name -contains "message_id") { [string]$bridgeResult.message_id } else { $null }
    $event.attempts = @($attempts.ToArray())
    $event.updated_at = Get-Date -Format "o"

    if ($classified.state -eq "delivered" -or $classified.state -eq "fallback_notified" -or $classified.state -eq "refused") {
        $event.delivery_state = $classified.state
        $event.final_reason = $classified.reason
        Write-JsonFile -Path $eventPath -Value $event
        break
    }

    $event.delivery_state = "queued_waiting_for_idle"
    $event.final_reason = $classified.reason
    Write-JsonFile -Path $eventPath -Value $event

    if ($attemptNumber -ge $MaxAttempts -or (Get-Date).AddMilliseconds($BackoffMs) -gt $expiresAt) {
        $event.delivery_state = "expired"
        $event.final_reason = "idle_gate_expired_after_bus_owned_retries"
        Write-JsonFile -Path $eventPath -Value $event
        break
    }

    if ($BackoffMs -gt 0 -and -not $DryRun -and -not $BridgeResultFixturePath) {
        Start-Sleep -Milliseconds $BackoffMs
    }
}

$event.updated_at = Get-Date -Format "o"
$event.event_path = $eventPath
Write-JsonFile -Path $eventPath -Value $event
Write-JsonFile -Path $dedupePath -Value ([ordered]@{ dedupe_key = $DedupeKey; event_path = $eventPath; bus_event_id = $busEventId; updated_at = (Get-Date -Format "o") })

if ($PassThru) {
    $event | ConvertTo-Json -Depth 50
} else {
    Write-Host ("{0}: OSM bus event {1}. Evidence: {2}" -f $event.delivery_state, $event.bus_event_id, $eventPath)
}
