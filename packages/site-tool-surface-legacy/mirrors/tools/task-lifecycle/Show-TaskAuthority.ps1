param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

$canonicalTaskDir = Join-Path $UserSiteRoot ".ai\do-not-open\tasks"
$runtimeDb = Join-Path $UserSiteRoot ".ai\task-lifecycle.db"
$snapshot = Join-Path $UserSiteRoot ".ai\task-lifecycle-snapshot.json"
$legacyTaskDir = Join-Path $UserSiteRoot ".ai\tasks"
$legacyMarker = Join-Path $legacyTaskDir "000-NON-AUTHORITATIVE-ARCHIVE.md"
$legacyDb = Join-Path $legacyTaskDir "task-lifecycle.db"

$canonicalTasks = @()
if (Test-Path -LiteralPath $canonicalTaskDir) {
    $canonicalTasks = @(Get-ChildItem -LiteralPath $canonicalTaskDir -Filter "*.md" -File | Sort-Object Name)
}

$legacyTasks = @()
if (Test-Path -LiteralPath $legacyTaskDir) {
    $legacyTasks = @(Get-ChildItem -LiteralPath $legacyTaskDir -Filter "*.md" -File | Sort-Object Name)
}

$latestCanonical = @($canonicalTasks | Select-Object -Last 5 | ForEach-Object { $_.Name })
$latestLegacy = @($legacyTasks | Select-Object -Last 5 | ForEach-Object { $_.Name })
$statusCounts = @()
$sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
if ($sqlite -and (Test-Path -LiteralPath $runtimeDb)) {
    $statusCounts = @(& $sqlite.Source $runtimeDb "select status || ':' || count(*) from task_lifecycle group by status order by status;" 2>$null)
}

$result = [ordered]@{
    user_site_root = $UserSiteRoot
    canonical = [ordered]@{
        task_specs = $canonicalTaskDir
        task_specs_exists = Test-Path -LiteralPath $canonicalTaskDir
        task_count = $canonicalTasks.Count
        runtime_db = $runtimeDb
        runtime_db_exists = Test-Path -LiteralPath $runtimeDb
        status_counts = $statusCounts
        git_visible_snapshot = $snapshot
        git_visible_snapshot_exists = Test-Path -LiteralPath $snapshot
        latest_task_files = $latestCanonical
    }
    legacy = [ordered]@{
        path = $legacyTaskDir
        exists = Test-Path -LiteralPath $legacyTaskDir
        marker = $legacyMarker
        marker_exists = Test-Path -LiteralPath $legacyMarker
        legacy_db = $legacyDb
        legacy_db_exists = Test-Path -LiteralPath $legacyDb
        task_count = $legacyTasks.Count
        latest_task_files = $latestLegacy
        status = "archived_traceability_not_task_authority"
    }
    cli = [ordered]@{
        preferred = "narada <command> --cwd `"$UserSiteRoot`""
        current_windows_fallback = "node <narada-proper>\packages\layers\cli\dist\main.js <command> --cwd `"$UserSiteRoot`""
    }
    warning = "Do not commission tasks from .ai/tasks; use .ai/do-not-open/tasks plus Narada CLI lifecycle commands."
}

if ($PassThru) {
    $result | ConvertTo-Json -Depth 20
} else {
    [pscustomobject]$result.canonical | Format-List
    [pscustomobject]$result.legacy | Format-List
    Write-Host $result.warning
    Write-Host ("Preferred CLI: {0}" -f $result.cli.preferred)
    Write-Host ("Fallback CLI:  {0}" -f $result.cli.current_windows_fallback)
}
