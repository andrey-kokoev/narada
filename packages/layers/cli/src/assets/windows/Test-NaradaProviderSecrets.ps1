[CmdletBinding()]
param(
  [string[]]$Provider
)

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'Set-NaradaProviderSecret.ps1'
$providers = if ($Provider) { $Provider } else { @('openai-api','kimi-api','kimi-code-api','anthropic-api','deepseek-api','glm-api','openrouter-api') }
$rows = foreach ($name in $providers) {
  $status = & $script -Provider $name -StatusOnly | ConvertFrom-Json
  [pscustomobject]@{ provider = $name; present = [bool]$status.present; secret_ref = $status.secret_ref }
}
$rows | ConvertTo-Json -Depth 4

