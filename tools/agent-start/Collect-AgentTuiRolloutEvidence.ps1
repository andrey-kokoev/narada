param(
    [string]$VsDevCmd = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat",
    [string]$NaradaRoot = "D:\code\narada",
    [string]$NaradaAndreyRoot = "C:\Users\Andrey\Narada",
    [string]$SonarRoot = "D:\code\narada.sonar",
    [string]$SmartRoot = "D:\code\smart-scheduling",
    [string]$SmartSiteRoot,
    [string]$NaradaProperAgentCliEvidence = "D:\code\narada\.narada\crew\agent-start-results\agent_start_20260531_000417547_narada_architect.result.json",
    [string]$NaradaProperAgentTuiEvidence = "D:\code\narada\.narada\crew\agent-start-results\agent_start_20260531_041426614_narada_architect.result.json",
    [string]$NaradaAndreyAgentCliEvidence = "C:\Users\Andrey\Narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-19_e5147cef.result.json",
    [string]$NaradaAndreyAgentTuiEvidence = "C:\Users\Andrey\Narada\.ai\runtime\agent-start-results\evt-2026-05-31_04-27-29_a23016ab.result.json",
    [string]$NaradaSonarAgentCliEvidence = "D:\code\narada.sonar\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-25_28290811.result.json",
    [string]$SmartSchedulingAgentCliEvidence = "D:\code\smart-scheduling\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-26_b975144f.result.json",
    [switch]$RefreshAgentCli,
    [switch]$AllowInteractiveAgentCliRefresh,
    [switch]$RefreshNaradaAndreyTui,
    [switch]$SkipAcceptanceReport
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SmartSiteRoot)) {
    $SmartSiteRoot = Join-Path $SmartRoot ".narada"
}

$Evidence = [ordered]@{
    "narada-proper.agent-cli" = $NaradaProperAgentCliEvidence
    "narada-proper.agent-tui" = $NaradaProperAgentTuiEvidence
    "narada-andrey.agent-cli" = $NaradaAndreyAgentCliEvidence
    "narada-andrey.agent-tui" = $NaradaAndreyAgentTuiEvidence
    "narada-sonar.agent-cli" = $NaradaSonarAgentCliEvidence
    "smart-scheduling.agent-cli" = $SmartSchedulingAgentCliEvidence
}

function Assert-PathExists {
    param(
        [Parameter(Mandatory)] [string]$Label,
        [Parameter(Mandatory)] [string]$Path,
        [ValidateSet("Container", "Leaf")] [string]$PathType = "Leaf"
    )

    if (-not (Test-Path -LiteralPath $Path -PathType $PathType)) {
        throw "missing_${Label}: $Path"
    }
}

function Assert-SeedEvidence {
    param([Parameter(Mandatory)] [System.Collections.IDictionary]$EvidenceMap)

    foreach ($key in @("narada-proper.agent-cli", "narada-proper.agent-tui", "narada-andrey.agent-cli", "narada-andrey.agent-tui", "narada-sonar.agent-cli", "smart-scheduling.agent-cli")) {
        Assert-PathExists -Label "seed_evidence_$key" -Path $EvidenceMap[$key]
    }
}

function Invoke-BoundedLaunch {
    param(
        [Parameter(Mandatory)] [string]$Root,
        [Parameter(Mandatory)] [string]$Script,
        [Parameter(Mandatory)] [string]$Agent,
        [ValidateSet("agent-cli", "agent-tui")] [string]$Runtime
    )

    Assert-PathExists -Label "launch_root" -Path $Root -PathType Container
    $scriptPath = Join-Path $Root $Script
    Assert-PathExists -Label "launcher" -Path $scriptPath
    if ($Runtime -eq "agent-tui") {
        Assert-PathExists -Label "vsdevcmd" -Path $VsDevCmd
    }

    Write-Host "launch: $Agent ($Runtime)"

    if ($Runtime -eq "agent-tui") {
        $command = "call `"$VsDevCmd`" -arch=x64 -host_arch=x64 >nul && cd /d `"$Root`" && pwsh -NoProfile -File `"$scriptPath`" agent-start -Agent $Agent -Runtime agent-tui -Exec"
        $lines = & cmd.exe /d /s /c $command 2>&1
        $exitCode = $LASTEXITCODE
    } else {
        Push-Location -LiteralPath $Root
        try {
            $lines = & pwsh -NoProfile -File $scriptPath agent-start -Agent $Agent -Runtime agent-cli -Exec 2>&1
            $exitCode = $LASTEXITCODE
        } finally {
            Pop-Location
        }
    }

    $lines | ForEach-Object { Write-Host $_ }
    if ($exitCode -ne 0) {
        throw "launch_failed: $Agent ($Runtime) exited $exitCode"
    }

    $pathLine = $lines | Where-Object { $_ -match 'launch_result_path:\s*(.+\.json)\s*$' } | Select-Object -Last 1
    if (-not $pathLine) {
        throw "launch_result_path_not_found: $Agent ($Runtime)"
    }
    $path = [regex]::Match([string]$pathLine, 'launch_result_path:\s*(.+\.json)\s*$').Groups[1].Value.Trim()
    Assert-PathExists -Label "launch_result_file" -Path $path
    return $path
}

