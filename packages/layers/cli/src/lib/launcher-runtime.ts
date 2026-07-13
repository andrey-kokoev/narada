import { accessSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NARADA_AGENT_RUNTIME_SERVER_KIND } from '@narada2/carrier-runtime-contract/carrier-runtime-selection';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import { buildLaunchProcessOwnership, launchSessionIdFromToken, type LaunchProcessOwnership } from '@narada2/launch-process-ownership';
import type {
  AgentStartCommandResult,
  AgentStartOptions,
  CommandExecutionResult,
  LaunchResultRecord,
  SiteCommandResult,
} from './launcher-contracts.js';
import {
  runPowerShell,
  runProcess,
  runProcessDetachedUntilJson,
  runProcessInherited,
  isAccessDeniedMessage,
  truncateText,
  windowsElevationState,
} from './launcher-runtime-process.js';
import { readJsonFile, stringValue, tryParseJson } from './launcher-runtime-results.js';
import {
  classifyAgentStartLaunchBindingStatus,
  getOperatorSurfaceRuntimeControlPath,
  getOperatorSurfaceRuntimeStatus,
  writeOperatorProjectionLaunchBinding,
} from './launcher-runtime-projection.js';
import {
  checkWorkspaceDependencyPreflight,
  formatWorkspaceDependencyPreflightFailure,
} from './workspace-dependency-preflight.js';
export {
  classifyAgentStartLaunchBindingStatus,
  getOperatorSurfaceRuntimeControlPath,
  getOperatorSurfaceRuntimeStatus,
  writeOperatorProjectionLaunchBinding,
} from './launcher-runtime-projection.js';

const requireFromLauncherRuntime = createRequire(import.meta.url);

function tsxImportPath(): string {
  return pathToFileURL(requireFromLauncherRuntime.resolve('tsx')).href;
}

export interface SchedulerDaemonPlanOptions {
  siteRoot: string;
  taskName?: string;
  hidden?: boolean;
  dryRun?: boolean;
  execute?: boolean;
}

export interface SchedulerDaemonStatusResult {
  schema: 'narada.scheduler.site_daemon.status.v0';
  status: 'ok' | 'not_found' | 'unsupported' | 'access_denied' | 'error';
  mutation_performed: boolean;
  site_root: string;
  task_name: string;
  platform: NodeJS.Platform;
  scheduler: 'windows_task_scheduler';
  task?: unknown;
  error?: string;
}

export interface SchedulerDaemonInstallPlan {
  schema: 'narada.scheduler.site_daemon.install_plan.v0';
  status: 'planned' | 'requires_elevation' | 'unsupported';
  mutation_performed: boolean;
  site_root: string;
  task_name: string;
  platform: NodeJS.Platform;
  hidden: boolean;
  dry_run: boolean;
  elevation_required: boolean;
  elevation_available: false;
  elevation_packet?: {
    kind: 'windows_scheduled_task_install';
    task_name: string;
    site_root: string;
    command: string;
    arguments: string[];
    hidden_runner?: string;
    supervisor?: string;
  };
  checks: Array<{ name: string; ok: boolean; path?: string; detail?: string }>;
  execution?: CommandExecutionResult;
}

export function shouldDetachAgentStartProcess(options: Pick<AgentStartOptions, 'exec' | 'wait' | 'carrier' | 'runtime'>): boolean {
  if (options.exec !== true || options.wait === true) return false;
  return options.runtime === NARADA_AGENT_RUNTIME_SERVER_KIND;
}

