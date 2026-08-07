param(
    [string]$VsDevCmd = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat",
    [string]$NaradaRoot,
    [string]$NaradaAndreyRoot = "C:\Users\Andrey\Narada",
    [string]$StaccatoRoot,
    [string]$RevolutionRoot,
    [string]$TimourMarketingAgentRoot = "C:\Users\Andrey\Vose Software BE\Timour Koupeev - MarketingAgent\.narada",
    [string]$UtzRoot,
    [string]$SonarRoot,
    [string]$SmartRoot,
    [string]$SmartSiteRoot,
    [string]$ThoughtsRoot,
    [string]$ThoughtsSiteRoot,
    [string]$NaradaProperAgentCliEvidence,
    [string]$NaradaProperAgentTuiEvidence,
    [string]$NaradaAndreyAgentCliEvidence = "C:\Users\Andrey\Narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-19_e5147cef.result.json",
    [string]$NaradaAndreyAgentTuiEvidence = "C:\Users\Andrey\Narada\.ai\runtime\agent-start-results\evt-2026-05-31_04-27-29_a23016ab.result.json",
    [string]$StaccatoAgentCliEvidence,
    [string]$RevolutionAgentCliEvidence,
    [string]$TimourMarketingAgentCliEvidence = "C:\Users\Andrey\Vose Software BE\Timour Koupeev - MarketingAgent\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-23_466ee6d9.result.json",
    [string]$UtzAgentCliEvidence,
    [string]$NaradaSonarAgentCliEvidence,
    [string]$SmartSchedulingAgentCliEvidence,
    [string]$ThoughtsProjectAgentCliEvidence,
    [switch]$RefreshAgentCli,
    [switch]$AllowInteractiveAgentCliRefresh,
    [switch]$RefreshNaradaAndreyTui,
    [switch]$SkipAcceptanceReport
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SourceRoot = if ($env:NARADA_SRC_ROOT) { $env:NARADA_SRC_ROOT } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) 'src' }
if (-not $NaradaRoot) { $NaradaRoot = if ($env:NARADA_PROPER_ROOT) { $env:NARADA_PROPER_ROOT } else { Join-Path $SourceRoot 'narada' } }
if (-not $StaccatoRoot) { $StaccatoRoot = Join-Path $SourceRoot 'narada.staccato\.narada' }
if (-not $RevolutionRoot) { $RevolutionRoot = Join-Path $SourceRoot 'narada.revolution' }
if (-not $UtzRoot) { $UtzRoot = Join-Path $SourceRoot 'narada.utz\.narada' }
if (-not $SonarRoot) { $SonarRoot = Join-Path $SourceRoot 'narada.sonar' }
if (-not $SmartRoot) { $SmartRoot = Join-Path $SourceRoot 'smart-scheduling' }
if (-not $ThoughtsRoot) { $ThoughtsRoot = Join-Path $SourceRoot 'thoughts' }
if (-not $NaradaProperAgentCliEvidence) { $NaradaProperAgentCliEvidence = Join-Path $NaradaRoot '.narada\crew\agent-start-results\agent_start_20260531_000417547_narada_architect.result.json' }
if (-not $NaradaProperAgentTuiEvidence) { $NaradaProperAgentTuiEvidence = Join-Path $NaradaRoot '.narada\crew\agent-start-results\agent_start_20260531_041426614_narada_architect.result.json' }
if (-not $StaccatoAgentCliEvidence) { $StaccatoAgentCliEvidence = Join-Path $StaccatoRoot '.ai\runtime\agent-start-results\evt-2026-05-31_00-04-20_131e872d.result.json' }
if (-not $RevolutionAgentCliEvidence) { $RevolutionAgentCliEvidence = Join-Path $RevolutionRoot '.ai\runtime\agent-start-results\evt-2026-05-31_00-04-22_c13890e1.result.json' }
if (-not $UtzAgentCliEvidence) { $UtzAgentCliEvidence = Join-Path $UtzRoot '.ai\runtime\agent-start-results\evt-2026-05-31_00-04-24_747be7a9.result.json' }
if (-not $NaradaSonarAgentCliEvidence) { $NaradaSonarAgentCliEvidence = Join-Path $SonarRoot '.ai\runtime\agent-start-results\evt-2026-05-31_00-04-25_28290811.result.json' }
if (-not $SmartSchedulingAgentCliEvidence) { $SmartSchedulingAgentCliEvidence = Join-Path $SmartRoot '.narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-26_b975144f.result.json' }
if (-not $ThoughtsProjectAgentCliEvidence) { $ThoughtsProjectAgentCliEvidence = Join-Path $ThoughtsRoot '.narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-27_275473a1.result.json' }

