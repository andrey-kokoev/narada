param(
    [ValidateSet("doctor", "submit_observation", "submit_typed_envelope")]
    [string]$Operation = "doctor",

    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$TargetSiteRoot = $(if ($env:NARADA_SITE_ROOT) { $env:NARADA_SITE_ROOT } else { Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }),
    [string]$NaradaCli = $env:NARADA_CLI,

    [string]$SourceKind = "agent_report",
    [string]$SourceRef,
    [ValidateSet("proposal", "observation", "command_request", "question", "knowledge_candidate", "task_candidate", "incident", "capa", "upstream_task_candidate")]
    [string]$Kind = "observation",
    [string]$AuthorityLevel = "agent_reported",
    [string]$Principal = "andrey-user.Bob",
    [string]$TargetLocus = "local_site",
    [string]$Title,
    [string]$Summary,
    [string[]]$Evidence = @(),
    [string[]]$Proposal = @(),
    [string]$Recommendation,
    [string]$PayloadFile,

    [switch]$DryRun,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([string]$Json)
    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Json | ConvertFrom-Json -Depth 100 }
    return $Json | ConvertFrom-Json
}

function ConvertTo-NaradaJson {
    param($Value)
    $command = Get-Command ConvertTo-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Value | ConvertTo-Json -Depth 100 }
    return $Value | ConvertTo-Json
}

