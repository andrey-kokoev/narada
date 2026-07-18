param(
  [string]$WorkspaceLauncherPath = (Join-Path ($env:NARADA_USER_SITE_ROOT ? $env:NARADA_USER_SITE_ROOT : (Join-Path $HOME 'Narada')) 'Start-NaradaWorkspace.Dev.ps1'),
  [string]$Site = 'smart-scheduling',
  [string]$Role = 'resident',
  [string]$OperatorSurface = 'agent-cli',
  [string]$Runtime = 'narada-agent-runtime-server',
  [string]$IntelligenceProvider = 'codex-subscription',
  [string]$OutputRoot = (Join-Path (Get-Location) '.ai\tmp\workspace-launch-hidden-verification')
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$hiddenLog = Join-Path $OutputRoot 'hidden-runtime.jsonl'
$terminalLog = Join-Path $OutputRoot 'terminal.jsonl'
Remove-Item -LiteralPath $hiddenLog -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $terminalLog -Force -ErrorAction SilentlyContinue

$env:NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG = $hiddenLog
$env:NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG = $terminalLog

& $WorkspaceLauncherPath -Site $Site -Role $Role -OperatorSurface $OperatorSurface -Runtime $Runtime -IntelligenceProvider $IntelligenceProvider -McpScope all
$exitCode = $LASTEXITCODE

$resultRoot = Join-Path ($env:NARADA_USER_SITE_ROOT ? $env:NARADA_USER_SITE_ROOT : (Join-Path $HOME 'Narada')) '.narada\runtime\workspace-launch-results'
$latest = Get-ChildItem -LiteralPath $resultRoot -Filter 'workspace-launch-*.json' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$result = if ($latest) { Get-Content -LiteralPath $latest.FullName -Raw | ConvertFrom-Json } else { $null }
$hasTopLevelWtArgs = $false
$hasLaunchAgents = $false
$hasOperatorTerminalHandoff = $false
if ($result) {
  $propertyNames = @($result.PSObject.Properties.Name)
  $hasTopLevelWtArgs = $propertyNames -contains 'wt_args'
  $hasLaunchAgents = $propertyNames -contains 'launch_agents'
  $hasOperatorTerminalHandoff = ($propertyNames -contains 'operator_terminal_handoff') -and $result.operator_terminal_handoff.authority -eq 'narada-cli.workspace-launch-executor'
}
$passed = $exitCode -eq 0 `
  -and $result `
  -and $result.schema -eq 'narada.workspace_launch.launch_result.v1' `
  -and $result.status -eq 'launched' `
  -and $result.mode -eq 'launch' `
  -and $result.windows_terminal_invoked -eq $false `
  -and $result.hidden_runtime_invoked -eq $true `
  -and $hasLaunchAgents `
  -and $hasOperatorTerminalHandoff `
  -and -not $hasTopLevelWtArgs `
  -and (Test-Path -LiteralPath $hiddenLog -PathType Leaf) `
  -and -not (Test-Path -LiteralPath $terminalLog -PathType Leaf)

$verification = [ordered]@{
  schema = 'narada.workspace_launch.hidden_runtime_wrapper_verification.v1'
  status = if ($passed) { 'passed' } else { 'failed' }
  exit_code = $exitCode
  result_path = if ($latest) { [string]$latest.FullName } else { $null }
  result_schema = if ($result) { [string]$result.schema } else { $null }
  result_status = if ($result) { [string]$result.status } else { $null }
  result_mode = if ($result) { [string]$result.mode } else { $null }
  mutation_performed = if ($result) { [bool]$result.mutation_performed } else { $false }
  windows_terminal_invoked = if ($result) { [bool]$result.windows_terminal_invoked } else { $false }
  hidden_runtime_invoked = if ($result) { [bool]$result.hidden_runtime_invoked } else { $false }
  launch_agents_present = $hasLaunchAgents
  operator_terminal_handoff_present = $hasOperatorTerminalHandoff
  top_level_wt_args_present = $hasTopLevelWtArgs
  hidden_log = $hiddenLog
  hidden_log_exists = Test-Path -LiteralPath $hiddenLog -PathType Leaf
  terminal_log = $terminalLog
  terminal_log_exists = Test-Path -LiteralPath $terminalLog -PathType Leaf
}

$verification | ConvertTo-Json -Depth 20
if ($verification.status -ne 'passed') { exit 1 }
exit 0
