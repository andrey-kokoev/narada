param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("left", "down", "up", "right")]
    [string]$Direction,

    [switch]$DryRun,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

$command = @("komorebic", "stack", $Direction)
$result = [ordered]@{
    schema = "narada.operator_surfaces.komorebi_stack_invocation.v0"
    occurred_at = (Get-Date -Format "o")
    direction = $Direction
    dry_run = [bool]$DryRun
    command = $command
    status = "planned"
    exit_code = $null
    stdout = ""
    stderr = ""
}

if ($DryRun) {
    $result.status = "dry_run"
    if ($PassThru) { $result | ConvertTo-Json -Depth 10 } else { Write-Host (($command -join " ") + " (dry-run)") }
    return
}

$output = & komorebic stack $Direction 2>&1
$result.exit_code = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 0 }
$result.stdout = ($output | Out-String).Trim()
if ($result.exit_code -eq 0) {
    $result.status = "executed"
} else {
    $result.status = "failed"
    $result.stderr = $result.stdout
}

if ($PassThru) { $result | ConvertTo-Json -Depth 10 } else { Write-Host (($command -join " ") + " -> " + $result.status) }
if ($result.exit_code -ne 0) { exit $result.exit_code }