export function runAgentStartCommand(options: AgentStartOptions): AgentStartCommandResult {
  const siteRoot = resolve(options.siteRoot);
  const workspaceRoot = options.workspaceRoot ? resolve(options.workspaceRoot) : naradaProperRoot();
  const launchSessionId = options.launchSessionId ?? launchSessionIdFromToken(options.launchBindingPath?.split(/[\\/]/).pop());
  const processOwnership = launchSessionId
    ? buildLaunchProcessOwnership({ launchSessionId, siteRoot, workspaceRoot, processRole: 'runtime_start', createdByPid: process.pid })
    : null;
  const resolvedAgentStart = resolveAgentStartEntrypoint(workspaceRoot);
  const siteRootAgentStart = join(siteRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');
  const agentStart = existsSync(resolvedAgentStart) || !existsSync(siteRootAgentStart)
    ? resolvedAgentStart
    : siteRootAgentStart;
  const resultDir = join(workspaceRoot, '.ai', 'runtime', 'agent-start-command-results', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const resultPath = join(resultDir, 'result.json');
  const inheritedInteractiveExec = options.exec === true && options.dryRun !== true;
  const args = [
    '--import',
    tsxImportPath(),
    agentStart,
    options.agent,
    '--target-site-root',
    siteRoot,
    '--site-root',
    siteRoot,
    '--operator-surface',
    options.carrier ?? options.runtime,
    '--runtime',
    options.runtime,
    '--launch-source',
    options.launchSource ?? 'narada operator-surface start',
    '--json-output-file',
    resultPath,
  ];
  if (options.targetSiteId) args.push('--target-site-id', options.targetSiteId);
  if (!inheritedInteractiveExec) args.push('--json');
  if (options.authority) args.push('--authority', options.authority);
  if (options.intelligenceProvider) args.push('--intelligence-provider', options.intelligenceProvider);
  if (options.mcpScope) args.push('--mcp-scope', options.mcpScope);
  if (options.dryRun) args.push('--dry-run');
  if (options.exec) args.push('--exec');
  if (options.wait) args.push('--wait');
  if (options.enableNativeShell) args.push('--enable-native-shell');

  const dependencyPreflight = checkWorkspaceDependencyPreflight(workspaceRoot);
  if (dependencyPreflight.status !== 'ready') {
    return {
      schema: 'narada.agent_start.command_result.v0',
      status: 'not_available',
      mutation_performed: false,
      site_root: siteRoot,
      agent: options.agent,
      carrier: options.carrier,
      runtime: options.runtime,
      command: [process.execPath, ...args],
      error: formatWorkspaceDependencyPreflightFailure(dependencyPreflight),
    };
  }

  mkdirSync(resultDir, { recursive: true });
  writeOperatorProjectionLaunchBinding(options.launchBindingPath, {
    status: 'waiting_for_agent_start',
    siteRoot,
    workspaceRoot,
    agent: options.agent,
    operatorSurfaceKind: options.carrier ?? options.runtime,
    runtimeHostKind: options.runtime,
    authority: options.authority ?? null,
    intelligenceProvider: options.intelligenceProvider ?? null,
    agentStartResultFile: resultPath,
    launchSessionId,
    processOwnership,
  });

  if (!existsSync(agentStart)) {
    return {
      schema: 'narada.agent_start.command_result.v0',
      status: 'not_available',
      mutation_performed: false,
      site_root: siteRoot,
      agent: options.agent,
      carrier: options.carrier,
      runtime: options.runtime,
      command: [process.execPath, ...args],
      result_handoff: 'json_output_file',
      result_file: resultPath,
      error: `agent-start entrypoint not found: ${agentStart}`,
    };
  }

  const executionEnv = {
    NARADA_TARGET_SITE_ROOT: siteRoot,
    ...(options.targetSiteId ? { NARADA_TARGET_SITE_ID: options.targetSiteId } : {}),
    NARADA_LAUNCH_REGISTRY_SITE_ROOT: siteRoot,
    NARADA_LAUNCH_REGISTRY_WORKSPACE_ROOT: workspaceRoot,
    ...(launchSessionId ? { NARADA_LAUNCH_SESSION_ID: launchSessionId } : {}),
    ...(processOwnership ? {
      NARADA_PROCESS_OWNERSHIP: processOwnership.ownership,
      NARADA_PROCESS_ROLE: 'runtime_server',
      NARADA_CREATED_BY_PID: String(processOwnership.created_by_pid ?? process.pid),
    } : {}),
    NARADA_AGENT_ID: options.agent,
    ...(options.intelligenceProvider ? { NARADA_INTELLIGENCE_PROVIDER: options.intelligenceProvider } : {}),
  };
  const execution = shouldDetachAgentStartProcess(options)
    ? runProcessDetachedUntilJson(process.execPath, args, workspaceRoot, resultPath, executionEnv)
    : inheritedInteractiveExec
    ? runProcessInherited(process.execPath, args, workspaceRoot, executionEnv)
    : runProcess(process.execPath, args, workspaceRoot, executionEnv);
  const parsed = readJsonFile(resultPath);
  const parsedRecord = parsed as LaunchResultRecord | null;
  const launchBindingStatus = classifyAgentStartLaunchBindingStatus(execution.status, parsedRecord);
  writeOperatorProjectionLaunchBinding(options.launchBindingPath, {
    status: launchBindingStatus.status,
    siteRoot,
    workspaceRoot,
    agent: options.agent,
    operatorSurfaceKind: options.carrier ?? options.runtime,
    runtimeHostKind: options.runtime,
    intelligenceProvider: options.intelligenceProvider ?? null,
    agentStartResultFile: resultPath,
    narsSessionId: stringValue(parsedRecord?.nars_launch?.nars_session_id ?? parsedRecord?.nars_launch?.session_id ?? parsedRecord?.required_environment?.NARADA_NARS_SESSION_ID),
    runtimeSessionId: stringValue(parsedRecord?.nars_launch?.runtime_session_id ?? parsedRecord?.nars_launch?.session_id ?? parsedRecord?.required_environment?.NARADA_RUNTIME_SESSION_ID),
    carrierSessionId: stringValue(parsedRecord?.carrier_session?.carrier_session_id ?? parsedRecord?.required_environment?.NARADA_CARRIER_SESSION_ID),
    launchSessionId,
    processOwnership,
    reason: launchBindingStatus.reason,
  });
  return {
    schema: 'narada.agent_start.command_result.v0',
    status: execution.status,
    mutation_performed: execution.status === 'success' && options.dryRun !== true,
    site_root: siteRoot,
    agent: options.agent,
    carrier: options.carrier,
    runtime: options.runtime,
    command: [process.execPath, ...args],
    result_handoff: 'json_output_file',
    result_file: resultPath,
    execution: {
      ...execution,
      stdout: parsed ? '' : truncateText(execution.stdout, 1000),
      stderr: truncateText(execution.stderr, 1000),
    },
    parsed_result: parsed,
    error: execution.status === 'success' ? undefined : execution.stderr || execution.error,
  };
}

export function getSchedulerSiteDaemonStatus(
  options: SchedulerDaemonPlanOptions,
  queryTask: (taskName: string) => unknown = queryWindowsScheduledTask,
): SchedulerDaemonStatusResult {
  const siteRoot = resolve(options.siteRoot);
  const taskName = options.taskName ?? defaultSiteDaemonTaskName(siteRoot);
  if (process.platform !== 'win32') {
    return {
      schema: 'narada.scheduler.site_daemon.status.v0',
      status: 'unsupported',
      mutation_performed: false,
      site_root: siteRoot,
      task_name: taskName,
      platform: process.platform,
      scheduler: 'windows_task_scheduler',
      error: 'Windows Task Scheduler status is only available on win32.',
    };
  }
  try {
    const task = queryTask(taskName);
    return {
      schema: 'narada.scheduler.site_daemon.status.v0',
      status: task ? 'ok' : 'not_found',
      mutation_performed: false,
      site_root: siteRoot,
      task_name: taskName,
      platform: process.platform,
      scheduler: 'windows_task_scheduler',
      task,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      schema: 'narada.scheduler.site_daemon.status.v0',
      status: isAccessDeniedMessage(message) ? 'access_denied' : 'error',
      mutation_performed: false,
      site_root: siteRoot,
      task_name: taskName,
      platform: process.platform,
      scheduler: 'windows_task_scheduler',
      error: message,
    };
  }
}

export function queryWindowsScheduledTask(taskName: string): unknown {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$taskName = $env:NARADA_SCHEDULER_TASK_NAME',
    'try {',
    '  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop',
    '  $task | Select-Object TaskName, TaskPath, State, URI | ConvertTo-Json -Compress',
    '  exit 0',
    '} catch {',
    '  if ($_.Exception.Message -match "No MSFT_ScheduledTask" -or $_.Exception.Message -match "not found") { exit 2 }',
    '  Write-Error $_',
    '  exit 1',
    '}',
  ].join('; ');
  const result = runGovernedCommandSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
    env: {
      ...process.env,
      NARADA_SCHEDULER_TASK_NAME: taskName,
    },
  });

  if (result.status === 2) return null;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || `scheduler_query_failed:${result.status}`).trim());
  }
  const stdout = String(result.stdout ?? '').trim();
  return stdout ? JSON.parse(stdout) : null;
}

