param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },
    [string]$ExpectedIdentity
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

$runtimePath = Join-Path $PcSiteRoot "runtime\operator-surface-window-bindings.json"
if (-not (Test-Path -LiteralPath $runtimePath)) {
    Write-Host "No runtime binding file found. Nothing to verify." -ForegroundColor Yellow
    exit 0
}

$runtime = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($runtimePath))
$bindings = @($runtime.bindings)
if ($bindings.Count -eq 0) {
    Write-Host "No bindings in runtime file." -ForegroundColor Yellow
    exit 0
}

# Show the most recent binding (last in the array)
$latest = $bindings | Select-Object -Last 1
Write-Host "Latest binding:"
Write-Host "  HWND:        $($latest.hwnd)"
Write-Host "  Identity:    $($latest.identity_name)"
Write-Host "  Asserted by: $($latest.asserted_by)"
Write-Host "  Method:      $($latest.assertion_method)"
Write-Host "  Process:     $($latest.observed_process)"
Write-Host "  Class:       $($latest.observed_class)"
Write-Host "  Title:       $($latest.observed_title)"

if ($ExpectedIdentity) {
    if ($latest.identity_name -eq $ExpectedIdentity) {
        Write-Host "POSTCONDITION PASS: bound identity matches expected '$ExpectedIdentity'" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "POSTCONDITION FAIL: bound identity '$($latest.identity_name)' does not match expected '$ExpectedIdentity'" -ForegroundColor Red
        Write-Host "Run Show-FocusedWindowIdentityBindingDialog.ps1 to rebind, or edit the binding file through sanctioned machinery."
        exit 1
    }
}

$confirm = Read-Host "Is this binding correct? (y/n)"
if ($confirm -ne 'y') {
    Write-Host "Binding rejected by operator. Re-run Show-FocusedWindowIdentityBindingDialog.ps1 to correct." -ForegroundColor Red
    exit 1
}

Write-Host "Binding confirmed." -ForegroundColor Green
