param(
    [int]$DurationSeconds = 30,

    [double]$Threshold = 0.020,

    [int]$SpeechStartMs = 180,

    [int]$SilenceEndMs = 700,

    [int]$PreRollMs = 400,

    [int]$PostRollMs = 500,

    [int]$SampleRate = 16000,

    [int]$FrameMs = 50,

    [string]$Device,

    [string]$InputWav,

    [string]$TranscriptText,

    [string]$TranscriptFile,

    [ValidateSet("none", "local-whisper", "openai-transcriptions", "cloudflare-worker")]
    [string]$RecognitionAdapter = "none",

    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),

    [string]$PcSiteRoot = $(if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" }),

    [switch]$SelfTestSynthetic,

    [switch]$CheckLiveAudio,

    [switch]$Calibrate,

    [switch]$DispatchDryRun,

    [switch]$RetainAudio,

    [switch]$DisableDebugAudioCues,

    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command py -ErrorAction SilentlyContinue
}
if (-not $python) {
    throw "Python is required for the local voice intent monitor."
}

$script = Join-Path $PSScriptRoot "voice_intent_local_monitor.py"
if (-not (Test-Path -LiteralPath $script)) {
    throw "Voice intent local monitor implementation not found: $script"
}

$argsList = @(
    $script,
    "--duration-seconds", $DurationSeconds,
    "--threshold", $Threshold,
    "--speech-start-ms", $SpeechStartMs,
    "--silence-end-ms", $SilenceEndMs,
    "--pre-roll-ms", $PreRollMs,
    "--post-roll-ms", $PostRollMs,
    "--sample-rate", $SampleRate,
    "--frame-ms", $FrameMs,
    "--user-site-root", $UserSiteRoot,
    "--pc-site-root", $PcSiteRoot
)

if ($Device) { $argsList += @("--device", $Device) }
if ($InputWav) { $argsList += @("--input-wav", $InputWav) }
if ($TranscriptText) { $argsList += @("--transcript-text", $TranscriptText) }
if ($TranscriptFile) { $argsList += @("--transcript-file", $TranscriptFile) }
if ($RecognitionAdapter -ne "none") { $argsList += @("--recognition-adapter", $RecognitionAdapter) }
if ($SelfTestSynthetic) { $argsList += "--self-test-synthetic" }
if ($CheckLiveAudio) { $argsList += "--check-live-audio" }
if ($Calibrate) { $argsList += "--calibrate" }
if ($DispatchDryRun) { $argsList += "--dispatch-dry-run" }
if ($RetainAudio) { $argsList += "--retain-audio" }
if ($DisableDebugAudioCues) { $argsList += "--debug-audio-cues=disabled" }

$output = & $python.Source @argsList
$exitCode = $LASTEXITCODE

if ($PassThru) {
    $output
} else {
    $output | ConvertFrom-Json -Depth 100 | Format-List
}

if ($exitCode -ne 0) {
    exit $exitCode
}