export function planSchedulerSiteDaemonInstall(
  options: SchedulerDaemonPlanOptions,
): SchedulerDaemonInstallPlan {
  const siteRoot = resolve(options.siteRoot);
  const taskName = options.taskName ?? defaultSiteDaemonTaskName(siteRoot);
  const supervisor = join(siteRoot, 'scripts', 'supervisor.ps1');
  const hiddenRunner = join(siteRoot, 'scripts', 'Run-Hidden.vbs');
  const hidden = options.hidden ?? false;
  const checks = [
    pathCheck('site_root', siteRoot),
    pathCheck('supervisor', supervisor),
    ...(hidden ? [pathCheck('hidden_runner', hiddenRunner)] : []),
  ];
  const elevationPacket = {
    kind: 'windows_scheduled_task_install' as const,
    task_name: taskName,
    site_root: siteRoot,
    command: hidden ? 'wscript.exe' : 'pwsh.exe',
    arguments: hidden
      ? [
          '//B',
          hiddenRunner,
          'pwsh.exe',
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          supervisor,
          'start',
          '-SiteRoot',
          siteRoot,
        ]
      : [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          supervisor,
          'start',
          '-SiteRoot',
          siteRoot,
        ],
    hidden_runner: hidden ? hiddenRunner : undefined,
    supervisor,
  };

  const plan: SchedulerDaemonInstallPlan = {
    schema: 'narada.scheduler.site_daemon.install_plan.v0',
    status: process.platform === 'win32' ? 'requires_elevation' : 'unsupported',
    mutation_performed: false,
    site_root: siteRoot,
    task_name: taskName,
    platform: process.platform,
    hidden,
    dry_run: options.dryRun ?? true,
    elevation_required: true,
    elevation_available: false,
    elevation_packet: process.platform === 'win32' ? elevationPacket : undefined,
    checks,
  };
  if (!options.execute) return plan;
  if (process.platform !== 'win32') return plan;
  const elevation = windowsElevationState();
  if (!elevation.elevated) {
    return {
      ...plan,
      status: 'requires_elevation',
      execution: {
        status: 'failed',
        exit_code: 5,
        stdout: '',
        stderr: 'Windows Scheduled Task installation requires an elevated PowerShell session.',
      },
    };
  }
  const execution = runPowerShell([
    '$ErrorActionPreference = "Stop"',
    '$taskName = $env:NARADA_SCHEDULER_TASK_NAME',
    '$siteRoot = $env:NARADA_SITE_ROOT',
    '$hiddenRunner = $env:NARADA_HIDDEN_RUNNER',
    '$supervisor = $env:NARADA_SUPERVISOR',
    '$execute = if ($env:NARADA_SCHEDULER_HIDDEN -eq "1") { "wscript.exe" } else { "pwsh.exe" }',
    '$arguments = if ($env:NARADA_SCHEDULER_HIDDEN -eq "1") { "//B `"$hiddenRunner`" pwsh.exe -NoProfile -ExecutionPolicy Bypass -File `"$supervisor`" start -SiteRoot `"$siteRoot`"" } else { "-NoProfile -ExecutionPolicy Bypass -File `"$supervisor`" start -SiteRoot `"$siteRoot`"" }',
    '$action = New-ScheduledTaskAction -Execute $execute -Argument $arguments -WorkingDirectory $siteRoot',
    '$logonTrigger = New-ScheduledTaskTrigger -AtLogOn',
    '$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)',
    '$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0)',
    '$task = New-ScheduledTask -Action $action -Trigger @($logonTrigger, $watchdogTrigger) -Settings $settings -Description "Narada Site daemon supervised startup."',
    'Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null',
    '[pscustomobject]@{schema="narada.scheduler.site_daemon.install_execution.v0";status="success";task_name=$taskName;site_root=$siteRoot} | ConvertTo-Json -Compress',
  ], {
    NARADA_SCHEDULER_TASK_NAME: taskName,
    NARADA_SITE_ROOT: siteRoot,
    NARADA_HIDDEN_RUNNER: hiddenRunner,
    NARADA_SUPERVISOR: supervisor,
    NARADA_SCHEDULER_HIDDEN: hidden ? '1' : '0',
  });
  return {
    ...plan,
    status: execution.status === 'success' ? 'planned' : 'requires_elevation',
    mutation_performed: execution.status === 'success',
    execution,
  };
}

