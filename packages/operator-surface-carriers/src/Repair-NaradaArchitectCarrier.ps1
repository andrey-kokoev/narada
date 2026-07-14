#!/usr/bin/env pwsh

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2",
    [string]$Identity = "andrey-user.architect",
    [ValidateSet("codex", "kimi")]
    [string]$Runtime = "codex",
    [string]$SurfaceId = "task-lifecycle-mcp.local",
    [int[]]$ProcessId = @(),
    [switch]$SkipKill
)

$ErrorActionPreference = "Stop"

function Find-NaradaObjectBySurfaceId {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Value,
        [Parameter(Mandatory = $true)]
        [string]$TargetSurfaceId
    )

    $matches = New-Object System.Collections.Generic.List[object]

    function Visit-Value {
        param([object]$Current)

        if ($null -eq $Current) { return }

        if ($Current -is [System.Array]) {
            foreach ($item in $Current) { Visit-Value -Current $item }
            return
        }

        if ($Current -is [System.Management.Automation.PSCustomObject]) {
            $surfaceProperty = $Current.PSObject.Properties["surface_id"]
            if ($null -ne $surfaceProperty -and [string]$surfaceProperty.Value -eq $TargetSurfaceId) {
                $matches.Add($Current) | Out-Null
            }

            foreach ($property in $Current.PSObject.Properties) {
                Visit-Value -Current $property.Value
            }
        }
    }

    Visit-Value -Current $Value
    return $matches.ToArray()
}

function Get-NaradaSurfacePid {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Surface
    )

    if ($Surface.runtime -and $Surface.runtime.pid) {
        return [int]$Surface.runtime.pid
    }

    if ($Surface.process_identity_evidence -and $Surface.process_identity_evidence.pid) {
        return [int]$Surface.process_identity_evidence.pid
    }

    return $null
}

function Test-NaradaSurfaceNeedsKill {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Surface
    )

    $carrierSessionId = $Surface.carrier_session_id
    if ($null -eq $carrierSessionId -and $Surface.carrier_session_binding) {
        $carrierSessionId = $Surface.carrier_session_binding.carrier_session_id
    }

    $restartRequested = $Surface.observed_state -eq "restart_requested" -or
        $Surface.restart_request_state -eq "restart_requested" -or
        ($Surface.restart_request -and $Surface.restart_request.state -eq "restart_requested")

    return $restartRequested -and [string]::IsNullOrWhiteSpace([string]$carrierSessionId)
}

function Resolve-NaradaTargetPids {
    param(
        [string]$RuntimeRegistryPath,
        [string]$TargetSurfaceId,
        [int[]]$ExplicitProcessIds
    )

    $resolved = New-Object System.Collections.Generic.List[int]

    foreach ($pidValue in $ExplicitProcessIds) {
        if ($pidValue -gt 0) { $resolved.Add($pidValue) | Out-Null }
    }

    if ($resolved.Count -gt 0) { return $resolved.ToArray() }

    if (-not (Test-Path -LiteralPath $RuntimeRegistryPath)) {
        Write-Warning "runtime_registry_missing: $RuntimeRegistryPath"
        return @()
    }

    $registry = Get-Content -LiteralPath $RuntimeRegistryPath -Raw | ConvertFrom-Json
    $surfaces = Find-NaradaObjectBySurfaceId -Value $registry -TargetSurfaceId $TargetSurfaceId

    foreach ($surface in $surfaces) {
        if (-not (Test-NaradaSurfaceNeedsKill -Surface $surface)) { continue }
        $pidValue = Get-NaradaSurfacePid -Surface $surface
        if ($null -ne $pidValue -and $pidValue -gt 0) {
            $resolved.Add($pidValue) | Out-Null
        }
    }

    return ($resolved.ToArray() | Select-Object -Unique)
}

$runtimeRegistryPath = Join-Path $PcSiteRoot "runtime\mcp-runtime-instances.json"
$targetPids = Resolve-NaradaTargetPids `
    -RuntimeRegistryPath $runtimeRegistryPath `
    -TargetSurfaceId $SurfaceId `
    -ExplicitProcessIds $ProcessId

if (-not $SkipKill) {
    foreach ($pidValue in $targetPids) {
        $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
        if ($null -eq $process) {
            Write-Host "Process $pidValue is already absent."
            continue
        }

        if ($PSCmdlet.ShouldProcess("PID $pidValue", "Stop stale MCP child for $SurfaceId")) {
            Stop-Process -Id $pidValue -Force -ErrorAction Stop
            Write-Host "Stopped PID $pidValue."
        }
    }
} else {
    Write-Host "Skipping process termination."
}

$launcher = Join-Path $UserSiteRoot "andrey-user.ps1"
if (-not (Test-Path -LiteralPath $launcher)) {
    throw "andrey_user_launcher_missing: $launcher"
}

if ($PSCmdlet.ShouldProcess($Identity, "Start registered $Runtime carrier through agent-start")) {
    Set-Location -LiteralPath $UserSiteRoot
    & $launcher agent-start -Agent $Identity -Runtime $Runtime -Exec
    exit $LASTEXITCODE
}
