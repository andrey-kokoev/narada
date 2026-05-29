param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },
    [int]$DeviceIndex = 0,
    [string]$SourceDevice = "default_camera",
    [double]$MaxSeconds = 5.0,
    [double]$MinConfidence = 0.85,
    [int]$CooldownMs = 1200,
    [ValidateSet("", "left", "right", "up", "down")]
    [string]$SelfTestDirection = "",
    [double]$SelfTestConfidence = 0.95,
    [switch]$Execute,
    [switch]$AllowKomorebiFocusDirection,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    throw "Python is required for the local camera gesture monitor."
}

$script = Join-Path $PSScriptRoot "camera_gesture_local_monitor.py"
if (-not (Test-Path -LiteralPath $script)) {
    throw "Camera gesture monitor not found: $script"
}

$argsList = @(
    $script,
    "--user-site-root", $UserSiteRoot,
    "--pc-site-root", $PcSiteRoot,
    "--device-index", $DeviceIndex,
    "--source-device", $SourceDevice,
    "--max-seconds", $MaxSeconds,
    "--min-confidence", $MinConfidence,
    "--cooldown-ms", $CooldownMs
)
if (-not [string]::IsNullOrWhiteSpace($SelfTestDirection)) {
    $argsList += @("--self-test-direction", $SelfTestDirection, "--self-test-confidence", $SelfTestConfidence)
}
if ($Execute) { $argsList += "--execute" }
if ($AllowKomorebiFocusDirection) { $argsList += "--allow-komorebi-focus-direction" }
if ($PassThru) { $argsList += "--pass-thru" }

& $python.Source @argsList
exit $LASTEXITCODE