export function setSchedulerSiteDaemonEnabled(
  options: SchedulerDaemonPlanOptions & { enabled: boolean },
): SchedulerDaemonStatusResult & { execution?: CommandExecutionResult; elevation_required?: boolean } {
  const siteRoot = resolve(options.siteRoot);
  const taskName = options.taskName ?? defaultSiteDaemonTaskName(siteRoot);
  if (process.platform !== 'win32') {
    return {
      schema: 'narada.scheduler.site_daemon.status.v0',
      status: 'unsupported',
      mutation_performed: false,
      site_root: siteRoot,
      task_name: taskName,
      platform: process.platform,
      scheduler: 'windows_task_scheduler',
      error: 'Windows Task Scheduler mutation is only available on win32.',
    };
  }
  const elevation = windowsElevationState();
  if (!elevation.elevated) {
    return {
      schema: 'narada.scheduler.site_daemon.status.v0',
      status: 'error',
      mutation_performed: false,
      site_root: siteRoot,
      task_name: taskName,
      platform: process.platform,
      scheduler: 'windows_task_scheduler',
      elevation_required: true,
      error: 'Windows Scheduled Task mutation requires an elevated PowerShell session.',
    };
  }
  const execution = runPowerShell([
    '$ErrorActionPreference = "Stop"',
    '$taskName = $env:NARADA_SCHEDULER_TASK_NAME',
    'if ($env:NARADA_SCHEDULER_ENABLE -eq "1") { Enable-ScheduledTask -TaskName $taskName | Out-Null } else { Disable-ScheduledTask -TaskName $taskName | Out-Null }',
    '$task = Get-ScheduledTask -TaskName $taskName',
    '$task | Select-Object TaskName, TaskPath, State, URI | ConvertTo-Json -Compress',
  ], {
    NARADA_SCHEDULER_TASK_NAME: taskName,
    NARADA_SCHEDULER_ENABLE: options.enabled ? '1' : '0',
  });
  return {
    schema: 'narada.scheduler.site_daemon.status.v0',
    status: execution.status === 'success' ? 'ok' : 'error',
    mutation_performed: execution.status === 'success',
    site_root: siteRoot,
    task_name: taskName,
    platform: process.platform,
    scheduler: 'windows_task_scheduler',
    task: tryParseJson(execution.stdout),
    execution,
    error: execution.status === 'success' ? undefined : execution.stderr || execution.error,
  };
}

