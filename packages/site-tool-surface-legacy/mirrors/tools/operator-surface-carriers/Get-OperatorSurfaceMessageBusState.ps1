param(
    [string]$PcSiteRoot = $(if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" }),
    [string]$BusEventId,
    [string]$DedupeKey,
    [int]$Latest = 10,
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

function ConvertTo-SafeFileToken {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return "empty" }
    return ($Value -replace "[^A-Za-z0-9_.-]", "_")
}

function Repair-ExpiredQueuedEvent {
    param([object]$Event, [string]$Path)

    if (-not $Event) { return $Event }
    $state = if ($Event.PSObject.Properties.Name -contains "delivery_state") { [string]$Event.delivery_state } else { "" }
    $expiresRaw = if ($Event.PSObject.Properties.Name -contains "expires_at") { [string]$Event.expires_at } else { "" }
    $attempts = @($Event.attempts)
    $attemptCount = $attempts.Count
    if ($state -ne "queued_waiting_for_idle" -or [string]::IsNullOrWhiteSpace($expiresRaw)) { return $Event }

    $expiresAt = [datetime]::MinValue
    if (-not [datetime]::TryParse($expiresRaw, [ref]$expiresAt)) { return $Event }
    if ((Get-Date) -le $expiresAt) { return $Event }

    $lastAttempt = if ($attemptCount -gt 0) { $attempts[$attemptCount - 1] } else { $null }
    $lastState = if ($lastAttempt -and $lastAttempt.PSObject.Properties.Name -contains "state") { [string]$lastAttempt.state } else { "" }
    if ($attemptCount -gt 0 -and $lastState -ne "bridge_invoked") { return $Event }

    $Event.delivery_state = "expired"
    $Event.final_reason = if ($attemptCount -eq 0) { "idle_gate_expired_without_attempt_recovered_by_state_reader" } else { "bridge_attempt_started_without_result_recovered_by_state_reader" }
    $Event.updated_at = Get-Date -Format "o"
    $Event | Add-Member -NotePropertyName recovered_from_zero_attempt_idle_queue -NotePropertyValue ($attemptCount -eq 0) -Force
    $Event | Add-Member -NotePropertyName recovered_from_started_attempt_without_result -NotePropertyValue ($attemptCount -gt 0) -Force
    if (-not [string]::IsNullOrWhiteSpace($Path)) {
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText($Path, ($Event | ConvertTo-Json -Depth 50), $utf8NoBom)
    }
    return $Event
}

function Read-BusEventFile {
    param([string]$Path)
    $event = [System.IO.File]::ReadAllText($Path) | ConvertFrom-NaradaJson
    return Repair-ExpiredQueuedEvent -Event $event -Path $Path
}

function Read-MessagePayload {
    param([string]$Ref, [string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return [ordered]@{
            status = "refused"
            reason = "payload_path_missing_from_bus_event"
            payload_ref = $Ref
        }
    }

    $resolvedPayloadRoot = [System.IO.Path]::GetFullPath($payloadRoot)
    $resolvedPayloadPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $resolvedPayloadPath.StartsWith($resolvedPayloadRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        return [ordered]@{
            status = "refused"
            reason = "payload_path_outside_message_bus_payload_root"
            payload_ref = $Ref
            payload_root = $resolvedPayloadRoot
        }
    }
    if (-not (Test-Path -LiteralPath $resolvedPayloadPath)) {
        return [ordered]@{
            status = "not_found"
            reason = "payload_not_found"
            payload_ref = $Ref
            payload_path = $resolvedPayloadPath
        }
    }

    $payload = [System.IO.File]::ReadAllText($resolvedPayloadPath) | ConvertFrom-NaradaJson
    return [ordered]@{
        status = "found"
        payload_ref = if ($Ref) { $Ref } else { [string]$payload.payload_ref }
        payload_path = $resolvedPayloadPath
        payload = $payload
    }
}

function Add-PayloadContentToEvent {
    param([object]$Event)

    if (-not $Event) { return $Event }
    $payloadReference = if ($Event.PSObject.Properties.Name -contains "payload_reference") { $Event.payload_reference } else { $null }
    if (-not $payloadReference) { return $Event }
    $payloadRef = if ($payloadReference.PSObject.Properties.Name -contains "payload_ref") { [string]$payloadReference.payload_ref } else { $null }
    $payloadPath = if ($payloadReference.PSObject.Properties.Name -contains "payload_path") { [string]$payloadReference.payload_path } else { $null }
    $payloadContent = Read-MessagePayload -Ref $payloadRef -Path $payloadPath
    $Event | Add-Member -NotePropertyName payload_content -NotePropertyValue $payloadContent -Force
    return $Event
}

$runtimeRoot = Join-Path $PcSiteRoot "runtime\operator-surface-message-bus"
$dedupeRoot = Join-Path $runtimeRoot "dedupe"
$payloadRoot = Join-Path $runtimeRoot "payloads"

if (-not (Test-Path -LiteralPath $runtimeRoot)) {
    $result = [ordered]@{
        schema = "narada.operator_surfaces.message_bus.state_query.v0"
        status = "empty"
        runtime_root = $runtimeRoot
        events = @()
    }
    if ($PassThru) { $result | ConvertTo-Json -Depth 20 } else { Write-Host "No OSM bus state." }
    exit 0
}

$events = @()
if ($BusEventId) {
    $path = Join-Path $runtimeRoot ($BusEventId + ".json")
    if (Test-Path -LiteralPath $path) {
        $events = @(Read-BusEventFile -Path $path)
    }
} elseif ($DedupeKey) {
    $dedupePath = Join-Path $dedupeRoot ((ConvertTo-SafeFileToken $DedupeKey) + ".json")
    if (Test-Path -LiteralPath $dedupePath) {
        $pointer = [System.IO.File]::ReadAllText($dedupePath) | ConvertFrom-NaradaJson
        if ($pointer.event_path -and (Test-Path -LiteralPath ([string]$pointer.event_path))) {
            $events = @(Read-BusEventFile -Path ([string]$pointer.event_path))
        }
    }
} else {
    $events = @(Get-ChildItem -LiteralPath $runtimeRoot -Filter "osmbus_*.json" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First $Latest |
        ForEach-Object { Read-BusEventFile -Path $_.FullName })
}

$events = @($events | ForEach-Object { Add-PayloadContentToEvent -Event $_ })

$result = [ordered]@{
    schema = "narada.operator_surfaces.message_bus.state_query.v0"
    status = if (@($events).Count -gt 0) { "found" } else { "not_found" }
    runtime_root = $runtimeRoot
    payload_root = $payloadRoot
    events = @($events)
}

if ($PassThru) {
    $result | ConvertTo-Json -Depth 50
} else {
    @($events) | Select-Object bus_event_id, identity_name, delivery_state, final_reason, updated_at | Format-Table -AutoSize
}
