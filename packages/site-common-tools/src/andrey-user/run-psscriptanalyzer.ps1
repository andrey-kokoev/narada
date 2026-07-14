<#PSScriptInfo
    .VERSION 1.0.0
    .GUID 275-psscriptanalyzer-runner
    .AUTHOR andrey-user.resident
    .DESCRIPTION
        Runs PSScriptAnalyzer over the User Site, producing a baseline report.
        Discovered settings from PSScriptAnalyzerSettings.psd1 at repo root.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
    [string]$SettingsPath = (Join-Path $RepoRoot 'PSScriptAnalyzerSettings.psd1'),
    [string]$OutputPath = (Join-Path $RepoRoot 'tmp' 'psscriptanalyzer-baseline.json'),
    [ValidateSet('json', 'markdown', 'console')][string]$Format = 'json',
    [string[]]$PathFilter,
    [switch]$IncludeInformation,
    [switch]$PassThru
)

$ErrorActionPreference = 'Stop'

# --- Ensure PSScriptAnalyzer is available ---
if (-not (Get-Module -ListAvailable -Name PSScriptAnalyzer)) {
    throw "PSScriptAnalyzer is not installed. Install with: Install-Module -Name PSScriptAnalyzer -Force -Scope CurrentUser"
}
Import-Module PSScriptAnalyzer -Force

# --- Gather target files ---
$excludePatterns = @('*.git*', '*node_modules*', '*.venv*', '*vendor*')
$allPs1 = Get-ChildItem -Path $RepoRoot -Recurse -Filter '*.ps1' |
    Where-Object {
        $f = $_.FullName
        foreach ($pat in $excludePatterns) { if ($f -like $pat) { return $false } }
        return $true
    }

if ($PathFilter) {
    $allPs1 = $allPs1 | Where-Object {
        $rel = $_.FullName.Substring($RepoRoot.Length + 1)
        foreach ($pf in $PathFilter) { if ($rel -like $pf) { return $true } }
        return $false
    }
}

$total = $allPs1.Count
Write-Host "Scanning $total .ps1 files..."

# --- Build analyzer parameters ---
# NOTE: PSScriptAnalyzer 1.25 has a bug where -Path <singlefile> -Settings <file>
# crashes with AggregateException. We always scan the whole repo and filter results.
$analyzerParams = @{
    Path     = $RepoRoot
    Recurse  = $true
    Settings = $SettingsPath
}
if (-not $IncludeInformation) {
    $analyzerParams['Severity'] = @('Error', 'Warning')
}

# --- Run analysis ---
$start = Get-Date
$rawResults = Invoke-ScriptAnalyzer @analyzerParams
$elapsed = (Get-Date) - $start

# --- Filter to target files ---
$targetPaths = $allPs1 | ForEach-Object { $_.FullName }
$results = $rawResults | Where-Object { $targetPaths -contains $_.ScriptPath }

# --- Summarize ---
$summary = [ordered]@{
    scanned_at       = (Get-Date -Format 'o')
    repo_root        = $RepoRoot
    settings_path    = $SettingsPath
    files_scanned    = $total
    total_findings   = $results.Count
    errors           = ($results | Where-Object Severity -eq 'Error').Count
    warnings         = ($results | Where-Object Severity -eq 'Warning').Count
    information      = ($results | Where-Object Severity -eq 'Information').Count
    elapsed_seconds  = [math]::Round($elapsed.TotalSeconds, 2)
    rules_triggered  = ($results | Group-Object RuleName | Sort-Object Count -Descending | Select-Object Name, Count)
    files_with_issues = ($results | Group-Object ScriptPath | Sort-Object Count -Descending | Select-Object Name, Count)
}

# --- Per-finding enrichment ---
$enriched = $results | ForEach-Object {
    $relPath = $_.ScriptPath.Substring($RepoRoot.Length + 1)
    $category = switch -Wildcard ($relPath) {
        'tools*'       { 'tools' }
        'templates*'   { 'templates' }
        'vendor*'      { 'vendor' }
        'tombstones*'  { 'tombstones' }
        default        { 'root' }
    }
    [PSCustomObject]@{
        file        = $relPath
        category    = $category
        line        = $_.Line
        rule        = $_.RuleName
        severity    = $_.Severity
        message     = $_.Message
        suggestion  = $_.SuggestedCorrections
    }
}

# --- Output ---
$outputObj = [ordered]@{
    summary  = $summary
    findings = $enriched
}

switch ($Format) {
    'json' {
        $dir = Split-Path -Parent $OutputPath
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $outputObj | ConvertTo-Json -Depth 10 | Set-Content -Path $OutputPath -Encoding UTF8
        Write-Host "Wrote $OutputPath ($($results.Count) findings)"
    }
    'markdown' {
        $mdPath = [System.IO.Path]::ChangeExtension($OutputPath, '.md')
        $lines = @("# PSScriptAnalyzer Baseline Report", "")
        $lines += "| Metric | Value |"
        $lines += "|--------|-------|"
        $lines += "| Scanned at | $($summary.scanned_at) |"
        $lines += "| Files scanned | $($summary.files_scanned) |"
        $lines += "| Total findings | $($summary.total_findings) |"
        $lines += "| Errors | $($summary.errors) |"
        $lines += "| Warnings | $($summary.warnings) |"
        $lines += "| Elapsed | $($summary.elapsed_seconds)s |"
        $lines += "", "## Findings by File", ""
        foreach ($g in ($enriched | Group-Object file | Sort-Object Count -Descending)) {
            $lines += "### $($g.Name) ($($g.Count))"
            foreach ($f in $g.Group) {
                $lines += "- **$($f.rule)** [$($f.severity)] L$($f.line): $($f.message)"
            }
            $lines += ""
        }
        $lines | Set-Content -Path $mdPath -Encoding UTF8
        Write-Host "Wrote $mdPath"
    }
    'console' {
        $enriched | Format-Table -AutoSize
    }
}

if ($PassThru) {
    return $outputObj
}

# Exit non-zero if errors exist (CI-friendly)
if ($summary.errors -gt 0) { exit 1 }
exit 0
