# narada-managed-asset: windows-user-site.v1
# Source-checkout (development) launcher. Drives `pnpm --dir <narada proper root> exec narada`
# with dist-freshness and carrier-projection checks. Published installs should use
# Start-NaradaWorkspace.ps1 (the thin published shim) instead.
param(
  [string[]]$Agent,

  [switch]$All,

  [string[]]$Role,

  [string[]]$Site,

  [string[]]$ConfigPath,

  [string]$RegistryPath = (Join-Path ($env:NARADA_USER_SITE_ROOT ? $env:NARADA_USER_SITE_ROOT : $PSScriptRoot) "config\launch\agents.psd1"),

  [Alias('Carrier')]
  [string[]]$OperatorSurface,

  [string]$Runtime,

  [string]$IntelligenceProvider,

  [ValidateSet('all', 'host', 'user-site', 'local-site', 'none')]
  [string]$McpScope = 'all',

  [switch]$Onboarding,

  [switch]$EnableNativeShell,

  [switch]$NoWaitForEnterBeforeExec,

  [switch]$VisibleRuntimeTerminal,

  [switch]$Smoke,

  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Import-NaradaLauncherEnvFile {
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $separatorIndex = $trimmed.IndexOf('=')
    if ($separatorIndex -le 0) { continue }
    $name = $trimmed.Substring(0, $separatorIndex).Trim()
    if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { continue }
    if ([Environment]::GetEnvironmentVariable($name, 'Process')) { continue }
    $value = $trimmed.Substring($separatorIndex + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function New-NaradaWorkspaceLaunchResultPath {
  param(
    [Parameter(Mandatory)]
    [string]$SiteRoot
  )
  $resultDir = Join-Path $SiteRoot ".narada\runtime\workspace-launch-results"
  New-Item -ItemType Directory -Force -Path $resultDir | Out-Null
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
  $suffix = [System.Guid]::NewGuid().ToString('N').Substring(0, 8)
  return (Join-Path $resultDir "workspace-launch-$stamp-$suffix.json")
}

function Format-NaradaWorkspaceLaunchSummary {
  param([Parameter(Mandatory=$true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  try {
    $result = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    return @()
  }
  $agents = @($result.selected_agents)
  if ($agents.Count -eq 0) { return @() }
  $lines = [System.Collections.Generic.List[string]]::new()
  foreach ($agent in $agents) {
    $surfaces = @($agent.launch_operator_surfaces) | Where-Object { $_ }
    if ($surfaces.Count -eq 0 -and $agent.launch_operator_surface) { $surfaces = @([string]$agent.launch_operator_surface) }
    if ($surfaces.Count -eq 0) { $surfaces = @($agent.launch_carriers) | Where-Object { $_ } }
    if ($surfaces.Count -eq 0 -and $agent.launch_carrier) { $surfaces = @([string]$agent.launch_carrier) }
    if ($surfaces.Count -eq 0 -and $agent.operator_surface_kind) { $surfaces = @([string]$agent.operator_surface_kind) }
    $runtime = if ($agent.runtime_host_kind) { [string]$agent.runtime_host_kind } elseif ($agent.launch_runtime) { [string]$agent.launch_runtime } else { [string]$agent.runtime }
    $provider = if ($agent.intelligence_provider) { [string]$agent.intelligence_provider } else { 'registry/default' }
    $site = if ($agent.site) { [string]$agent.site } else { [string]$agent.site_root }
    $role = if ($agent.role) { [string]$agent.role } else { [string]$agent.agent }
    $lines.Add("  - $site/${role}: operator surface(s) $($surfaces -join ', '); runtime $runtime; provider $provider")
  }
  return $lines
}
function Initialize-NaradaNodeRuntime {
  $fnm = Get-Command fnm -ErrorAction SilentlyContinue
  if (-not $fnm) { return }

  $envText = fnm env --use-on-cd 2>$null | Out-String
  if ($envText) {
    $envText | Invoke-Expression
  }

  $null = fnm use 22 2>$null
}

function Resolve-NaradaNodeInvocation {
  param(
    [Parameter(Mandatory)]
    [string]$NaradaProperRoot
  )

  if ($env:NARADA_NODE_EXECUTABLE) {
    if (-not (Test-Path -LiteralPath $env:NARADA_NODE_EXECUTABLE -PathType Leaf)) {
      throw "narada_node_executable_missing: $($env:NARADA_NODE_EXECUTABLE)"
    }
    return [pscustomobject]@{
      command = [System.IO.Path]::GetFullPath($env:NARADA_NODE_EXECUTABLE)
      args = @()
    }
  }

  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    return [pscustomobject]@{
      command = if ($node.Source) { [string]$node.Source } elseif ($node.Path) { [string]$node.Path } else { 'node' }
      args = @()
    }
  }

  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pnpm) {
    return [pscustomobject]@{
      command = if ($pnpm.Source) { [string]$pnpm.Source } elseif ($pnpm.Path) { [string]$pnpm.Path } else { 'pnpm' }
      args = @('--dir', $NaradaProperRoot, 'exec', 'node')
    }
  }

  throw 'narada_node_runtime_missing: neither node nor pnpm could be resolved'
}

function Resolve-NaradaProperRoot {
  $candidates = @()
  if ($env:NARADA_PROPER_ROOT) { $candidates += $env:NARADA_PROPER_ROOT }
  if ($env:NARADA_CLI_PACKAGE_ROOT) { $candidates += (Join-Path $env:NARADA_CLI_PACKAGE_ROOT "..\..\..") }

  foreach ($candidate in $candidates) {
    if (-not $candidate) { continue }
    $rootPackagePath = Join-Path $candidate "package.json"
    $cliPackagePath = Join-Path $candidate "packages\layers\cli\package.json"
    if ((Test-Path -LiteralPath $rootPackagePath -PathType Leaf) -and (Test-Path -LiteralPath $cliPackagePath -PathType Leaf)) {
      return [System.IO.Path]::GetFullPath($candidate)
    }
  }

  throw 'narada_proper_root_missing: set NARADA_PROPER_ROOT to the Narada proper workspace root'
}

function Assert-NaradaCliDistFreshness {
  param(
    [Parameter(Mandatory)]
    [string]$NaradaProperRoot
  )

  $manifestLibPath = Join-Path $NaradaProperRoot "packages\layers\cli\scripts\build-manifest-lib.mjs"
  if (-not (Test-Path -LiteralPath $manifestLibPath -PathType Leaf)) {
    throw "narada_cli_dist_freshness_check_missing: $manifestLibPath"
  }

  $nodeInvocation = Resolve-NaradaNodeInvocation -NaradaProperRoot $NaradaProperRoot
  $nodeScript = @'
import { pathToFileURL } from 'node:url';

const siteRoot = process.argv[1];
const manifestLibPath = process.argv[2];

try {
  const module = await import(pathToFileURL(manifestLibPath).href);
  const result = module.checkCliDistFreshness(siteRoot);
  console.log(JSON.stringify(result));
  process.exit(result.status === 'current' || result.status === 'not_applicable' ? 0 : 2);
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
'@

  $output = & $nodeInvocation.command @($nodeInvocation.args) --input-type=module -e $nodeScript $NaradaProperRoot $manifestLibPath 2>&1
  $exitCode = $LASTEXITCODE
  if ($exitCode -eq 0) { return }

  $json = Get-JsonPayloadFromOutput -Output $output
  if ($json) {
    $result = $json | ConvertFrom-Json
    $requiredCommand = if ($result.required_command) { [string]$result.required_command } else { 'pnpm --filter @narada2/cli build' }
    $reason = if ($result.reason) { [string]$result.reason } else { 'unknown' }
    $status = if ($result.status) { [string]$result.status } else { 'unknown' }
    if ($status -eq 'stale') {
      $null = Get-Command pnpm -ErrorAction Stop
      Write-Host "Narada CLI dist is stale ($reason); rebuilding @narada2/cli..."
      Push-Location -LiteralPath $NaradaProperRoot
      try {
        $buildOutput = & pnpm --filter "@narada2/cli" build 2>&1
        $buildExitCode = $LASTEXITCODE
      } finally {
        Pop-Location
      }
      if ($buildExitCode -ne 0) {
        $buildText = ($buildOutput | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
        throw "narada_cli_dist_rebuild_failed: pnpm exited $buildExitCode. Run: Set-Location -LiteralPath '$NaradaProperRoot'; $requiredCommand" + [Environment]::NewLine + $buildText
      }

      $recheckOutput = & $nodeInvocation.command @($nodeInvocation.args) --input-type=module -e $nodeScript $NaradaProperRoot $manifestLibPath 2>&1
      $recheckExitCode = $LASTEXITCODE
      if ($recheckExitCode -eq 0) { return }

      $recheckJson = Get-JsonPayloadFromOutput -Output $recheckOutput
      if ($recheckJson) {
        $recheckResult = $recheckJson | ConvertFrom-Json
        $recheckReason = if ($recheckResult.reason) { [string]$recheckResult.reason } else { 'unknown' }
        throw "narada_cli_dist_stale_after_rebuild: $recheckReason. Run: Set-Location -LiteralPath '$NaradaProperRoot'; $requiredCommand"
      }

      $recheckText = ($recheckOutput | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
      throw "narada_cli_dist_freshness_recheck_failed: node exited $recheckExitCode" + [Environment]::NewLine + $recheckText
    }

    throw "narada_cli_dist_stale: $reason. Run: Set-Location -LiteralPath '$NaradaProperRoot'; $requiredCommand"
  }

  $text = ($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
  throw "narada_cli_dist_freshness_check_failed: node exited $exitCode" + [Environment]::NewLine + $text
}

function Add-RepeatedOption {
  param(
    [Parameter(Mandatory)]
    [System.Collections.Generic.List[string]]$Args,

    [Parameter(Mandatory)]
    [string]$Name,

    [string[]]$Values
  )

  if (-not $Values -or $Values.Count -eq 0) { return }
  $Args.Add($Name)
  foreach ($value in $Values) {
    if ($value) { $Args.Add($value) }
  }
}

function Get-JsonPayloadFromOutput {
  param(
    [AllowNull()]
    [object[]]$Output
  )

  if ($null -eq $Output) { return $null }
  $lines = @($Output | ForEach-Object { [string]$_ })
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*[\{\[]') {
      return ($lines[$i..($lines.Count - 1)] -join [Environment]::NewLine)
    }
  }
  return $null
}

function Assert-NaradaCarrierProjectionFreshness {
  param(
    [Parameter(Mandatory)]
    [string]$NaradaProperRoot,

    [Parameter(Mandatory)]
    [string]$SiteRoot
  )

  # Only an established User Site carries the capabilities registry the
  # generator reads; bare fixture roots have no projection to keep fresh.
  $capabilitiesRegistryPath = Join-Path $SiteRoot '.narada\capabilities\mcp-surfaces.json'
  if (-not (Test-Path -LiteralPath $capabilitiesRegistryPath -PathType Leaf)) { return }

  $generatorPath = Join-Path $NaradaProperRoot 'packages\typed-mcp-surface\src\generate-carrier-mcp-config.mjs'
  if (-not (Test-Path -LiteralPath $generatorPath -PathType Leaf)) {
    throw "narada_carrier_projection_generator_missing: $generatorPath"
  }

  $nodeInvocation = Resolve-NaradaNodeInvocation -NaradaProperRoot $NaradaProperRoot
  $output = & $nodeInvocation.command @($nodeInvocation.args) $generatorPath --site-root $SiteRoot --carrier all --write --check 2>&1
  if ($LASTEXITCODE -eq 0) { return }

  $tail = @($output | Select-Object -Last 40 | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
  throw "narada_carrier_projection_refresh_failed: node exited $LASTEXITCODE" + [Environment]::NewLine + $tail
}

function Invoke-NaradaWorkspaceLaunch {
  # The launcher's home is the User Site root: when installed, $PSScriptRoot is
  # that root; when driven from a repo checkout (tests, development), an
  # explicit NARADA_USER_SITE_ROOT points at the fixture or real site instead.
  $userSiteRoot = if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { $PSScriptRoot }
  Import-NaradaLauncherEnvFile -Path (Join-Path $userSiteRoot '.env')
  Initialize-NaradaNodeRuntime

  $naradaProperRoot = Resolve-NaradaProperRoot
  # Child projections use this launcher-resolved root to load canonical contracts.
  [Environment]::SetEnvironmentVariable('NARADA_PROPER_ROOT', $naradaProperRoot, 'Process')
  Assert-NaradaCliDistFreshness -NaradaProperRoot $naradaProperRoot

  if ($Onboarding) {
    if ($All -or $Agent -or $Role -or $Site -or $OperatorSurface -or $Runtime -or $IntelligenceProvider -or $VisibleRuntimeTerminal) {
      throw 'onboarding_selection_conflict: -Onboarding owns User Site defaults; use the advanced workspace launcher for explicit selections.'
    }

    $onboardingArgs = [System.Collections.Generic.List[string]]::new()
    $onboardingArgs.Add('--dir')
    $onboardingArgs.Add($naradaProperRoot)
    $onboardingArgs.Add('exec')
    $onboardingArgs.Add('narada')
    $onboardingArgs.Add('onboarding')
    $onboardingArgs.Add('start')
    $onboardingArgs.Add('--platform')
    $onboardingArgs.Add('windows')
    $onboardingArgs.Add('--scope')
    $onboardingArgs.Add('user-site')
    $onboardingArgs.Add('--site-root')
    $onboardingArgs.Add($PSScriptRoot)
    if (-not $DryRun) { $onboardingArgs.Add('--interactive') }
    if ($DryRun) { $onboardingArgs.Add('--no-exec') }

    & pnpm @onboardingArgs
    exit $LASTEXITCODE
  }

  Assert-NaradaCarrierProjectionFreshness -NaradaProperRoot $naradaProperRoot -SiteRoot $userSiteRoot

  $cliArgs = [System.Collections.Generic.List[string]]::new()
  $cliArgs.Add('--dir')
  $cliArgs.Add($naradaProperRoot)
  $cliArgs.Add('exec')
  $cliArgs.Add('narada')
  $cliArgs.Add('launcher')
  $cliArgs.Add('workspace-launch')
  $cliArgs.Add('--format')
  $cliArgs.Add('json')

  $resultPath = $null
  if (-not $DryRun -and -not $Smoke) {
    $resultPath = New-NaradaWorkspaceLaunchResultPath -SiteRoot $userSiteRoot
    $cliArgs.Add('--result-path')
    $cliArgs.Add($resultPath)
    $cliArgs.Add('--suppress-result-output')
  }

  Add-RepeatedOption -Args $cliArgs -Name '--agent' -Values $Agent
  if ($All) { $cliArgs.Add('--all') }
  Add-RepeatedOption -Args $cliArgs -Name '--role' -Values $Role
  Add-RepeatedOption -Args $cliArgs -Name '--site' -Values $Site
  Add-RepeatedOption -Args $cliArgs -Name '--config-path' -Values $ConfigPath

  if ($RegistryPath) {
    $cliArgs.Add('--registry-path')
    $cliArgs.Add($RegistryPath)
  }

  if ($OperatorSurface) {
    $cliArgs.Add('--operator-surface')
    $cliArgs.Add(($OperatorSurface | Where-Object { $_ } | ForEach-Object { $_.Trim() }) -join ',')
  }

  if ($Runtime) {
    $cliArgs.Add('--runtime')
    $cliArgs.Add($Runtime)
  }

  if ($IntelligenceProvider) {
    $cliArgs.Add('--intelligence-provider')
    $cliArgs.Add($IntelligenceProvider)
  }

  if ($McpScope) {
    $cliArgs.Add('--mcp-scope')
    $cliArgs.Add($McpScope)
  }

  if ($EnableNativeShell) { $cliArgs.Add('--enable-native-shell') }
  if ($NoWaitForEnterBeforeExec) { $cliArgs.Add('--no-wait-for-enter-before-exec') }
  if ($VisibleRuntimeTerminal) { $cliArgs.Add('--visible-runtime-terminal') }
  if ($Smoke) { $cliArgs.Add('--smoke') }
  if ($DryRun) { $cliArgs.Add('--dry-run') }

  & pnpm @cliArgs
  $exitCode = $LASTEXITCODE
  if ($resultPath) {
    if ($exitCode -eq 0) {
      Write-Output "Narada workspace launch started. Result: $resultPath"
      $summaryLines = Format-NaradaWorkspaceLaunchSummary -Path $resultPath
      if ($summaryLines.Count -gt 0) {
        Write-Output "Resolved launch choices:"
        $summaryLines | ForEach-Object { Write-Output $_ }
      }
    } else {
      Write-Output "Narada workspace launch failed with exit code $exitCode. Result: $resultPath"
    }
  }
  exit $exitCode
}

Invoke-NaradaWorkspaceLaunch