export function runSiteCliCommand(siteRootInput: string, args: string[]): SiteCommandResult {
  const siteRoot = resolve(siteRootInput);
  const cli = join(siteRoot, 'scripts', 'narada-sonar.ts');
  if (!existsSync(cli)) {
    return {
      schema: 'narada.site_command_result.v0',
      status: 'not_available',
      mutation_performed: false,
      site_root: siteRoot,
      command: args,
      error: `Site CLI not found: ${cli}`,
    };
  }
  const execution = runProcess(process.execPath, [cli, ...args, '--format', 'json'], siteRoot);
  const parsed = tryParseJson(execution.stdout);
  return {
    schema: 'narada.site_command_result.v0',
    status: execution.status,
    mutation_performed: execution.status === 'success' && isMutatingSiteCommand(args),
    site_root: siteRoot,
    command: args,
    execution: {
      ...execution,
      stdout: parsed ? '' : truncateText(execution.stdout, 1000),
      stderr: truncateText(execution.stderr, 1000),
    },
    parsed_stdout: parsed,
  };
}

function isMutatingSiteCommand(args: string[]): boolean {
  const [domain, action] = args;
  if (domain === 'loop') return ['pause', 'resume', 'run', 'drain'].includes(String(action));
  if (domain === 'resident') {
    return ['summon', 'recover-carrier', 'recover-stale', 'resolve', 'refuse', 'cleanup-runtime'].includes(String(action));
  }
  return false;
}

