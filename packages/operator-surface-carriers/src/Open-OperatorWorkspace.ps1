param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = ($env:NARADA_PC_SITE_ROOT ? $env:NARADA_PC_SITE_ROOT : "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2"),
    [string]$WorkspaceId = "narada-andrey",
    [switch]$SkipRestore,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([string]$Json)
    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Json | ConvertFrom-Json -Depth 100 }
    return $Json | ConvertFrom-Json
}

# ---------------------------------------------------------------------------
# Step 1: Restore missing / unhealthy sessions
# ---------------------------------------------------------------------------
$restoreResult = $null
if (-not $SkipRestore) {
    $restoreScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Restore-OperatorSurfaceSession.ps1"
    if (Test-Path -LiteralPath $restoreScript) {
        Write-Host "=== Step 1: Restoring operator-surface sessions ===" -ForegroundColor Cyan
        $restoreOutput = & pwsh.exe -NoProfile -ExecutionPolicy Bypass -File $restoreScript -UserSiteRoot $UserSiteRoot -PassThru 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Restore-OperatorSurfaceSession.ps1 failed with exit code $LASTEXITCODE"
        }
        $restoreText = ($restoreOutput | Out-String).Trim()
        if ($restoreText) {
            try {
                $restoreResult = ConvertFrom-NaradaJson $restoreText
            } catch {
                Write-Warning "Could not parse restore output as JSON: $($_.Exception.Message)"
            }
        }
    } else {
        Write-Warning "Restore script not found: $restoreScript"
    }
}

# Emit a compact human-readable summary of the restore step
if ($restoreResult) {
    $launches       = @($restoreResult.actions | Where-Object { $_.action -eq "launch_windows_terminal_profile" })
    $alreadyHealthy = @($restoreResult.actions | Where-Object { $_.action -eq "surface_already_healthy" })
    $repairRuns     = @($restoreResult.actions | Where-Object { $_.action -eq "run_window_readmission_repair" })

    if ($launches.Count -gt 0) {
        Write-Host ("Launched {0} missing session(s)." -f $launches.Count) -ForegroundColor Green
        foreach ($l in $launches) {
            Write-Host ("  - {0} ({1})" -f $l.identity_name, $l.profile_name) -ForegroundColor Green
        }
    }
    if ($repairRuns.Count -gt 0) {
        Write-Host ("Ran readmission repair for {0} recoverable session(s)." -f $repairRuns.Count) -ForegroundColor Green
    }
    if ($alreadyHealthy.Count -gt 0) {
        Write-Host ("{0} session(s) already healthy." -f $alreadyHealthy.Count) -ForegroundColor DarkGray
    }

    $instructions = @($restoreResult.instructions)
    if ($instructions.Count -gt 0) {
        Write-Host ""
        Write-Host "=== Binding instructions ===" -ForegroundColor Yellow
        foreach ($inst in $instructions) {
            Write-Host ("[{0}] Bind the newly launched window:" -f $inst.identity_name) -ForegroundColor Yellow
            Write-Host ("  {0}" -f $inst.instruction) -ForegroundColor Gray
        }
        Write-Host ""
    }
}