if ([string]::IsNullOrWhiteSpace($SmartSiteRoot)) {
    $SmartSiteRoot = Join-Path $SmartRoot ".narada"
}
if ([string]::IsNullOrWhiteSpace($ThoughtsSiteRoot)) {
    $ThoughtsSiteRoot = Join-Path $ThoughtsRoot ".narada"
}

$Evidence = [ordered]@{
    "narada-proper.agent-cli" = $NaradaProperAgentCliEvidence
    "narada-proper.agent-tui" = $NaradaProperAgentTuiEvidence
    "narada-andrey.agent-cli" = $NaradaAndreyAgentCliEvidence
    "narada-andrey.agent-tui" = $NaradaAndreyAgentTuiEvidence
    "narada-staccato.agent-cli" = $StaccatoAgentCliEvidence
    "narada-revolution.agent-cli" = $RevolutionAgentCliEvidence
    "narada-timour-marketing-agent.agent-cli" = $TimourMarketingAgentCliEvidence
    "narada-utz.agent-cli" = $UtzAgentCliEvidence
    "narada-sonar.agent-cli" = $NaradaSonarAgentCliEvidence
    "smart-scheduling.agent-cli" = $SmartSchedulingAgentCliEvidence
    "thoughts-project.agent-cli" = $ThoughtsProjectAgentCliEvidence
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

    foreach ($key in @(
        "narada-proper.agent-cli",
        "narada-proper.agent-tui",
        "narada-andrey.agent-cli",
        "narada-andrey.agent-tui",
        "narada-staccato.agent-cli",
        "narada-revolution.agent-cli",
        "narada-timour-marketing-agent.agent-cli",
        "narada-utz.agent-cli",
        "narada-sonar.agent-cli",
        "smart-scheduling.agent-cli",
        "thoughts-project.agent-cli"
    )) {
        Assert-PathExists -Label "seed_evidence_$key" -Path $EvidenceMap[$key]
    }
}