function defaultSiteDaemonTaskName(siteRoot: string): string {
  const leaf = basename(siteRoot).replace(/[^A-Za-z0-9_.-]+/g, '-');
  return leaf === 'narada.sonar' ? 'Narada-Sonar-Daemon' : `Narada-${leaf}-Daemon`;
}

function pathCheck(name: string, path: string): { name: string; ok: boolean; path: string; detail?: string } {
  try {
    accessSync(path);
    return { name, ok: true, path };
  } catch {
    return { name, ok: false, path, detail: 'missing_or_unreadable' };
  }
}

function naradaProperRoot(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const packageLayoutRoot = resolve(moduleDir, '..', '..', '..', '..', '..');
  return explicitNaradaProperRoot(packageLayoutRoot)
    ?? findNaradaProperRoot(moduleDir)
    ?? findNaradaProperRoot(process.cwd())
    ?? resolve(process.cwd());
}

function resolveAgentStartEntrypoint(workspaceRoot: string): string {
  const naradaRoot = explicitNaradaProperRoot(process.env.NARADA_PROPER_ROOT ?? '')
    ?? explicitNaradaProperRoot(workspaceRoot)
    ?? findNaradaProperRoot(workspaceRoot)
    ?? naradaProperRoot();
  const workspaceEntrypoint = join(naradaRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');
  if (existsSync(workspaceEntrypoint)) return workspaceEntrypoint;
  try {
    return requireFromLauncherRuntime.resolve('@narada2/agent-start/narada-agent-start');
  } catch {
    return workspaceEntrypoint;
  }
}

function explicitNaradaProperRoot(candidate: string): string | null {
  const resolved = resolve(candidate);
  return existsSync(join(resolved, 'packages', 'agent-start', 'src', 'narada-agent-start.ts'))
    ? resolved
    : null;
}

function findNaradaProperRoot(start: string): string | null {
  let current = resolve(start);
  const root = parse(current).root;
  while (current && current !== root) {
    if (explicitNaradaProperRoot(current)) {
      return current;
    }
    current = dirname(current);
  }
  return null;
}

