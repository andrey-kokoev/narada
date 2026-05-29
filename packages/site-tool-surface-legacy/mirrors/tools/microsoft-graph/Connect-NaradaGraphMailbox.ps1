#requires -Version 7.0
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string[]] $Scopes = @(
        'Mail.ReadWrite',
        'Mail.Send',
        'Calendars.ReadWrite'
    ),

    [string] $ExpectedUserPrincipalName = 'andrey@kokoev.name',

    [string] $TenantId,

    [switch] $UseDeviceCode,

    [switch] $InstallMissingModule,

    [switch] $PrepareOnly,

    [switch] $VerifyAccess,

    [switch] $Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string] $Message)
    [Console]::Error.WriteLine("[narada-graph] $Message")
}

function Invoke-GraphProbe {
    param(
        [string] $Name,
        [string] $Uri
    )

    Write-Step "Probing $Name with GET $Uri"
    try {
        $result = Invoke-MgGraphRequest -Method GET -Uri $Uri -ErrorAction Stop
        return [ordered] @{
            name = $Name
            status = 'ok'
            uri = $Uri
            result = $result
        }
    }
    catch {
        return [ordered] @{
            name = $Name
            status = 'error'
            uri = $Uri
            error = $_.Exception.Message
        }
    }
}

$moduleName = 'Microsoft.Graph.Authentication'
Write-Step "Checking module $moduleName"
$module = Get-Module -ListAvailable -Name $moduleName | Sort-Object Version -Descending | Select-Object -First 1

if (-not $module) {
    if (-not $InstallMissingModule) {
        throw "Missing required module $moduleName. Re-run with -InstallMissingModule to install it for CurrentUser."
    }

    Write-Step "Installing $moduleName for CurrentUser from PSGallery. This can take a few minutes on first run."
    if ($PSCmdlet.ShouldProcess($moduleName, 'Install Microsoft Graph PowerShell authentication module for CurrentUser')) {
        Install-Module $moduleName -Scope CurrentUser -Repository PSGallery -Force -AllowClobber -ErrorAction Stop
    }
    $module = Get-Module -ListAvailable -Name $moduleName | Sort-Object Version -Descending | Select-Object -First 1
}

if (-not $module) {
    throw "Module $moduleName is still unavailable after install attempt."
}

Write-Step "Importing $moduleName version $($module.Version)"
Import-Module $moduleName -ErrorAction Stop

if ($PrepareOnly) {
    $prepareReport = [ordered] @{
        schema = 'narada.microsoft_graph.mail_calendar_consent.prepare.v0'
        status = 'prepared'
        module = $moduleName
        module_version = $module.Version.ToString()
        requested_scopes = $Scopes
        next_command = "pwsh -NoProfile -File .\tools\microsoft-graph\Connect-NaradaGraphMailbox.ps1 -UseDeviceCode -VerifyAccess -Json"
        secrets_recorded = $false
    }
    if ($Json) {
        $prepareReport | ConvertTo-Json -Depth 8
    }
    else {
        "Status: prepared"
        "Module: $moduleName $($module.Version)"
        "Next: $($prepareReport.next_command)"
    }
    exit 0
}

$connectArgs = @{
    Scopes = $Scopes
    NoWelcome = $true
}

if ($TenantId) {
    $connectArgs.TenantId = $TenantId
}

if ($UseDeviceCode) {
    $connectArgs.UseDeviceCode = $true
    Write-Step 'Using device-code login. If prompted, open the displayed URL and enter the code.'
}
else {
    Write-Step 'Using default interactive login. Add -UseDeviceCode if browser login stalls.'
}

Write-Step "Requesting delegated scopes: $($Scopes -join ', ')"
if ($PSCmdlet.ShouldProcess($ExpectedUserPrincipalName, "Connect Microsoft Graph delegated session with scopes: $($Scopes -join ', ')")) {
    Connect-MgGraph @connectArgs | Out-Null
}

Write-Step 'Reading Microsoft Graph context'
$context = Get-MgContext
if (-not $context) {
    throw 'Microsoft Graph context was not established.'
}

$grantedScopes = @($context.Scopes)
$missingScopes = @($Scopes | Where-Object { $grantedScopes -notcontains $_ })

$identityProbe = Invoke-GraphProbe -Name 'me' -Uri 'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName'
$observedUserPrincipalName = $null
$observedMail = $null

if ($identityProbe.status -eq 'ok') {
    $observedUserPrincipalName = $identityProbe.result.userPrincipalName
    $observedMail = $identityProbe.result.mail
}

$identityMatches = ($observedUserPrincipalName -eq $ExpectedUserPrincipalName) -or ($observedMail -eq $ExpectedUserPrincipalName)
$probes = @($identityProbe)

if ($VerifyAccess) {
    $probes += Invoke-GraphProbe -Name 'messages' -Uri 'https://graph.microsoft.com/v1.0/me/messages?$top=1&$select=id,subject,receivedDateTime,from'
    $probes += Invoke-GraphProbe -Name 'events' -Uri 'https://graph.microsoft.com/v1.0/me/events?$top=1&$select=id,subject,start,end'
}

$status = if ($missingScopes.Count -gt 0) {
    'missing_scopes'
}
elseif (-not $identityMatches) {
    'identity_mismatch'
}
elseif ($VerifyAccess -and (@($probes | Where-Object { $_.status -ne 'ok' }).Count -gt 0)) {
    'probe_failed'
}
else {
    'ok'
}

$report = [ordered] @{
    schema = 'narada.microsoft_graph.mail_calendar_consent.v0'
    status = $status
    expected_user_principal_name = $ExpectedUserPrincipalName
    observed_user_principal_name = $observedUserPrincipalName
    observed_mail = $observedMail
    identity_matches = $identityMatches
    requested_scopes = $Scopes
    granted_scopes = $grantedScopes
    missing_scopes = $missingScopes
    auth_type = $context.AuthType
    tenant_id = $context.TenantId
    account = $context.Account
    probes = $probes
    secrets_recorded = $false
}

if ($Json) {
    $report | ConvertTo-Json -Depth 12
}
else {
    "Status: $($report.status)"
    "Expected: $ExpectedUserPrincipalName"
    "Observed UPN: $observedUserPrincipalName"
    "Observed mail: $observedMail"
    "Requested scopes: $($Scopes -join ', ')"
    "Missing scopes: $($missingScopes -join ', ')"
    foreach ($probe in $probes) {
        "Probe $($probe.name): $($probe.status)"
    }
}

if ($status -ne 'ok') {
    exit 1
}
