param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [int]$Last = 10,
    [string]$IdentityName,
    [string]$Status,
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

$labelPath = Join-Path $UserSiteRoot "operator-surfaces\window-labels.json"
if (-not (Test-Path -LiteralPath $labelPath)) {
    throw "Window label projection not found: $labelPath"
}

$labelProjection = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($labelPath))
$runtimePath = [string]$labelProjection.runtime_binding_path
$pcRoot = $null
if (-not [string]::IsNullOrWhiteSpace($runtimePath) -and (Test-Path -LiteralPath $runtimePath)) {
    $runtime = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($runtimePath))
    $pcRoot = [string]$runtime.owner_pc_site_root
}
if ([string]::IsNullOrWhiteSpace($pcRoot)) {
    $pcRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" }
}

$eventDir = Join-Path $pcRoot "runtime\operator-surface-input-events"
if (-not (Test-Path -LiteralPath $eventDir)) {
    if ($PassThru) { @() | ConvertTo-Json }
    else { Write-Host "No operator-surface input events found at $eventDir" }
    exit 0
}

$events = Get-ChildItem -LiteralPath $eventDir -Filter "*.json" -File |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object {
        try {
            $event = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($_.FullName))
            [pscustomobject]@{
                occurred_at     = $event.occurred_at
                identity_name   = $event.identity_name
                status          = $event.status
                submit_strategy = $event.submit_strategy
                submitted       = $event.submitted
                text_length     = $event.text_length
                text_preview    = $event.text_preview
                event_path      = $_.FullName
            }
        } catch {
            [pscustomobject]@{
                occurred_at     = $_.LastWriteTime.ToString("o")
                identity_name   = ""
                status          = "unreadable_event"
                submit_strategy = ""
                submitted       = $false
                text_length     = 0
                text_preview    = $_.Exception.Message
                event_path      = $_.FullName
            }
        }
    }

if (-not [string]::IsNullOrWhiteSpace($IdentityName)) {
    $events = @($events | Where-Object { $_.identity_name -eq $IdentityName })
}
if (-not [string]::IsNullOrWhiteSpace($Status)) {
    $events = @($events | Where-Object { $_.status -eq $Status })
}
$events = @($events | Select-Object -First $Last)

if ($PassThru) {
    $events | ConvertTo-Json -Depth 20
} else {
    $events | Format-Table occurred_at, identity_name, status, submit_strategy, submitted, text_length, text_preview -AutoSize
}
