param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },

    [ValidateSet("all", "health", "sessions", "carrier_windows", "komorebi", "yasb", "labels", "whkd")]
    [string]$Scope = "all",

    [switch]$Execute,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function Write-JsonFile {
    param([string]$Path, [object]$Value)

    $dir = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $json = $Value | ConvertTo-Json -Depth 80
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Invoke-Step {
    param(
        [string]$Name,
        [string]$Script,
        [hashtable]$Parameters,
        [bool]$Mutating
    )

    $record = [ordered]@{
        name = $Name
        script = $Script
        mutating = $Mutating
        mode = if ($Execute) { "execute" } else { "dry_run" }
        status = "not_run"
        output = @()
    }

    if (-not (Test-Path -LiteralPath $Script)) {
        $record.status = "missing_script"
        return $record
    }

    if ($Mutating -and -not $Execute) {
        $record.status = "would_run"
        $record.output = @("Use -Execute to run this mutating step.")
        return $record
    }

    try {
        $output = & $Script @Parameters 2>&1
        $record.status = "ran"
        $record.output = @($output | ForEach-Object { [string]$_ })
    } catch {
        $record.status = "failed"
        $record.output = @($_.Exception.Message)
    }
    return $record
}

$steps = New-Object System.Collections.Generic.List[object]

$healthScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\windows-glue\Get-OperatorSurfaceHealth.ps1"
$sessionScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Restore-OperatorSurfaceSession.ps1"
$carrierRepairScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\windows-glue\Repair-OperatorSurfaceWindows.ps1"
$labelBuildScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Build-WindowLabelsFromIdentities.ps1"
$whkdRestartScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Restart-WhkdDaemon.ps1"
$komorebiRepairScript = Join-Path $PcSiteRoot "tools\komorebi\Repair-Komorebi.ps1"
$yasbApplyScript = Join-Path $PcSiteRoot "tools\yasb\Apply-YasbProjection.ps1"
$yasbCheckScript = Join-Path $PcSiteRoot "tools\yasb\Check-YasbDrift.ps1"

if ($Scope -in @("all", "health", "whkd")) {
    $healthParams = @{ UserSiteRoot = $UserSiteRoot; PcSiteRoot = $PcSiteRoot }
    $steps.Add((Invoke-Step -Name "health_before" -Script $healthScript -Parameters $healthParams -Mutating $false))
}
if ($Scope -in @("all", "whkd")) {
    $whkdParams = @{ UserSiteRoot = $UserSiteRoot; PcSiteRoot = $PcSiteRoot; Mode = "restart"; PassThru = $true }
    if (-not $Execute) {
        $whkdParams.DryRun = $true
        $whkdParams.MutatingAuthorized = "dry-run.operator-surface-reconcile"
    } else {
        $whkdParams.MutatingAuthorized = "operator-surface-reconcile.whkd"
    }
    $steps.Add((Invoke-Step -Name "whkd_restart" -Script $whkdRestartScript -Parameters $whkdParams -Mutating ([bool]$Execute)))
}
if ($Scope -in @("all", "yasb")) {
    $yasbCheckParams = @{ SkipProcessCheck = $true }
    $emptyParams = @{}
    $steps.Add((Invoke-Step -Name "yasb_projection_check" -Script $yasbCheckScript -Parameters $yasbCheckParams -Mutating $false))
    $steps.Add((Invoke-Step -Name "yasb_projection_apply" -Script $yasbApplyScript -Parameters $emptyParams -Mutating $true))
}
if ($Scope -in @("all", "labels")) {
    $labelParams = @{ UserSiteRoot = $UserSiteRoot }
    $steps.Add((Invoke-Step -Name "window_label_projection_build" -Script $labelBuildScript -Parameters $labelParams -Mutating $true))
}
if ($Scope -in @("all", "carrier_windows")) {
    $carrierParams = @{ UserSiteRoot = $UserSiteRoot; PcSiteRoot = $PcSiteRoot }
    if (-not $Execute) { $carrierParams.DryRun = $true }
    $steps.Add((Invoke-Step -Name "carrier_window_readmission" -Script $carrierRepairScript -Parameters $carrierParams -Mutating $false))
}
if ($Scope -in @("all", "sessions")) {
    $sessionParams = @{ UserSiteRoot = $UserSiteRoot }
    if (-not $Execute) { $sessionParams.DryRun = $true }
    $steps.Add((Invoke-Step -Name "session_restore" -Script $sessionScript -Parameters $sessionParams -Mutating $false))
}
if ($Scope -in @("all", "komorebi")) {
    $emptyParams = @{}
    $steps.Add((Invoke-Step -Name "komorebi_repair" -Script $komorebiRepairScript -Parameters $emptyParams -Mutating $true))
}
if ($Scope -in @("all", "health", "whkd")) {
    $healthParams = @{ UserSiteRoot = $UserSiteRoot; PcSiteRoot = $PcSiteRoot }
    $steps.Add((Invoke-Step -Name "health_after" -Script $healthScript -Parameters $healthParams -Mutating $false))
}

$event = [ordered]@{
    schema = "narada.operator_surface_reconcile_event.v0"
    occurred_at = (Get-Date -Format "o")
    user_site_root = $UserSiteRoot
    pc_site_root = $PcSiteRoot
    scope = $Scope
    mode = if ($Execute) { "execute" } else { "dry_run" }
    order = @(
        "health_before",
        "whkd_restart",
        "yasb_projection_check",
        "yasb_projection_apply",
        "window_label_projection_build",
        "carrier_window_readmission",
        "session_restore",
        "komorebi_repair",
        "health_after"
    )
    steps = @($steps.ToArray())
}

$logDir = Join-Path $PcSiteRoot "runtime\operator-surface-reconcile"
$logPath = Join-Path $logDir ("reconcile_{0}_{1}.json" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8)))
Write-JsonFile -Path $logPath -Value $event
$event.Add("log_path", $logPath)

if ($PassThru) {
    $event | ConvertTo-Json -Depth 80
} else {
    $steps | ForEach-Object {
        [pscustomobject]@{
            Step = $_.name
            Mode = $_.mode
            Mutating = $_.mutating
            Status = $_.status
        }
    } | Format-Table -AutoSize
    Write-Host ("Log: {0}" -f $logPath)
}
