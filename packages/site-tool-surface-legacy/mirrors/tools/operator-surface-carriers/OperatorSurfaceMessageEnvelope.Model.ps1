$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([string]$Json)

    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Json | ConvertFrom-Json -Depth 100
    }
    return $Json | ConvertFrom-Json
}

function Test-OperatorSurfaceSecretLikeText {
    param([string]$Value)

    $patterns = @(
        '(?i)\bpassword\s*[:=]',
        '(?i)\bpasswd\s*[:=]',
        '(?i)\bapi[_-]?key\s*[:=]',
        '(?i)\bsecret\s*[:=]',
        '(?i)\btoken\s*[:=]',
        '(?i)\bclient[_-]?secret\s*[:=]',
        '(?i)-----BEGIN [A-Z ]*PRIVATE KEY-----'
    )
    foreach ($pattern in $patterns) {
        if ($Value -match $pattern) { return $true }
    }
    return $false
}

function Get-OperatorSurfaceIdentityName {
    param([object]$Identity)

    if ($Identity.PSObject.Properties.Name -contains "identity_id" -and -not [string]::IsNullOrWhiteSpace([string]$Identity.identity_id)) {
        return [string]$Identity.identity_id
    }
    return [string]$Identity.identity_name
}

function Resolve-OperatorSurfaceSender {
    param(
        [object]$IdentityRegistry,
        [string]$AssertedBy,
        [string]$FromIdentity,
        [object]$RuntimeBindings,
        [Int64]$PreviousForegroundHwnd = 0,
        [object]$PreviousForegroundLive
    )

    $admitted = @($IdentityRegistry.identities | ForEach-Object { Get-OperatorSurfaceIdentityName -Identity $_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $authorityPrincipal = if ([string]::IsNullOrWhiteSpace($AssertedBy)) { "operator" } else { $AssertedBy }

    if (-not [string]::IsNullOrWhiteSpace($FromIdentity)) {
        $match = @($admitted | Where-Object { $_ -eq $FromIdentity }) | Select-Object -First 1
        if (-not $match) {
            throw "operator_surface_unknown_sender_identity: $FromIdentity"
        }
        return [ordered]@{
            principal = $authorityPrincipal
            identity_name = $FromIdentity
            resolution = "explicit_admitted_identity"
            resolution_evidence = [ordered]@{
                source = "FromIdentity"
                admitted = $true
            }
        }
    }

    $assertedIdentity = @($admitted | Where-Object { $_ -eq $AssertedBy }) | Select-Object -First 1
    if ($assertedIdentity) {
        return [ordered]@{
            principal = $AssertedBy
            identity_name = $assertedIdentity
            resolution = "asserted_by_admitted_identity"
            resolution_evidence = [ordered]@{
                source = "AssertedBy"
                admitted = $true
            }
        }
    }

    if ([string]::IsNullOrWhiteSpace($AssertedBy)) {
        throw "operator_surface_sender_principal_required"
    }

    [ordered]@{
        principal = $authorityPrincipal
        identity_name = $null
        resolution = "explicit_principal"
        resolution_evidence = [ordered]@{
            source = "explicit_sender_context"
            hwnd = if ($PreviousForegroundHwnd -gt 0) { $PreviousForegroundHwnd } else { $null }
            status = "unresolved"
            reason = "sender_identity_not_supplied"
            previous_foreground_ignored = $true
        }
    }
}

function Get-OperatorSurfaceSha256Hex {
    param([string]$Value)

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
    -join ($hash | ForEach-Object { $_.ToString("x2") })
}

function New-OperatorSurfaceMessageEnvelope {
    param(
        [string]$MessageId,
        [string]$EventId,
        [object]$Sender,
        [string]$ToIdentity,
        [string]$AssertedBy,
        [string]$Posture,
        [string]$Kind = "operator_surface_message",
        [string]$SentAt,
        [string]$DeliveryChannel,
        [string]$EvidencePath,
        [string]$BodyText
    )

    if ([string]::IsNullOrWhiteSpace($MessageId)) { throw "message_id_required" }
    if ([string]::IsNullOrWhiteSpace($EventId)) { throw "event_id_required" }
    if ([string]::IsNullOrWhiteSpace($ToIdentity)) { throw "to_identity_required" }
    if ([string]::IsNullOrWhiteSpace($Posture)) { $Posture = "short_command" }
    if ([string]::IsNullOrWhiteSpace($SentAt)) { $SentAt = Get-Date -Format "o" }
    if ([string]::IsNullOrWhiteSpace($DeliveryChannel)) { $DeliveryChannel = "windows_terminal_clipboard_sendkeys" }

    $senderOperatorSurface = [ordered]@{
        identity_name = $Sender.identity_name
        resolution = $Sender.resolution
        resolution_evidence = $Sender.resolution_evidence
    }

    $authorityPrincipal = if ([string]::IsNullOrWhiteSpace($AssertedBy)) { "operator" } else { $AssertedBy }

    [ordered]@{
        schema = "narada.operator_surfaces.delivered_message.v1"
        version = 1
        message_id = $MessageId
        event_id = $EventId
        kind = $Kind
        posture = $Posture
        sent_at = $SentAt
        sender_operator_surface = $senderOperatorSurface
        authorized_by = [ordered]@{
            principal = $authorityPrincipal
        }
        target_operator_surface = [ordered]@{
            identity_name = $ToIdentity
        }
        compatibility = [ordered]@{
            v0_aliases_present = $true
            v0_aliases_deprecated = $true
        }
        from = $Sender
        to = [ordered]@{
            identity_name = $ToIdentity
        }
        asserted_by = $authorityPrincipal
        authority = [ordered]@{
            principal = $authorityPrincipal
        }
        delivery = [ordered]@{
            channel = $DeliveryChannel
            evidence_path = $EvidencePath
        }
        body = [ordered]@{
            encoding = "plain_text"
            length = $BodyText.Length
            sha256 = Get-OperatorSurfaceSha256Hex -Value $BodyText
        }
    }
}

function Format-OperatorSurfaceDeliveredMessage {
    param(
        [string]$BodyText,
        [object]$Envelope
    )

    $json = $Envelope | ConvertTo-Json -Depth 20 -Compress
    "{0}`n`n[OSM {1}]" -f $BodyText, $json
}
