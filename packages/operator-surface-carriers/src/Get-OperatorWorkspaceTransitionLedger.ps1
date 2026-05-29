param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },
    [string]$LedgerPath,
    [string]$WorkspaceId,
    [switch]$Replay,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([string]$Json)
    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Json | ConvertFrom-Json -Depth 100 }
    return $Json | ConvertFrom-Json
}

if ([string]::IsNullOrWhiteSpace($LedgerPath)) {
    $LedgerPath = Join-Path $PcSiteRoot "runtime\operator-workspaces\zone-transition-ledger.jsonl"
}

$events = @()
if (Test-Path -LiteralPath $LedgerPath) {
    foreach ($line in Get-Content -LiteralPath $LedgerPath) {
        if ([string]::IsNullOrWhiteSpace([string]$line)) { continue }
        try {
            $event = ConvertFrom-NaradaJson ([string]$line)
        } catch {
            continue
        }
        if (-not [string]::IsNullOrWhiteSpace($WorkspaceId)) {
            $matchesWorkspace =
                ([string]$event.entered_workspace_id -eq $WorkspaceId) -or
                ([string]$event.exited_workspace_id -eq $WorkspaceId) -or
                ([string]$event.projection.workspace.workspace_id -eq $WorkspaceId)
            if (-not $matchesWorkspace) { continue }
        }
        $events += $event
    }
}

if ($Replay) {
    $currentWorkspaceId = $null
    foreach ($event in $events) {
        if (-not [string]::IsNullOrWhiteSpace([string]$event.entered_workspace_id)) {
            $currentWorkspaceId = [string]$event.entered_workspace_id
        }
    }
    $latestTransition = if (@($events).Count -gt 0) { $events[-1] } else { $null }
    $replayWorkspaceId = if ([string]::IsNullOrWhiteSpace($WorkspaceId)) { $null } else { $WorkspaceId }
    $replayedAt = Get-Date -Format "o"
    $replayRecord = [ordered]@{
        schema = "narada.operator_surfaces.operator_workspace_zone_transition_replay.v0"
        replayed_at = $replayedAt
        ledger_path = $LedgerPath
        workspace_id = $replayWorkspaceId
        transition_count = @($events).Count
        active_workspace_id = $currentWorkspaceId
        latest_transition = $latestTransition
    }
    if ($PassThru) {
        $replayRecord | ConvertTo-Json -Depth 100
    } else {
        [pscustomobject]$replayRecord
    }
    return
}

if ($PassThru) {
    $events | ConvertTo-Json -Depth 100
} else {
    [pscustomobject]@{
        schema = "narada.operator_surfaces.operator_workspace_zone_transition_ledger.v0"
        ledger_path = $LedgerPath
        transition_count = @($events).Count
        workspace_id = if ([string]::IsNullOrWhiteSpace($WorkspaceId)) { $null } else { $WorkspaceId }
    }
}
