param(
  [Parameter(Position = 0)]
  [ValidateSet("agent-start")]
  [string]$Command = "agent-start",
  [Alias("AgentId")]
  [string]$Agent,
  [string]$Runtime = "agent-cli",
  [switch]$Exec,
  [switch]$DryRun,
  [switch]$Json,
  [switch]$EnableNativeShell,
  [switch]$AgentTuiInteractiveLoop,
  [switch]$AgentTuiProviderExecution,
  [switch]$AgentTuiMcpFabric,
  [int]$AgentTuiMaxSteps,
  [string]$StartingCarrierInput,
  [string]$StartingCarrierInputFile,
  [string]$AgentTuiStartingDirective,
  [string]$AgentTuiStartingDirectiveFile
)

$ErrorActionPreference = "Stop"

if ($Command -ne "agent-start") {
  throw "unsupported_command: $Command"
}

$siteRoot = if ($env:NARADA_LAUNCH_REGISTRY_SITE_ROOT) { $env:NARADA_LAUNCH_REGISTRY_SITE_ROOT } else { $PSScriptRoot }
$naradaProperRoot = $PSScriptRoot
$agentStart = Join-Path $naradaProperRoot "packages\agent-start\src\narada-agent-start.ts"
if (-not (Test-Path -LiteralPath $agentStart)) {
  throw "packaged_agent_start_missing: $agentStart"
}

if (-not $Agent) {
  $siteName = Split-Path -Leaf $siteRoot
  $Agent = "$siteName.architect"
}

$flags = @($Agent, "--target-site-root", $siteRoot, "--site-root", $siteRoot, "--launch-source", "$($MyInvocation.MyCommand.Name) agent-start")
if ($Runtime) { $flags += @("--runtime", $Runtime) }
if ($Exec) { $flags += "--exec" }
if ($DryRun) { $flags += "--dry-run" }
if ($Json) { $flags += "--json" }
if ($EnableNativeShell) { $flags += "--enable-native-shell" }
if ($AgentTuiInteractiveLoop) { $flags += "--agent-tui-interactive-loop" }
if ($AgentTuiProviderExecution) { $flags += "--agent-tui-provider-execution" }
if ($AgentTuiMcpFabric) { $flags += "--agent-tui-mcp-fabric" }
if ($AgentTuiMaxSteps -gt 0) { $flags += @("--agent-tui-max-steps", [string]$AgentTuiMaxSteps) }
if ($StartingCarrierInput) { $flags += @("--starting-carrier-input", $StartingCarrierInput) }
if ($StartingCarrierInputFile) { $flags += @("--starting-carrier-input-file", $StartingCarrierInputFile) }
if ($AgentTuiStartingDirective) { $flags += @("--agent-tui-starting-directive", $AgentTuiStartingDirective) }
if ($AgentTuiStartingDirectiveFile) { $flags += @("--agent-tui-starting-directive-file", $AgentTuiStartingDirectiveFile) }

$env:NARADA_AGENT_ID = $Agent
$env:NARADA_TARGET_SITE_ROOT = $siteRoot
$env:NARADA_LAUNCH_REGISTRY_SITE_ROOT = $siteRoot
$tsxLoader = "file:///D:/code/narada/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/loader.mjs"
& node --import $tsxLoader $agentStart @flags
exit $LASTEXITCODE

