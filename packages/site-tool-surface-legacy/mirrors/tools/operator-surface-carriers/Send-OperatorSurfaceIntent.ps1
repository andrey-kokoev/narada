param(
    [Parameter(Position = 0, Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]]$Words,

    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),

    [string]$AssertedBy = "operator",

    [switch]$DryRun,
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

function Normalize-IntentText {
    param([string]$Value)
    ((($Value -replace '\s+', ' ').Trim()) -replace '^[\.,;:!\?"''\(\)\[\]\{\}]+|[\.,;:!\?"''\(\)\[\]\{\}]+$', '').ToLowerInvariant()
}

function Assert-OperatorSurfaceCapability {
    param(
        [string]$UserSiteRoot,
        [string]$CapabilityId
    )

    $path = Join-Path $UserSiteRoot "operator-surfaces\capability-announcements.json"
    if (-not (Test-Path -LiteralPath $path)) {
        throw "$CapabilityId capability announcement not found: $path"
    }
    $announcements = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($path))
    $capability = @($announcements.capabilities | Where-Object {
        $_.capability_id -eq $CapabilityId -and $_.status -eq "locally_admitted"
    }) | Select-Object -First 1
    if (-not $capability) {
        throw "$CapabilityId is not locally admitted."
    }
}

function Get-EnabledAliases {
    param([string]$UserSiteRoot)

    $path = Join-Path $UserSiteRoot "operator-surfaces\input-aliases.json"
    $identityPath = Join-Path $UserSiteRoot "operator-surfaces\identities.json"
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Operator-surface input alias file not found: $path"
    }
    if (-not (Test-Path -LiteralPath $identityPath)) {
        throw "Operator-surface identity registry not found: $identityPath"
    }
    $aliases = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($path))
    $enabledAliases = @($aliases.aliases | Where-Object { $_.enabled -eq $true })
    $identities = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($identityPath))
    $identityAliases = @($identities.identities | ForEach-Object {
        [pscustomobject][ordered]@{
            alias = [string]$_.identity_name
            identity_name = [string]$_.identity_name
            enabled = $true
            default_posture = "short_command"
            default_submit_strategy = "known_surface_submit"
        }
    })
    @($enabledAliases + $identityAliases)
}

function Resolve-TargetPrefix {
    param(
        [string[]]$Tokens,
        [object[]]$Aliases
    )

    $candidates = New-Object System.Collections.Generic.List[object]
    for ($length = $Tokens.Count; $length -ge 1; $length--) {
        $prefix = ($Tokens[0..($length - 1)] -join " ")
        $normalizedPrefix = Normalize-IntentText $prefix
        foreach ($alias in $Aliases) {
            $aliasText = [string]$alias.alias
            $identityName = [string]$alias.identity_name
            if ((Normalize-IntentText $aliasText) -eq $normalizedPrefix -or (Normalize-IntentText $identityName) -eq $normalizedPrefix) {
                $candidates.Add([pscustomobject][ordered]@{
                    alias = $aliasText
                    identity_name = $identityName
                    token_count = $length
                })
            }
        }
        if ($candidates.Count -gt 0) { break }
    }

    $uniqueIdentities = @($candidates | Select-Object -ExpandProperty identity_name -Unique)
    if ($uniqueIdentities.Count -gt 1) {
        $descriptions = @($candidates | ForEach-Object { "$($_.alias) -> $($_.identity_name)" }) -join ", "
        throw "ambiguous_operator_surface_target: $descriptions"
    }
    if ($candidates.Count -gt 1 -and $uniqueIdentities.Count -eq 1) {
        return $candidates[0]
    }
    if ($candidates.Count -eq 1) {
        return $candidates[0]
    }
    return $null
}

$aliases = @(Get-EnabledAliases -UserSiteRoot $UserSiteRoot)

if ($Words.Count -lt 2) {
    throw "intent_too_short: use `focus <target>`, `nudge <target>` or `tell <target> <message>`."
}

$verb = (Normalize-IntentText $Words[0])
$target = $null
$message = $null
$submit = $true

if ($verb -eq "nudge") {
    Assert-OperatorSurfaceCapability -UserSiteRoot $UserSiteRoot -CapabilityId "operator_surface_message_passing"
    $target = Resolve-TargetPrefix -Tokens $Words[1..($Words.Count - 1)] -Aliases $aliases
    if (-not $target) {
        throw "unknown_operator_surface_target: $($Words[1..($Words.Count - 1)] -join ' ')"
    }
    $message = "next"
} elseif ($verb -eq "tell") {
    Assert-OperatorSurfaceCapability -UserSiteRoot $UserSiteRoot -CapabilityId "operator_surface_message_passing"
    if ($Words.Count -lt 3) {
        throw "intent_too_short: use `tell <target> <message>`."
    }
    $remaining = $Words[1..($Words.Count - 1)]
    $target = Resolve-TargetPrefix -Tokens $remaining -Aliases $aliases
    if (-not $target) {
        throw "unknown_operator_surface_target: $($remaining -join ' ')"
    }
    $messageTokens = @($remaining | Select-Object -Skip ([int]$target.token_count))
    if ($messageTokens.Count -eq 0) {
        throw "empty_operator_surface_message"
    }
    $message = $messageTokens -join " "
} elseif ($verb -eq "focus") {
    Assert-OperatorSurfaceCapability -UserSiteRoot $UserSiteRoot -CapabilityId "operator_surface_focus"
    $target = Resolve-TargetPrefix -Tokens $Words[1..($Words.Count - 1)] -Aliases $aliases
    if (-not $target) {
        throw "unknown_operator_surface_target: $($Words[1..($Words.Count - 1)] -join ' ')"
    }
} else {
    throw "unsupported_operator_surface_intent: $verb. Supported intents: focus, nudge, tell."
}

if ($verb -eq "focus") {
    $focusIdentity = Join-Path $UserSiteRoot "tools\operator-surface-carriers\windows-glue\Focus-OperatorSurfaceIdentity.ps1"
    if (-not (Test-Path -LiteralPath $focusIdentity)) {
        throw "Focus-OperatorSurfaceIdentity.ps1 not found: $focusIdentity"
    }
    $args = @{
        UserSiteRoot = $UserSiteRoot
        IdentityName = [string]$target.identity_name
        AssertedBy = $AssertedBy
    }
    if ($DryRun) { $args.DryRun = $true }
    if ($PassThru) { $args.PassThru = $true }
    & $focusIdentity @args
    exit $LASTEXITCODE
}

$sendOs = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Send-Os.ps1"
if (-not (Test-Path -LiteralPath $sendOs)) {
    throw "Send-Os wrapper not found: $sendOs"
}

$args = @{
    UserSiteRoot = $UserSiteRoot
    To = [string]$target.identity_name
    Text = $message
    Posture = "short_command"
    AssertedBy = $AssertedBy
}
if ($submit) { $args.Submit = $true }
if ($DryRun) { $args.DryRun = $true }
if ($PassThru) { $args.PassThru = $true }

& $sendOs @args
