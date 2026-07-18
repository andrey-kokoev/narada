# narada-managed-asset: windows-user-site.v1
[CmdletBinding()]
param(
  [switch]$Onboarding,
  [switch]$DryRun,
  [switch]$All,
  [switch]$NoWaitForEnterBeforeExec,
  [switch]$EnableNativeShell,
  [switch]$VisibleRuntimeTerminal,
  [switch]$Smoke,
  [string[]]$ConfigPath,
  [string[]]$Site,
  [string[]]$Role,
  [string[]]$Agent,
  [string[]]$OperatorSurface,
  [string]$Runtime,
  [string]$IntelligenceProvider,
  [ValidateSet('all', 'host', 'user-site', 'local-site', 'none')]
  [string]$McpScope = 'all',
  [string]$RegistryPath,
  [ValidateSet('json', 'human', 'auto')]
  [string]$Format = 'auto',
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
if ($DryRun) { $args += '--dry-run' }
if ($All) { $args += '--all' }
if ($NoWaitForEnterBeforeExec) { $args += '--no-wait-for-enter-before-exec' }
if ($EnableNativeShell) { $args += '--enable-native-shell' }
if ($VisibleRuntimeTerminal) { $args += '--visible-runtime-terminal' }
if ($Smoke) { $args += '--smoke' }
if ($SuppressResultOutput) { $args += '--suppress-result-output' }
foreach ($value in @($ConfigPath)) { if ($value) { $args += @('--config-path', $value) } }
if ($RegistryPath) { $args += @('--registry-path', $RegistryPath) }
if ($Format) { $args += @('--format', $Format) }
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