function Invoke-BoundedLaunch {
    param(
        [Parameter(Mandatory)] [string]$Root,
        [Parameter(Mandatory)] [string]$Script,
        [Parameter(Mandatory)] [string]$Agent,
        [ValidateSet("agent-cli", "agent-tui")] [string]$Carrier
    )

    Assert-PathExists -Label "launch_root" -Path $Root -PathType Container
    $scriptPath = Join-Path $Root $Script
    Assert-PathExists -Label "launcher" -Path $scriptPath
    if ($Carrier -eq "agent-tui") {
        Assert-PathExists -Label "vsdevcmd" -Path $VsDevCmd
    }

    Write-Host "launch: $Agent ($Carrier)"

    if ($Carrier -eq "agent-tui") {
        $command = "call `"$VsDevCmd`" -arch=x64 -host_arch=x64 >nul && cd /d `"$Root`" && pwsh -NoProfile -File `"$scriptPath`" agent-start -Agent $Agent -Runtime agent-tui -Exec"
        $lines = & cmd.exe /d /s /c $command 2>&1
        $exitCode = $LASTEXITCODE
    } else {
        Push-Location -LiteralPath $Root
        try {
            $lines = & pwsh -NoProfile -File $scriptPath agent-start -Agent $Agent -Carrier agent-cli -Runtime narada-agent-runtime-server -Exec 2>&1
            $exitCode = $LASTEXITCODE
        } finally {
            Pop-Location
        }
    }

    $lines | ForEach-Object { Write-Host $_ }
    if ($exitCode -ne 0) {
        throw "launch_failed: $Agent ($Carrier) exited $exitCode"
    }

    $pathLine = $lines | Where-Object { $_ -match 'launch_result_path:\s*(.+\.json)\s*$' } | Select-Object -Last 1
    if (-not $pathLine) {
        throw "launch_result_path_not_found: $Agent ($Carrier)"
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
Assert-PathExists -Label "staccato_root" -Path $StaccatoRoot -PathType Container
Assert-PathExists -Label "revolution_root" -Path $RevolutionRoot -PathType Container
Assert-PathExists -Label "timour_marketing_agent_root" -Path $TimourMarketingAgentRoot -PathType Container
Assert-PathExists -Label "utz_root" -Path $UtzRoot -PathType Container
Assert-PathExists -Label "sonar_root" -Path $SonarRoot -PathType Container
Assert-PathExists -Label "smart_root" -Path $SmartRoot -PathType Container
Assert-PathExists -Label "smart_site_root" -Path $SmartSiteRoot -PathType Container
Assert-PathExists -Label "thoughts_root" -Path $ThoughtsRoot -PathType Container
Assert-PathExists -Label "thoughts_site_root" -Path $ThoughtsSiteRoot -PathType Container
Assert-SeedEvidence -EvidenceMap $Evidence

if ($RefreshAgentCli) {
    $Evidence["narada-andrey.agent-cli"] = Invoke-BoundedLaunch -Root $NaradaAndreyRoot -Script "narada-andrey.ps1" -Agent "narada-andrey.resident" -Carrier "agent-cli"
    $Evidence["narada-staccato.agent-cli"] = Invoke-BoundedLaunch -Root $StaccatoRoot -Script "narada-staccato.ps1" -Agent "narada-staccato.resident" -Carrier "agent-cli"
    $Evidence["narada-revolution.agent-cli"] = Invoke-BoundedLaunch -Root $RevolutionRoot -Script "narada-revolution.ps1" -Agent "narada-revolution.resident" -Carrier "agent-cli"
    $Evidence["narada-timour-marketing-agent.agent-cli"] = Invoke-BoundedLaunch -Root $TimourMarketingAgentRoot -Script "narada-timour-marketing-agent.ps1" -Agent "narada-timour-marketing-agent.resident" -Carrier "agent-cli"
    $Evidence["narada-utz.agent-cli"] = Invoke-BoundedLaunch -Root $UtzRoot -Script "narada-utz.ps1" -Agent "narada-utz.resident" -Carrier "agent-cli"
    $Evidence["narada-sonar.agent-cli"] = Invoke-BoundedLaunch -Root $SonarRoot -Script "narada-sonar.ps1" -Agent "sonar.resident" -Carrier "agent-cli"
    $Evidence["smart-scheduling.agent-cli"] = Invoke-BoundedLaunch -Root $SmartRoot -Script "narada-smart-scheduling.ps1" -Agent "smart-scheduling.resident" -Carrier "agent-cli"
    $Evidence["thoughts-project.agent-cli"] = Invoke-BoundedLaunch -Root $ThoughtsRoot -Script "narada-thoughts.ps1" -Agent "thoughts-project.resident" -Carrier "agent-cli"
}

if ($RefreshNaradaAndreyTui) {
    $Evidence["narada-andrey.agent-tui"] = Invoke-BoundedLaunch -Root $NaradaAndreyRoot -Script "narada-andrey.ps1" -Agent "narada-andrey.resident" -Carrier "agent-tui"
}

$Evidence["narada-sonar.agent-tui"] = Invoke-BoundedLaunch -Root $SonarRoot -Script "narada-sonar.ps1" -Agent "sonar.resident" -Carrier "agent-tui"
$Evidence["smart-scheduling.agent-tui"] = Invoke-BoundedLaunch -Root $SmartRoot -Script "narada-smart-scheduling.ps1" -Agent "smart-scheduling.resident" -Carrier "agent-tui"
$Evidence["narada-staccato.agent-tui"] = Invoke-BoundedLaunch -Root $StaccatoRoot -Script "narada-staccato.ps1" -Agent "narada-staccato.resident" -Carrier "agent-tui"
$Evidence["narada-revolution.agent-tui"] = Invoke-BoundedLaunch -Root $RevolutionRoot -Script "narada-revolution.ps1" -Agent "narada-revolution.resident" -Carrier "agent-tui"
$Evidence["narada-timour-marketing-agent.agent-tui"] = Invoke-BoundedLaunch -Root $TimourMarketingAgentRoot -Script "narada-timour-marketing-agent.ps1" -Agent "narada-timour-marketing-agent.resident" -Carrier "agent-tui"
$Evidence["narada-utz.agent-tui"] = Invoke-BoundedLaunch -Root $UtzRoot -Script "narada-utz.ps1" -Agent "narada-utz.resident" -Carrier "agent-tui"
$Evidence["thoughts-project.agent-tui"] = Invoke-BoundedLaunch -Root $ThoughtsRoot -Script "narada-thoughts.ps1" -Agent "thoughts-project.resident" -Carrier "agent-tui"

if (-not $SkipAcceptanceReport) {
    Push-Location -LiteralPath $NaradaRoot
    try {
        & node tools\agent-start\agent-tui-rollout-acceptance.ts `
            --site-root $NaradaRoot `
            --known-site-root "narada-andrey=$NaradaAndreyRoot" `
            --known-site-root "narada-staccato=$StaccatoRoot" `
            --known-site-root "narada-revolution=$RevolutionRoot" `
            --known-site-root "narada-timour-marketing-agent=$TimourMarketingAgentRoot" `
            --known-site-root "narada-utz=$UtzRoot" `
            --known-site-root "narada-sonar=$SonarRoot" `
            --known-site-root "smart-scheduling=$SmartSiteRoot" `
            --known-site-root "thoughts-project=$ThoughtsSiteRoot" `
            --agent-cli-evidence "narada-proper=$($Evidence['narada-proper.agent-cli'])" `
            --agent-tui-evidence "narada-proper=$($Evidence['narada-proper.agent-tui'])" `
            --agent-cli-evidence "narada-andrey=$($Evidence['narada-andrey.agent-cli'])" `
            --agent-tui-evidence "narada-andrey=$($Evidence['narada-andrey.agent-tui'])" `
            --agent-cli-evidence "narada-staccato=$($Evidence['narada-staccato.agent-cli'])" `
            --agent-tui-evidence "narada-staccato=$($Evidence['narada-staccato.agent-tui'])" `
            --agent-cli-evidence "narada-revolution=$($Evidence['narada-revolution.agent-cli'])" `
            --agent-tui-evidence "narada-revolution=$($Evidence['narada-revolution.agent-tui'])" `
            --agent-cli-evidence "narada-timour-marketing-agent=$($Evidence['narada-timour-marketing-agent.agent-cli'])" `
            --agent-tui-evidence "narada-timour-marketing-agent=$($Evidence['narada-timour-marketing-agent.agent-tui'])" `
            --agent-cli-evidence "narada-utz=$($Evidence['narada-utz.agent-cli'])" `
            --agent-tui-evidence "narada-utz=$($Evidence['narada-utz.agent-tui'])" `
            --agent-cli-evidence "narada-sonar=$($Evidence['narada-sonar.agent-cli'])" `
            --agent-tui-evidence "narada-sonar=$($Evidence['narada-sonar.agent-tui'])" `
            --agent-cli-evidence "smart-scheduling=$($Evidence['smart-scheduling.agent-cli'])" `
            --agent-tui-evidence "smart-scheduling=$($Evidence['smart-scheduling.agent-tui'])" `
            --agent-cli-evidence "thoughts-project=$($Evidence['thoughts-project.agent-cli'])" `
            --agent-tui-evidence "thoughts-project=$($Evidence['thoughts-project.agent-tui'])" `
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
