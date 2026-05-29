#requires -Version 5.1
<#
.SYNOPSIS
  Remove a leaked Sonar MCP server entry from the user Codex config.

.DESCRIPTION
  This is a narrow operator-authorized repair for a Staccato session that is
  trying to start narada-sonar-agent-context. It edits only the named MCP server
  table in C:\Users\Andrey\.codex\config.toml, writes a timestamped backup, and
  leaves all other config content unchanged.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$ConfigPath = 'C:\Users\Andrey\.codex\config.toml',
  [string]$ServerName = 'narada-sonar-agent-context',
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Codex config not found: $ConfigPath"
}

$content = Get-Content -LiteralPath $ConfigPath -Raw
$escaped = [regex]::Escape($ServerName)
$pattern = "(?ms)^\[mcp_servers\.$escaped\]\r?\n.*?(?=^\[|\z)"
$match = [regex]::Match($content, $pattern)

if (-not $match.Success) {
  [pscustomobject]@{
    Schema = 'narada.codex_config.remove_leaked_mcp.v0'
    Status = 'not_found'
    ConfigPath = $ConfigPath
    ServerName = $ServerName
    Changed = $false
  } | ConvertTo-Json -Depth 4
  return
}

$updated = $content.Remove($match.Index, $match.Length)
$updated = $updated -replace "(\r?\n){3,}", "`r`n`r`n"
$backupPath = '{0}.bak-{1}' -f $ConfigPath, (Get-Date -Format 'yyyyMMdd-HHmmss')

$result = [pscustomobject]@{
  Schema = 'narada.codex_config.remove_leaked_mcp.v0'
  Status = if ($DryRun) { 'planned' } else { 'updated' }
  ConfigPath = $ConfigPath
  BackupPath = if ($DryRun) { $null } else { $backupPath }
  ServerName = $ServerName
  Changed = $true
  RemovedBlock = $match.Value.Trim()
}

if (-not $DryRun) {
  if ($PSCmdlet.ShouldProcess($ConfigPath, "Remove MCP server block [$ServerName]")) {
    Copy-Item -LiteralPath $ConfigPath -Destination $backupPath -Force
    Set-Content -LiteralPath $ConfigPath -Value $updated -Encoding UTF8
  }
}

$result | ConvertTo-Json -Depth 6
