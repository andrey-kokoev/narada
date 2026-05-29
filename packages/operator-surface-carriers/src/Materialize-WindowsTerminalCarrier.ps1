param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$IdentityName,
    [string]$SettingsPath = "$env:LOCALAPPDATA\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json"
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

$identityPath = Join-Path $UserSiteRoot "operator-surfaces\identities.json"
$registry = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($identityPath))
if ([string]::IsNullOrWhiteSpace($IdentityName)) {
    $admitted = @($registry.identities | ForEach-Object { $_.identity_name }) -join ", "
    throw "IdentityName is required. Pass -IdentityName with one admitted identity from $identityPath. Admitted identities: $admitted"
}

$identity = @($registry.identities | Where-Object { $_.identity_name -eq $IdentityName }) | Select-Object -First 1
if (-not $identity) {
    $admitted = @($registry.identities | ForEach-Object { $_.identity_name }) -join ", "
    throw "Identity not found in registry: $IdentityName. Admitted identities: $admitted"
}

$wt = $identity.carrier_projections.windows_terminal
if (-not $wt) {
    throw "Identity has no Windows Terminal carrier projection: $IdentityName"
}

if (-not (Test-Path -LiteralPath $SettingsPath)) {
    throw "Windows Terminal settings not found: $SettingsPath"
}

$settingsText = [System.IO.File]::ReadAllText($SettingsPath)
$settings = ConvertFrom-NaradaJson $settingsText
if (-not $settings.profiles) {
    $settings | Add-Member -MemberType NoteProperty -Name profiles -Value ([pscustomobject]@{ defaults = [pscustomobject]@{}; list = @() })
}
if (-not $settings.profiles.list) {
    $settings.profiles | Add-Member -Force -MemberType NoteProperty -Name list -Value @()
}

$profile = @($settings.profiles.list | Where-Object {
    $_.guid -eq $wt.profile_guid -or $_.name -eq $wt.profile_name
}) | Select-Object -First 1

if (-not $profile) {
    $profile = [pscustomobject]@{}
    $settings.profiles.list += $profile
}

$profile | Add-Member -Force -MemberType NoteProperty -Name guid -Value ([string]$wt.profile_guid)
$profile | Add-Member -Force -MemberType NoteProperty -Name hidden -Value $false
$profile | Add-Member -Force -MemberType NoteProperty -Name name -Value ([string]$wt.profile_name)
$profile | Add-Member -Force -MemberType NoteProperty -Name commandline -Value ([string]$wt.commandline)
$profile | Add-Member -Force -MemberType NoteProperty -Name startingDirectory -Value ([string]$wt.startingDirectory)
$profile | Add-Member -Force -MemberType NoteProperty -Name suppressApplicationTitle -Value ([bool]$wt.suppressApplicationTitle)
$profile | Add-Member -Force -MemberType NoteProperty -Name tabTitle -Value ([string]$wt.tabTitle)

$backupPath = "$SettingsPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $SettingsPath -Destination $backupPath

$json = $settings | ConvertTo-Json -Depth 100
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($SettingsPath, $json, $utf8NoBom)

$logDir = if ($env:NARADA_PC_SITE_ROOT) { Join-Path $env:NARADA_PC_SITE_ROOT "logs\operator-surface-carriers" } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\logs\operator-surface-carriers" }
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$diag = [ordered]@{
    timestamp     = (Get-Date -Format "o")
    identity_name = [string]$identity.identity_name
    settings_path = $SettingsPath
    backup_path   = $backupPath
    profile_guid  = [string]$wt.profile_guid
    profile_name  = [string]$wt.profile_name
    tabTitle      = [string]$wt.tabTitle
}
$diagPath = Join-Path $logDir ("windows-terminal-carrier-{0}.json" -f ($IdentityName -replace '[^A-Za-z0-9_.-]', '_'))
$diag | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -Path $diagPath

Write-Host "Materialized Windows Terminal carrier for $IdentityName"
Write-Host "Settings backup: $backupPath"
Write-Host "Diagnostics: $diagPath"
