param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = "",
    [ValidateSet("status", "start", "restart")]
    [string]$Mode = "restart",
    [string]$WhkdConfigPath = "$env:USERPROFILE\.config\whkdrc",
    [string]$WhkdExecutablePath,
    [int]$ProcessCountBeforeFixture = -1,
    [int]$ProcessCountAfterFixture = -1,
    [string]$MutatingAuthorized,
    [switch]$DryRun,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($PcSiteRoot)) {
    $PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" }
}

function ConvertFrom-NaradaJson {
    param([string]$Json)
    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Json | ConvertFrom-Json -Depth 100 }
    return $Json | ConvertFrom-Json
}

function Get-NaradaWhkdProcesses {
    param([int]$FixtureCount)

    if ($FixtureCount -ge 0) {
        return @(for ($i = 0; $i -lt $FixtureCount; $i++) {
            [pscustomobject]@{
                Id = 20000 + $i
                ProcessName = "whkd"
                Fixture = $true
            }
        })
    }

    @(Get-Process whkd -ErrorAction SilentlyContinue)
}

function Resolve-NaradaWhkdExecutable {
    param([string]$ExplicitPath)

    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        if (-not (Test-Path -LiteralPath $ExplicitPath)) { throw "whkd_executable_not_found: $ExplicitPath" }
        return $ExplicitPath
    }

    $command = Get-Command whkd -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $scoopPath = Join-Path $env:USERPROFILE "scoop\shims\whkd.exe"
    if (Test-Path -LiteralPath $scoopPath) { return $scoopPath }

    throw "whkd_executable_not_found"
}

function Write-NaradaJsonFile {
    param([string]$Path, [object]$Value)

    $dir = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $json = $Value | ConvertTo-Json -Depth 80
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

$mutating = $Mode -in @("start", "restart")
if ($mutating -and -not $DryRun -and [string]::IsNullOrWhiteSpace($MutatingAuthorized)) {
    throw "mutating_whkd_supervision_requires_-MutatingAuthorized"
}

$configPresent = Test-Path -LiteralPath $WhkdConfigPath
$beforeProcesses = @(Get-NaradaWhkdProcesses -FixtureCount $ProcessCountBeforeFixture)
$whkdExe = Resolve-NaradaWhkdExecutable -ExplicitPath $WhkdExecutablePath
$plan = [ordered]@{
    stop_existing = $Mode -eq "restart"
    start_hidden = $Mode -in @("start", "restart")
    executable = $whkdExe
    config_path = $WhkdConfigPath
    arguments = @("-c", $WhkdConfigPath)
}

$touchedProcessIds = New-Object System.Collections.Generic.List[int]
if ($mutating -and -not $DryRun) {
    if ($Mode -eq "restart") {
        foreach ($process in $beforeProcesses) {
            $touchedProcessIds.Add([int]$process.Id)
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 300
    }

    Start-Process -FilePath $whkdExe -ArgumentList @("-c", $WhkdConfigPath) -WindowStyle Hidden | Out-Null
    Start-Sleep -Milliseconds 500
}

$afterProcesses = if ($ProcessCountAfterFixture -ge 0) {
    @(Get-NaradaWhkdProcesses -FixtureCount $ProcessCountAfterFixture)
} elseif ($DryRun -or -not $mutating) {
    @(Get-NaradaWhkdProcesses -FixtureCount $ProcessCountBeforeFixture)
} else {
    @(Get-NaradaWhkdProcesses -FixtureCount -1)
}

$event = [ordered]@{
    schema = "narada.operator_surfaces.whkd_supervision_event.v0"
    occurred_at = Get-Date -Format "o"
    user_site_root = $UserSiteRoot
    pc_site_root = $PcSiteRoot
    mode = $Mode
    mutates = [bool]($mutating -and -not $DryRun)
    dry_run = [bool]$DryRun
    mutation_authorized = -not [string]::IsNullOrWhiteSpace($MutatingAuthorized)
    authorized_by = if ([string]::IsNullOrWhiteSpace($MutatingAuthorized)) { $null } else { $MutatingAuthorized }
    config_present = [bool]$configPresent
    before = [ordered]@{
        process_count = $beforeProcesses.Count
        process_ids = @($beforeProcesses | ForEach-Object { [int]$_.Id })
    }
    plan = $plan
    touched_process_ids = @($touchedProcessIds)
    after = [ordered]@{
        process_count = $afterProcesses.Count
        process_ids = @($afterProcesses | ForEach-Object { [int]$_.Id })
    }
    readiness = [ordered]@{
        daemon_running = $afterProcesses.Count -gt 0
        config_present = [bool]$configPresent
        ready = ($afterProcesses.Count -gt 0) -and $configPresent
    }
}

$logDir = Join-Path $PcSiteRoot "runtime\whkd-supervision"
$eventPath = Join-Path $logDir ("whkd_{0}_{1}.json" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8)))
Write-NaradaJsonFile -Path $eventPath -Value $event
$event["evidence_path"] = $eventPath

if ($PassThru) {
    $event | ConvertTo-Json -Depth 80
} else {
    [pscustomobject]@{
        Mode = $Mode
        Mutates = [bool]($mutating -and -not $DryRun)
        Whkd = if ($event.readiness.daemon_running) { "running" } else { "not_running" }
        Config = if ($configPresent) { "present" } else { "missing" }
        Evidence = $eventPath
    } | Format-List
}
