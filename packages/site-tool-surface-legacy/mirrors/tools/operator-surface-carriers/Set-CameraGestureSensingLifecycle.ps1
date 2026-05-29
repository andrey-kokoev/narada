param(
    [ValidateSet("enable", "disable")]
    [string]$Action,

    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),

    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },

    [string]$AssertedBy = "operator",

    [switch]$DryRun,

    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertTo-NaradaJson {
    param($Value)

    $command = Get-Command ConvertTo-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Value | ConvertTo-Json -Depth 100
    }
    return $Value | ConvertTo-Json
}

function Write-JsonFile {
    param([string]$Path, [object]$Value)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, (ConvertTo-NaradaJson $Value), $utf8NoBom)
}

function Test-PythonModule {
    param([string]$Name)
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        return [ordered]@{ available = $false; error = "python_not_found" }
    }
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $python.Source -c "import importlib, sys; importlib.import_module(sys.argv[1]); print('ok')" $Name 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $oldPreference
    }
    if ($exitCode -eq 0) {
        return [ordered]@{ available = $true; version = "available" }
    }
    return [ordered]@{ available = $false; error = (($output | ForEach-Object { [string]$_ }) -join "`n") }
}

if ([string]::IsNullOrWhiteSpace($Action)) {
    throw "Action is required."
}

$runId = "camera_gesture_lifecycle_{0}_{1}" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
$eventDir = Join-Path $PcSiteRoot "runtime\camera-gesture-events\lifecycle"
$statePath = Join-Path $PcSiteRoot "runtime\camera-gesture-events\state\current.json"
$requestPath = Join-Path $PcSiteRoot "runtime\camera-gesture-events\state\requested.json"
$eventPath = Join-Path $eventDir ($runId + ".json")

$dependencies = [ordered]@{
    cv2 = Test-PythonModule "cv2"
    mediapipe = Test-PythonModule "mediapipe"
}
$depsAvailable = ($dependencies.cv2.available -eq $true -and $dependencies.mediapipe.available -eq $true)
$requestedState = if ($Action -eq "enable") { "active" } else { "inactive" }
$transitionState = if ($Action -eq "enable") { "starting" } else { "stopping" }
$finalState = if ($Action -eq "enable" -and -not $depsAvailable) { "blocked" } else { $requestedState }

$privacy = [ordered]@{
    local_processing_only = $true
    remote_video_allowed = $false
    recording_enabled = $false
    video_retained = $false
    face_recognition = $false
    identity_recognition = $false
}

$event = [ordered]@{
    schema = "narada.camera_gesture.sensing_lifecycle_event.v0"
    event_id = $runId
    occurred_at = (Get-Date -Format "o")
    asserted_by = $AssertedBy
    action = $Action
    dry_run = [bool]$DryRun
    transition_state = $transitionState
    final_state = if ($DryRun) { "planned_$finalState" } else { $finalState }
    requested_state = $requestedState
    effect_scope = "camera_gesture_sensing_lifecycle_only"
    gesture_effects_admitted = @("komorebi.focus_direction")
    dependencies = $dependencies
    idle_auto_disable_recommendation = [ordered]@{
        recommended = $true
        recommended_idle_timeout_seconds = 300
        implemented = $false
        note = "Lifecycle events record the recommendation; a managed daemon should enforce it when admitted."
    }
    privacy = $privacy
}

if (-not $DryRun) {
    Write-JsonFile -Path $requestPath -Value ([ordered]@{
        schema = "narada.camera_gesture.sensing_request.v0"
        updated_at = (Get-Date -Format "o")
        requested_state = $requestedState
        action = $Action
        event_id = $runId
        privacy = $privacy
    })
    Write-JsonFile -Path $statePath -Value ([ordered]@{
        schema = "narada.camera_gesture.active_sensing_state.v0"
        run_id = $runId
        observed_at = (Get-Date -Format "o")
        state = $finalState
        detail = [ordered]@{
            action = $Action
            requested_state = $requestedState
            blocked_reason = if ($finalState -eq "blocked") { "camera_dependencies_missing" } else { $null }
            dependencies = $dependencies
        }
        privacy = $privacy
    })
}

Write-JsonFile -Path $eventPath -Value $event
if ($PassThru) {
    ConvertTo-NaradaJson $event
} else {
    [pscustomobject]@{
        Action = $Action
        FinalState = $event.final_state
        Evidence = $eventPath
    } | Format-List
}
