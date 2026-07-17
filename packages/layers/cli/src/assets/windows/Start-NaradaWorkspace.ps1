# narada-managed-asset: windows-user-site.v1
[CmdletBinding()]
param(
  [switch]$Onboarding,
  [switch]$InteractiveSelection,
  [switch]$InteractiveSelectionUI,
  [switch]$DryRun,
  [switch]$NoWaitForEnterBeforeExec,
  [string[]]$Site,
  [string[]]$Role,
  [string[]]$Agent,
  [string[]]$OperatorSurface,
  [string]$Runtime,
  [string]$IntelligenceProvider,
  [string]$McpScope,
  [string]$ResultPath,
  [switch]$SuppressResultOutput
)

$ErrorActionPreference = 'Stop'

$narada = Get-Command narada -ErrorAction SilentlyContinue
if ($null -eq $narada) {
  throw 'narada_cli_not_found: install @narada2/cli globally, then rerun this launcher'
}

if ($Onboarding) {
  $args = @('onboarding', 'start', '--platform', 'windows', '--scope', 'user-site')
  if ($DryRun) { $args += '--no-exec' }
  & $narada.Source @args
  exit $LASTEXITCODE
}

$args = @('launcher', 'workspace-launch')
if ($InteractiveSelection) { $args += '--interactive-selection' }
if ($InteractiveSelectionUI) { $args += '--interactive-selection-ui' }
if ($DryRun) { $args += '--dry-run' }
if ($NoWaitForEnterBeforeExec) { $args += '--no-wait-for-enter-before-exec' }
if ($SuppressResultOutput) { $args += '--suppress-result-output' }
if ($Runtime) { $args += @('--runtime', $Runtime) }
if ($IntelligenceProvider) { $args += @('--intelligence-provider', $IntelligenceProvider) }
if ($McpScope) { $args += @('--mcp-scope', $McpScope) }
if ($ResultPath) { $args += @('--result-path', $ResultPath) }
foreach ($value in @($Site)) { if ($value) { $args += @('--site', $value) } }
foreach ($value in @($Role)) { if ($value) { $args += @('--role', $value) } }
foreach ($value in @($Agent)) { if ($value) { $args += @('--agent', $value) } }
foreach ($value in @($OperatorSurface)) { if ($value) { $args += @('--operator-surface', $value) } }

& $narada.Source @args
exit $LASTEXITCODE