# ---------------------------------------------------------------------------
# Step 2: Dry-run projection to check explainability
# ---------------------------------------------------------------------------
$projectionScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\windows-glue\Invoke-OperatorWorkspaceProjection.ps1"
if (Test-Path $projectionScript) {
    $projectionOutput = & pwsh.exe -NoProfile -ExecutionPolicy Bypass -File $projectionScript `
        -UserSiteRoot $UserSiteRoot -WorkspaceId $WorkspaceId -PassThru 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Invoke-OperatorWorkspaceProjection.ps1 failed with exit code $LASTEXITCODE"
    }
    $projectionText = ($projectionOutput | Out-String).Trim()
    $projection = ConvertFrom-NaradaJson $projectionText
    $explainable       = [bool]$projection.runtime_explainability.explainable
    $missingBindings   = @($projection.runtime_explainability.missing_visible_bindings)
    $memberCount       = [int]$projection.runtime_explainability.visible_member_count
    $boundMemberCount  = [int]$projection.runtime_explainability.visible_member_binding_count
} else {
    Write-Warning "Projection script not found at $projectionScript; skipping explainability check"
    $explainable       = $true
    $missingBindings   = @()
    $memberCount       = 0
    $boundMemberCount  = 0
}

# ---------------------------------------------------------------------------
# Build result object (used for both human and PassThru output)
# ---------------------------------------------------------------------------
$result = [ordered]@{
    schema        = "narada.operator_surfaces.open_workspace_event.v0"
    observed_at   = Get-Date -Format "o"
    workspace_id  = $WorkspaceId
    restore       = if ($restoreResult) {
        [ordered]@{
            launched        = @($restoreResult.actions | Where-Object { $_.action -eq "launch_windows_terminal_profile" } | ForEach-Object { $_.identity_name })
            repaired        = @($restoreResult.actions | Where-Object { $_.action -eq "run_window_readmission_repair" } | ForEach-Object { $_.identity_name })
            already_healthy = @($restoreResult.actions | Where-Object { $_.action -eq "surface_already_healthy" } | ForEach-Object { $_.identity_name })
            instructions    = @($restoreResult.instructions)
        }
    } else { $null }
    projection = [ordered]@{
        explainable      = $explainable
        missing_bindings = @($missingBindings | ForEach-Object { $_.identity_name })
        member_count     = $memberCount
        bound_member_count = $boundMemberCount
    }
    switch_applied = $false
    switch_event   = $null
}

# ---------------------------------------------------------------------------
# Step 3: Apply switch if explainable, else report what remains manual
# ---------------------------------------------------------------------------
if ($explainable) {
    Write-Host "=== Step 2: Workspace explainable. Applying switch... ===" -ForegroundColor Green

    $switchScript = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Switch-OperatorWorkspace.ps1"
    $switchOutput = & pwsh.exe -NoProfile -ExecutionPolicy Bypass -File $switchScript `
        -UserSiteRoot $UserSiteRoot -PcSiteRoot $PcSiteRoot `
        -WorkspaceId $WorkspaceId -Apply -MutatingAuthorized operator -PassThru 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Switch-OperatorWorkspace.ps1 failed with exit code $LASTEXITCODE"
    }
    $switchText = ($switchOutput | Out-String).Trim()
    $switchResult = ConvertFrom-NaradaJson $switchText

    $result.switch_applied = $true
    $result.switch_event   = $switchResult

    if (-not $PassThru) {
        Write-Host ""
        Write-Host ("Workspace '{0}' opened successfully." -f $WorkspaceId) -ForegroundColor Green
        Write-Host ("  Members: {0} bound / {1} total" -f $boundMemberCount, $memberCount) -ForegroundColor Gray
        if ($result.restore -and $result.restore.launched.Count -gt 0) {
            Write-Host ("  Launched: {0}" -f ($result.restore.launched -join ", ")) -ForegroundColor Gray
        }
    }
} else {
    if (-not $PassThru) {
        Write-Host ""
        Write-Host "=== Workspace NOT explainable ===" -ForegroundColor Yellow
        Write-Host ("Missing bindings for: {0}" -f ($missingBindings.identity_name -join ", ")) -ForegroundColor Yellow

        if ($restoreResult -and @($restoreResult.instructions).Count -gt 0) {
            Write-Host "Bind the newly launched windows, then re-run with -SkipRestore:" -ForegroundColor White
            Write-Host ("  .\tools\operator-surface-carriers\Open-OperatorWorkspace.ps1 -WorkspaceId {0} -SkipRestore" -f $WorkspaceId) -ForegroundColor White
        } else {
            Write-Host "Some workspace members have no runtime bindings. Run repair or rebind:" -ForegroundColor White
            Write-Host "  .\tools\operator-surface-carriers\windows-glue\Repair-OperatorSurfaceWindows.ps1" -ForegroundColor White
        }
    }
    $result.switch_applied = $false
}

if ($PassThru) {
    $result | ConvertTo-Json -Depth 100
}
