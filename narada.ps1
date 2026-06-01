param(
  [Parameter(Position = 0)]
  [ValidateSet("agent-start")]
  [string]$Command = "agent-start",
  [Alias("AgentId")]
  [string]$Agent = "narada.architect",
  [string]$Runtime = "codex",
  [switch]$Exec,
  [switch]$DryRun,
  [switch]$Json,
  [switch]$EnableNativeShell,
  [switch]$AgentTuiInteractiveLoop,
  [int]$AgentTuiMaxSteps
)

$ErrorActionPreference = "Stop"

$siteRoot = $PSScriptRoot
$agentStart = Join-Path $siteRoot "tools\agent-start\start-agent.mjs"
if (-not (Test-Path -LiteralPath $agentStart)) {
  throw "agent_start_carrier_missing: $agentStart"
}

if ($Command -eq "agent-start") {
  $flags = @($Agent)
  if ($Runtime) { $flags += @("--runtime", $Runtime) }
  if ($Exec) { $flags += "--exec" }
  if ($DryRun) { $flags += "--dry-run" }
  if ($Json) { $flags += "--json" }
  if ($EnableNativeShell) { $flags += "--enable-native-shell" }
  if ($AgentTuiInteractiveLoop) { $flags += "--agent-tui-interactive-loop" }
  if ($AgentTuiMaxSteps -gt 0) { $flags += @("--agent-tui-max-steps", [string]$AgentTuiMaxSteps) }
  $env:NARADA_AGENT_ID = $Agent
  & node $agentStart @flags
  exit $LASTEXITCODE
}

throw "unsupported_command: $Command"
