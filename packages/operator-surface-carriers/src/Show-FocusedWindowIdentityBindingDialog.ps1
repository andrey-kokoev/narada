param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },
    [string]$AssertedBy = "operator",
    [switch]$ListIdentities
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
if (-not (Test-Path -LiteralPath $identityPath)) {
    throw "Identity registry not found: $identityPath"
}

$registry = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($identityPath))

function Get-CanonicalIdentityLabel {
    param([object]$Identity, [object]$Registry)
    $site = [string]$Identity.site_id
    $agent = [string]$Identity.agent_name
    $role = [string]$Identity.role
    $roleLabel = if ($Registry.roles -and $Registry.roles.$role -and $Registry.roles.$role.label) { $Registry.roles.$role.label } else { $role }
    if ($role -and $agent -ne $role -and $agent -ne $roleLabel) {
        return "$site - $agent - $roleLabel"
    }
    return "$site - $agent"
}

$identityOptions = @($registry.identities | Where-Object {
    -not ($_.deprecated -eq $true)
} | ForEach-Object {
    $id = [string]$_.identity_id
    [PSCustomObject]@{
        identity_id = $id
        label       = (Get-CanonicalIdentityLabel -Identity $_ -Registry $registry)
    }
} | Sort-Object label)

if ($identityOptions.Count -eq 0) {
    throw "No admitted operator-surface identities found in $identityPath"
}

if ($ListIdentities) {
    $identityOptions | ForEach-Object { Write-Output ("{0} | {1}" -f $_.identity_id, $_.label) }
    exit 0
}

# --- Safety warning before entering bind mode ---
Write-Host "WARNING: The binding dialog will capture mouse input globally." -ForegroundColor Yellow
Write-Host "         Press Escape or right-click to cancel at any time." -ForegroundColor Yellow
Write-Host "         Bind mode auto-cancels after 30 seconds." -ForegroundColor Yellow
$ack = Read-Host "Type 'ok' to proceed"
if ($ack -ne 'ok') {
    Write-Host "Binding cancelled by operator."
    exit 0
}

# --- Delegate to Rust overlay bind mode ---

$overlayDir = Join-Path $UserSiteRoot "tools\window-surface-overlay"
$releaseBinary = Join-Path $overlayDir "target\release\narada-window-surface-overlay.exe"
$debugBinary = Join-Path $overlayDir "target\debug\narada-window-surface-overlay.exe"

$binary = if (Test-Path -LiteralPath $releaseBinary) {
    $releaseBinary
} elseif (Test-Path -LiteralPath $debugBinary) {
    $debugBinary
} else {
    throw "Overlay binary not found. Expected one of: $releaseBinary, $debugBinary. Run 'cargo build --release' in $overlayDir."
}

$configPath = Join-Path $UserSiteRoot "operator-surfaces\window-labels.json"
$args = @()
if (Test-Path -LiteralPath $configPath) {
    $args += "--config"
    $args += $configPath
}
$args += "bind"

& $binary @args
