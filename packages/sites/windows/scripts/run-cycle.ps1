#Requires -Version 5.1
<#
.SYNOPSIS
    Run a single Narada Cycle for a Windows Site.

.DESCRIPTION
    Resolves the Site root, opens the coordinator database, acquires a lock,
    executes a bounded Cycle, writes health/trace, and exits.

.PARAMETER SiteId
    The identifier of the Narada Site to run.

.PARAMETER SiteRoot
    Optional override for the Site root directory. Defaults to %LOCALAPPDATA%\Narada\{SiteId}.

.PARAMETER CeilingMs
    Maximum Cycle duration in milliseconds. Default: 30000.

.PARAMETER LockTtlMs
    Lock time-to-live in milliseconds. Default: 35000.

.EXAMPLE
    .\run-cycle.ps1 -SiteId "help-global-maxima"

.EXAMPLE
    .\run-cycle.ps1 -SiteId "help-global-maxima" -SiteRoot "C:\Narada\help-global-maxima"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteId,

    [Parameter(Mandatory = $false)]
    [string]$SiteRoot,

    [Parameter(Mandatory = $false)]
    [int]$CeilingMs = 30000,

    [Parameter(Mandatory = $false)]
    [int]$LockTtlMs = 35000
)

$ErrorActionPreference = "Stop"

# Resolve node executable
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error "Node.js is not installed or not in PATH."
    exit 1
}

# Resolve site root
if (-not $SiteRoot) {
    $localAppData = $env:LOCALAPPDATA
    if (-not $localAppData) {
        $localAppData = $env:USERPROFILE
    }
    $SiteRoot = Join-Path $localAppData "Narada" $SiteId
}

if (-not (Test-Path $SiteRoot)) {
    Write-Error "Site root not found: $SiteRoot"
    exit 1
}

# Ensure logs directory exists
$logsDir = Join-Path $SiteRoot "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

# Build the inline Node.js script that calls the Windows site runner
$nodeScript = @"
const { runWindowsCycle } = require('@narada2/windows-site');
const { WindowsSiteStore } = require('@narada2/windows-site');
const { resolveSite } = require('@narada2/windows-site');

async function main() {
  const resolved = resolveSite('$SiteId', { createIfMissing: false });
  const store = new WindowsSiteStore(resolved.dbPath);
  try {
    const result = await runWindowsCycle('$SiteId', resolved.siteRoot, store, {
      ceilingMs: $CeilingMs,
      lockTtlMs: $LockTtlMs,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'failed' ? 1 : 0);
  } finally {
    store.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
"@

# Execute via node, tee output to log
$logFile = Join-Path $logsDir "cycle-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

$process = Start-Process -FilePath $node -ArgumentList "-e", $nodeScript -NoNewWindow -Wait -PassThru

exit $process.ExitCode