function Write-NaradaJsonFile {
    param([string]$Path, [object]$Value)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    [System.IO.File]::WriteAllText($Path, (ConvertTo-NaradaJson $Value) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

function Resolve-NaradaCli {
    param([string]$Value)

    if (-not [string]::IsNullOrWhiteSpace($Value)) {
        return $Value
    }

    return $null
}

$surfaceMapPath = Join-Path $UserSiteRoot ".narada\capabilities\mcp-surfaces.json"
if (-not (Test-Path -LiteralPath $surfaceMapPath)) { throw "mcp_surface_registry_missing: $surfaceMapPath" }
$surfaceMap = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($surfaceMapPath))
$surface = @($surfaceMap.surfaces | Where-Object { $_.surface_id -eq "inbox-mcp.local" }) | Select-Object -First 1
if (-not $surface) { throw "mcp_surface_missing: inbox-mcp.local" }

$runId = "inbox_mcp_{0}_{1}" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
$evidenceDir = Join-Path $UserSiteRoot ([string]$surface.evidence.path)
$evidencePath = Join-Path $evidenceDir ($runId + ".json")

$result = [ordered]@{
    schema = "narada.typed_mcp.inbox_mcp.prototype_event.v0"
    run_id = $runId
    occurred_at = (Get-Date -Format "o")
    operation = $Operation
    surface_id = "inbox-mcp.local"
    surface_type = "Inbox MCP"
    dry_run = [bool]$DryRun
    user_site_root = $UserSiteRoot
    target_site_root = $TargetSiteRoot
    authority_boundary = $surface.authority_boundary
    status = "planned"
    command = $null
    exit_code = $null
    stdout = ""
    stderr = ""
    envelope_id = $null
    evidence_path = $evidencePath
}

if ($Operation -eq "doctor") {
    $naradaCliConfigured = -not [string]::IsNullOrWhiteSpace($NaradaCli)
    $naradaCliExists = $false
    if ($naradaCliConfigured) {
        $naradaCliExists = Test-Path -LiteralPath $NaradaCli
    }
    $result.status = "ok"
    $result.doctor = [ordered]@{
        surface_declared = $true
        narada_cli_configured = $naradaCliConfigured
        narada_cli_exists = $naradaCliExists
        target_site_exists = Test-Path -LiteralPath $TargetSiteRoot
        allowed_operations = @($surface.tool_contract.semantic_operations)
        rule = $surface.authority_boundary.rule
        boundary = "postal-only: andrey-user does not resolve Narada proper CLI. If configured, CLI is used; otherwise observations drop to local file."
    }
    Write-NaradaJsonFile -Path $evidencePath -Value $result
    if ($PassThru) { ConvertTo-NaradaJson $result } else { Write-Host "Inbox MCP doctor ok. Evidence: $evidencePath" }
    return
}

if ([string]::IsNullOrWhiteSpace($SourceRef)) { throw "source_ref_required" }
if ([string]::IsNullOrWhiteSpace($Title) -and $Operation -eq "submit_observation") { throw "title_required" }
$resolvedNaradaCli = Resolve-NaradaCli $NaradaCli

if ($DryRun) {
    $result.status = "dry_run"
    $result.planned_submission = [ordered]@{
        source = [ordered]@{
            kind = $SourceKind
            ref = $SourceRef
        }
        kind = $Kind
        authority = [ordered]@{
            level = $AuthorityLevel
            principal = $Principal
        }
        target_locus = $TargetLocus
        payload = [ordered]@{
            title = $Title
            summary = $Summary
        }
    }
    Write-NaradaJsonFile -Path $evidencePath -Value $result
    if ($PassThru) { ConvertTo-NaradaJson $result } else { Write-Host "Inbox MCP dry-run ok. Evidence: $evidencePath" }
    return
}

$envelope = [ordered]@{
    schema = "narada.inbox.envelope.v0"
    envelope_id = [Guid]::NewGuid().ToString("N")
    submitted_at = (Get-Date -Format "o")
    source_kind = $SourceKind
    source_ref = $SourceRef
    kind = $Kind
    authority_level = $AuthorityLevel
    principal = $Principal
    target_locus = $TargetLocus
    title = $Title
    summary = $Summary
    evidence = @($Evidence)
    proposal = @($Proposal)
    recommendation = $Recommendation
}

if ($resolvedNaradaCli) {
    if ($Operation -eq "submit_observation") {
        $args = @($resolvedNaradaCli, "inbox", "submit-observation", "--source-kind", $SourceKind, "--source-ref", $SourceRef, "--title", $Title, "--authority-level", $AuthorityLevel, "--principal", $Principal, "--target-locus", $TargetLocus, "--cwd", $TargetSiteRoot, "--format", "json")
        if ($Summary) { $args += @("--summary", $Summary) }
        foreach ($line in $Evidence) { $args += @("--evidence", $line) }
        foreach ($line in $Proposal) { $args += @("--proposal", $line) }
        if ($Recommendation) { $args += @("--recommendation", $Recommendation) }
    } else {
        if ([string]::IsNullOrWhiteSpace($PayloadFile) -or -not (Test-Path -LiteralPath $PayloadFile)) { throw "payload_file_required" }
        $args = @($resolvedNaradaCli, "inbox", "submit", "--source-kind", $SourceKind, "--source-ref", $SourceRef, "--kind", $Kind, "--authority-level", $AuthorityLevel, "--principal", $Principal, "--payload-file", $PayloadFile, "--target-locus", $TargetLocus, "--cwd", $TargetSiteRoot, "--format", "json")
    }
    $result.command = "node " + ($args -join " ")

    try {
        $psi = [System.Diagnostics.ProcessStartInfo]::new()
        $psi.FileName = "node"
        if ($null -ne $psi.ArgumentList) {
            foreach ($arg in $args) { [void]$psi.ArgumentList.Add($arg) }
        } else {
            $psi.Arguments = ($args | ForEach-Object {
                $value = [string]$_
                if ($value -notmatch '[\s"]') { $value } else { '"' + ($value -replace '"', '\"') + '"' }
            }) -join " "
        }
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $process = [System.Diagnostics.Process]::Start($psi)
        [void]$process.WaitForExit()
        $result.exit_code = $process.ExitCode
        $result.stdout = $process.StandardOutput.ReadToEnd()
        $result.stderr = $process.StandardError.ReadToEnd()
        if ($process.ExitCode -eq 0) {
            $parsed = ConvertFrom-NaradaJson $result.stdout
            $result.status = "submitted"
            $result.envelope_id = if ($parsed.envelope_id) { [string]$parsed.envelope_id } elseif ($parsed.envelope.envelope_id) { [string]$parsed.envelope.envelope_id } else { $null }
            $result.read_back_confirmed = $true
        } else {
            $result.status = "refused"
        }
    } finally {}

    Write-NaradaJsonFile -Path $evidencePath -Value $result
    if ($result.exit_code -ne 0) {
        if ($PassThru) { ConvertTo-NaradaJson $result }
        throw "inbox_mcp_submission_failed: $($result.stderr)"
    }
    if ($PassThru) { ConvertTo-NaradaJson $result } else { Write-Host "Inbox MCP submitted $($result.envelope_id). Evidence: $evidencePath" }
} else {
    # Canonical inbox path: write to .ai/inbox-envelopes/ and append admission log
    $inboxDir = Join-Path $UserSiteRoot ".ai\inbox-envelopes"
    New-Item -ItemType Directory -Force -Path $inboxDir | Out-Null

    # Transform to canonical envelope format
    $receivedAt = (Get-Date -Format "o")
    $safeTs = $receivedAt -replace '[:.]', '-' -replace 'Z', 'Z'
    $canonicalEnvelope = [ordered]@{
        envelope_id = "env_" + $envelope.envelope_id
        received_at = $receivedAt
        source = [ordered]@{
            kind = $SourceKind
            ref = $SourceRef
        }
        kind = $Kind
        authority = [ordered]@{
            level = $AuthorityLevel
            principal = $Principal
        }
        target_locus = $TargetLocus
        payload = [ordered]@{
            title = $Title
            summary = $Summary
            evidence = @($Evidence)
            proposal = @($Proposal)
            recommendation = $Recommendation
        }
        status = "received"
    }
    $envelopePath = Join-Path $inboxDir ("${safeTs}-env_" + $envelope.envelope_id + ".json")
    Write-NaradaJsonFile -Path $envelopePath -Value $canonicalEnvelope

    # Append admission log event
    $admitScript = Join-Path $UserSiteRoot "tools\typed-mcp\inbox-admit.mjs"
    $admitResult = $null
    if (Test-Path -LiteralPath $admitScript) {
        $tmpFile = [System.IO.Path]::GetTempFileName()
        [System.IO.File]::WriteAllText($tmpFile, (ConvertTo-NaradaJson $canonicalEnvelope), [System.Text.UTF8Encoding]::new($false))
        try {
            $psi = [System.Diagnostics.ProcessStartInfo]::new()
            $psi.FileName = "node"
            if ($null -ne $psi.ArgumentList) {
                [void]$psi.ArgumentList.Add($admitScript)
                [void]$psi.ArgumentList.Add($UserSiteRoot)
                [void]$psi.ArgumentList.Add($tmpFile)
            } else {
                $psi.Arguments = "`"$admitScript`" `"$UserSiteRoot`" `"$tmpFile`""
            }
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError = $true
            $psi.UseShellExecute = $false
            $psi.CreateNoWindow = $true
            $proc = [System.Diagnostics.Process]::Start($psi)
            [void]$proc.WaitForExit()
            $admitOut = $proc.StandardOutput.ReadToEnd()
            if ($proc.ExitCode -eq 0) {
                $admitResult = ConvertFrom-NaradaJson $admitOut
            }
        } finally {
            Remove-Item -LiteralPath $tmpFile -ErrorAction SilentlyContinue
        }
    }

    $result.status = "admitted"
    $result.envelope_id = $canonicalEnvelope.envelope_id
    $result.envelope_path = $envelopePath
    $result.read_back_confirmed = $true
    if ($admitResult) {
        $result.admission_event_id = $admitResult.event_id
        $result.admission_event_seq = $admitResult.event_seq
    }
    $result.boundary = "facade_only: envelope admitted to canonical inbox and log appended via local JS module."
    Write-NaradaJsonFile -Path $evidencePath -Value $result
    if ($PassThru) { ConvertTo-NaradaJson $result } else { Write-Host "Inbox MCP admitted $($result.envelope_id) to $envelopePath. Evidence: $evidencePath" }
}