if ($RefreshAgentCli -and -not $AllowInteractiveAgentCliRefresh) {
    throw "interactive_agent_cli_refresh_requires_explicit_allow: pass -AllowInteractiveAgentCliRefresh with -RefreshAgentCli"
}

Assert-PathExists -Label "narada_root" -Path $NaradaRoot -PathType Container
Assert-PathExists -Label "narada_andrey_root" -Path $NaradaAndreyRoot -PathType Container
Assert-PathExists -Label "sonar_root" -Path $SonarRoot -PathType Container
Assert-PathExists -Label "smart_root" -Path $SmartRoot -PathType Container
Assert-PathExists -Label "smart_site_root" -Path $SmartSiteRoot -PathType Container
Assert-SeedEvidence -EvidenceMap $Evidence

if ($RefreshAgentCli) {
    $Evidence["narada-andrey.agent-cli"] = Invoke-BoundedLaunch -Root $NaradaAndreyRoot -Script "narada-andrey.ps1" -Agent "narada-andrey.resident" -Runtime "agent-cli"
    $Evidence["narada-sonar.agent-cli"] = Invoke-BoundedLaunch -Root $SonarRoot -Script "narada-sonar.ps1" -Agent "sonar.resident" -Runtime "agent-cli"
    $Evidence["smart-scheduling.agent-cli"] = Invoke-BoundedLaunch -Root $SmartRoot -Script "narada-smart-scheduling.ps1" -Agent "smart-scheduling.resident" -Runtime "agent-cli"
}

if ($RefreshNaradaAndreyTui) {
    $Evidence["narada-andrey.agent-tui"] = Invoke-BoundedLaunch -Root $NaradaAndreyRoot -Script "narada-andrey.ps1" -Agent "narada-andrey.resident" -Runtime "agent-tui"
}

$Evidence["narada-sonar.agent-tui"] = Invoke-BoundedLaunch -Root $SonarRoot -Script "narada-sonar.ps1" -Agent "sonar.resident" -Runtime "agent-tui"
$Evidence["smart-scheduling.agent-tui"] = Invoke-BoundedLaunch -Root $SmartRoot -Script "narada-smart-scheduling.ps1" -Agent "smart-scheduling.resident" -Runtime "agent-tui"

if (-not $SkipAcceptanceReport) {
    Push-Location -LiteralPath $NaradaRoot
    try {
        & node tools\agent-start\agent-tui-rollout-acceptance.mjs `
            --site-root $NaradaRoot `
            --known-site-root "narada-andrey=$NaradaAndreyRoot" `
            --known-site-root "narada-sonar=$SonarRoot" `
            --known-site-root "smart-scheduling=$SmartSiteRoot" `
            --agent-cli-evidence "narada-proper=$($Evidence['narada-proper.agent-cli'])" `
            --agent-tui-evidence "narada-proper=$($Evidence['narada-proper.agent-tui'])" `
            --agent-cli-evidence "narada-andrey=$($Evidence['narada-andrey.agent-cli'])" `
            --agent-tui-evidence "narada-andrey=$($Evidence['narada-andrey.agent-tui'])" `
            --agent-cli-evidence "narada-sonar=$($Evidence['narada-sonar.agent-cli'])" `
            --agent-tui-evidence "narada-sonar=$($Evidence['narada-sonar.agent-tui'])" `
            --agent-cli-evidence "smart-scheduling=$($Evidence['smart-scheduling.agent-cli'])" `
            --agent-tui-evidence "smart-scheduling=$($Evidence['smart-scheduling.agent-tui'])" `
            --write
        $reportExitCode = $LASTEXITCODE
        if ($reportExitCode -ne 0) {
            throw "rollout_acceptance_failed: node exited $reportExitCode"
        }
    } finally {
        Pop-Location
    }
}

Write-Host "evidence:"
foreach ($key in $Evidence.Keys) {
    Write-Host "  $key = $($Evidence[$key])"
}
