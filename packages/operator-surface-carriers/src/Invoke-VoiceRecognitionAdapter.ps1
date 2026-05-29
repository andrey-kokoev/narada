param(
    [ValidateSet("local-whisper", "openai-transcriptions", "cloudflare-worker", "transcript-text", "transcript-file")]
    [string]$Adapter = "local-whisper",

    [string]$AudioFile,

    [string]$TranscriptText,

    [string]$TranscriptFile,

    [string]$OpenAiModel = "gpt-4o-mini-transcribe",

    [string]$SourceDevice = "unknown_voice_source",

    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),

    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },

    [switch]$ContinueToIntent,

    [switch]$DispatchDryRun,

    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command py -ErrorAction SilentlyContinue
}
if (-not $python) {
    throw "Python is required for voice recognition adapters."
}

$script = Join-Path $PSScriptRoot "voice_recognition_adapter.py"
if (-not (Test-Path -LiteralPath $script)) {
    throw "Voice recognition adapter implementation not found: $script"
}

$argsList = @(
    $script,
    "--adapter", $Adapter,
    "--openai-model", $OpenAiModel,
    "--source-device", $SourceDevice,
    "--user-site-root", $UserSiteRoot,
    "--pc-site-root", $PcSiteRoot
)

if ($AudioFile) { $argsList += @("--audio-file", $AudioFile) }
if ($TranscriptText) { $argsList += @("--transcript-text", $TranscriptText) }
if ($TranscriptFile) { $argsList += @("--transcript-file", $TranscriptFile) }
if ($ContinueToIntent) { $argsList += "--continue-to-intent" }
if ($DispatchDryRun) { $argsList += "--dispatch-dry-run" }

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
