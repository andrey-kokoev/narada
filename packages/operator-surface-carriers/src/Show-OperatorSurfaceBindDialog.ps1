# Show-OperatorSurfaceBindDialog.ps1
# Canonical wrapper/alias for the focused-window identity binding selector.
# This script delegates to Show-FocusedWindowIdentityBindingDialog.ps1 to
# preserve the documented bind-dialog command path while the focused selector owns implementation.
# See Task 215: CAPA: documented operator-surface bind selector path was stale

param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },
    [string]$AssertedBy = "operator",
    [switch]$ListIdentities
)

$ErrorActionPreference = "Stop"

$canonicalScript = Join-Path $PSScriptRoot "Show-FocusedWindowIdentityBindingDialog.ps1"
if (-not (Test-Path -LiteralPath $canonicalScript)) {
    throw "Canonical binding selector not found: $canonicalScript"
}

& $canonicalScript -UserSiteRoot $UserSiteRoot -PcSiteRoot $PcSiteRoot -AssertedBy $AssertedBy $(if ($ListIdentities) { '-ListIdentities' })
