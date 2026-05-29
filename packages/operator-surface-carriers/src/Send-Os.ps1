param(
    [Parameter(Position = 0, Mandatory = $true)]
    [string]$To,

    [Parameter(Position = 1, Mandatory = $true)]
    [string]$Text,

    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),

    [ValidateSet("short_command", "note")]
    [string]$Posture,

    [ValidateSet("type_only", "operator_confirmed_submit", "known_surface_submit")]
    [string]$SubmitStrategy,

    [string]$FromIdentity,

    [string]$AssertedBy = "operator",

    [switch]$Submit,
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

$aliasPath = Join-Path $UserSiteRoot "operator-surfaces\input-aliases.json"
$identityPath = Join-Path $UserSiteRoot "operator-surfaces\identities.json"
$envelopeModelPath = Join-Path $UserSiteRoot "tools\operator-surface-carriers\OperatorSurfaceMessageEnvelope.Model.ps1"
if (-not (Test-Path -LiteralPath $aliasPath)) {
    throw "Operator-surface input alias file not found: $aliasPath"
}
if (-not (Test-Path -LiteralPath $identityPath)) {
    throw "Operator-surface identity registry not found: $identityPath"
}
if (-not (Test-Path -LiteralPath $envelopeModelPath)) {
    throw "Operator-surface message envelope model not found: $envelopeModelPath"
}
. $envelopeModelPath

$aliases = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($aliasPath))
$identityRegistry = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($identityPath))
$enabledAliases = @($aliases.aliases | Where-Object { $_.enabled -eq $true })
$identityAliases = @($identityRegistry.identities | ForEach-Object {
    $id = if ($_.identity_id) { [string]$_.identity_id } else { [string]$_.identity_name }
    if ([string]::IsNullOrWhiteSpace($id)) { return }
    [pscustomobject][ordered]@{
        alias = $id
        identity_name = $id
        enabled = $true
        default_posture = "short_command"
        default_submit_strategy = "known_surface_submit"
    }
})
$allAliases = @($enabledAliases + $identityAliases)
$match = @($allAliases | Where-Object {
    $_.enabled -eq $true -and (
        [string]::Equals([string]$_.alias, $To, [System.StringComparison]::OrdinalIgnoreCase) -or
        [string]::Equals([string]$_.identity_name, $To, [System.StringComparison]::Ordinal)
    )
}) | Select-Object -First 1

if (-not $match) {
    $known = @($allAliases | Where-Object { $_.enabled -eq $true } | ForEach-Object { "$($_.alias) -> $($_.identity_name)" } | Select-Object -Unique) -join ", "
    throw "Unknown operator-surface recipient: $To. Known aliases/identities: $known"
}

$identityName = [string]$match.identity_name
if ([string]::IsNullOrWhiteSpace($identityName)) {
    throw "Alias $To has no identity_name."
}

if ([string]::IsNullOrWhiteSpace($Posture)) {
    $Posture = if ($match.PSObject.Properties.Name -contains "default_posture") { [string]$match.default_posture } else { "short_command" }
}

if ($Posture -eq "short_command") {
    if ($Text.Length -gt 200) {
        throw "short_command message is too long: $($Text.Length) characters. Use -Posture note for longer non-secret text."
    }
    if ($Text -match "(\r|\n)") {
        throw "short_command message must be one line."
    }
} elseif ($Posture -eq "note") {
    if ($Text.Length -gt 2000) {
        throw "note message is too long: $($Text.Length) characters."
    }
}

if (Test-OperatorSurfaceSecretLikeText -Value $Text) {
    throw "operator_surface_secret_like_text_refused: send secrets through an admitted secret/capability path, not this bridge."
}

if ([string]::IsNullOrWhiteSpace($SubmitStrategy)) {
    if ($Submit) {
        $SubmitStrategy = if ($match.PSObject.Properties.Name -contains "default_submit_strategy") { [string]$match.default_submit_strategy } else { "known_surface_submit" }
    } else {
        $SubmitStrategy = "type_only"
    }
}

$bridge = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Send-OperatorSurfaceMessageBus.ps1"
if (-not (Test-Path -LiteralPath $bridge)) {
    throw "Operator-surface message bus not found: $bridge"
}

$args = @{
    UserSiteRoot   = $UserSiteRoot
    IdentityName   = $identityName
    Text           = $Text
    SubmitStrategy = $SubmitStrategy
    AssertedBy     = $AssertedBy
    MessagePosture = $Posture
}
if ($FromIdentity) { $args.FromIdentity = $FromIdentity }
if ($DryRun) { $args.DryRun = $true }
if ($PassThru) { $args.PassThru = $true }

& $bridge @args
