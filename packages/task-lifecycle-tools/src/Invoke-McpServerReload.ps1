#Requires -Version 5.1
<#
.SYNOPSIS
    Reloads the task-lifecycle MCP server by terminating the existing process and spawning a fresh one.

.DESCRIPTION
    The task-lifecycle MCP server (task-mcp-server.mjs) does not hot-reload when its source code changes.
    Agents that modify the server code must restart the process for changes to take effect.
    This script finds the running server and restarts it.

.PARAMETER SiteRoot
    Path to the Narada site root. Defaults to the current working directory.

.PARAMETER WaitSeconds
    Seconds to wait after killing the old process before starting the new one. Default: 1
#>
param(
    [string]$SiteRoot = (Get-Location).Path,
    [int]$WaitSeconds = 1
)

$ErrorActionPreference = 'Stop'

# Find the running task-mcp-server.mjs process
$processes = Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%task-mcp-server.mjs%'" | Where-Object {
    $_.CommandLine -notlike '%powershell%'
}

if ($processes) {
    Write-Host "Found $($processes.Count) task-mcp-server process(es). Terminating..." -ForegroundColor Yellow
    foreach ($proc in $processes) {
        Stop-Process -Id $proc.ProcessId -Force
        Write-Host "  Killed PID $($proc.ProcessId)" -ForegroundColor DarkGray
    }
    if ($WaitSeconds -gt 0) {
        Start-Sleep -Seconds $WaitSeconds
    }
} else {
    Write-Host "No running task-mcp-server found. Starting fresh." -ForegroundColor Cyan
}

# Start a new instance
$serverPath = Join-Path $SiteRoot 'tools\task-lifecycle\task-mcp-server.mjs'
if (-not (Test-Path $serverPath)) {
    Write-Error "task-mcp-server.mjs not found at: $serverPath"
    exit 1
}

Write-Host "Starting task-mcp-server.mjs..." -ForegroundColor Green
Start-Process node -ArgumentList $serverPath -WindowStyle Hidden
Write-Host "MCP server reload complete." -ForegroundColor Green
