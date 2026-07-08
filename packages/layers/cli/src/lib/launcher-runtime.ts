import { accessSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { agentIdentityRefMatchesRequest } from '@narada2/agent-identity';
import { runGovernedCommandSync, spawnHiddenPostureProcess, startOperatorTerminal } from '@narada2/process-launch-posture';
import { buildLaunchProcessOwnership, launchSessionIdFromToken, type LaunchProcessOwnership } from '@narada2/launch-process-ownership';

const requireFromLauncherRuntime = createRequire(import.meta.url);

export interface LaunchResultSummary {
  path: string;
  mtime_ms: number;
  schema?: string;
  status?: string;
  agent_start_event?: string;
  identity?: string;
  agent_identity_ref?: unknown;
  operator_surface_kind?: string;
  runtime_host_kind?: string;
  carrier_kind?: string;
  runtime?: string;
  runtime_substrate_kind?: string;
  site_root?: string;
  target_site_root?: string;
  session_site_root?: string;
  runtime_session_id?: string;
  nars_session_id?: string;
  carrier_session_id?: string;
  control_path?: string;
  control_path_exists?: boolean;
  session_path?: string;
  session_path_exists?: boolean;
  launch_source?: string;
  parent_pid?: number;
  parent_process_alive?: boolean | null;
  started_at?: string;
  expires_at?: string;
}

export function writeOperatorProjectionLaunchBinding(path: string | undefined, args: {
  status: OperatorProjectionLaunchBinding['status'];
  siteRoot: string;
  workspaceRoot: string;
  agent: string;
  operatorSurfaceKind?: string;
  runtimeHostKind: string;
  authority?: string | null;
  intelligenceProvider?: string | null;
  agentStartResultFile?: string;
  narsSessionId?: string | null;
  runtimeSessionId?: string | null;
  carrierSessionId?: string | null;
  launchSessionId?: string | null;
  processOwnership?: LaunchProcessOwnership | null;
  reason?: string | null;
}): void {
  if (!path) return;
  const now = new Date().toISOString();
  let createdAt = now;
  try {
    const previous = tryReadJsonFile(path) as { created_at?: unknown } | null;
    if (typeof previous?.created_at === 'string') createdAt = previous.created_at;
  } catch {
    // Keep binding writes best-effort; launch itself remains authoritative.
  }
  const binding: OperatorProjectionLaunchBinding = {
    schema: 'narada.operator_projection_launch_binding.v1',
    status: args.status,
    created_at: createdAt,
    updated_at: now,
    site_root: args.siteRoot,
    workspace_root: args.workspaceRoot,
    agent: args.agent,
    operator_surface_kind: args.operatorSurfaceKind,
    runtime_host_kind: args.runtimeHostKind,
    authority: args.authority ?? null,
    intelligence_provider: args.intelligenceProvider ?? null,
    agent_start_result_file: args.agentStartResultFile,
    nars_session_id: args.narsSessionId ?? null,
    runtime_session_id: args.runtimeSessionId ?? null,
    carrier_session_id: args.carrierSessionId ?? null,
    launch_session_id: args.launchSessionId ?? null,
    process_ownership: args.processOwnership ?? null,
    reason: args.reason ?? null,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
}

function tryReadJsonFile(path: string): unknown {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function tsxImportPath(): string {
  return pathToFileURL(requireFromLauncherRuntime.resolve('tsx')).href;
}

export interface CarrierStatusOptions {
  siteRoot: string;
  agent?: string;
  carrier?: string;
  runtime?: string;
  now?: Date;
}

export interface AgentStartOptions {
  siteRoot: string;
  targetSiteId?: string;
  workspaceRoot?: string;
  agent: string;
  carrier?: string;
  runtime: string;
  authority?: string;
  intelligenceProvider?: string;
  mcpScope?: string;
  dryRun?: boolean;
  exec?: boolean;
  wait?: boolean;
  enableNativeShell?: boolean;
  launchSource?: string;
  launchBindingPath?: string;
  launchSessionId?: string;
}

export interface OperatorProjectionLaunchBinding {
  schema: 'narada.operator_projection_launch_binding.v1';
  status: 'waiting_for_agent_start' | 'ready' | 'failed';
  created_at: string;
  updated_at: string;
  site_root: string;
  workspace_root: string;
  agent: string;
  operator_surface_kind?: string;
  runtime_host_kind: string;
  authority?: string | null;
  intelligence_provider?: string | null;
  agent_start_result_file?: string;
  nars_session_id?: string | null;
  runtime_session_id?: string | null;
  carrier_session_id?: string | null;
  launch_session_id?: string | null;
  process_ownership?: LaunchProcessOwnership | null;
  reason?: string | null;
}

export interface AgentStartCommandResult {
  schema: 'narada.agent_start.command_result.v0';
  status: 'success' | 'failed' | 'not_available';
  mutation_performed: boolean;
  site_root: string;
  agent: string;
  carrier?: string;
  runtime: string;
  command: string[];
  execution?: CommandExecutionResult;
  result_handoff?: 'json_output_file';
  result_file?: string;
  parsed_result?: unknown;
  error?: string;
}

export interface CarrierStatusResult {
  schema: 'narada.carrier.status.v0';
  status: 'ok' | 'not_found';
  mutation_performed: false;
  site_root: string;
  agent?: string;
  carrier?: string;
  runtime?: string;
  latest?: LaunchResultSummary;
  launch_results_dir: string;
  launch_results_seen: number;
  candidates_scanned: number;
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

export interface CommandExecutionResult {
  status: 'success' | 'failed';
  exit_code: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface SiteCommandResult {
  schema: 'narada.site_command_result.v0';
  status: 'success' | 'failed' | 'not_available';
  mutation_performed: boolean;
  site_root: string;
  command: string[];
  execution?: CommandExecutionResult;
  parsed_stdout?: unknown;
  error?: string;
}

interface LaunchResultRecord {
  schema?: unknown;
  status?: unknown;
  agent_start_event?: unknown;
  identity?: unknown;
  agent_identity_ref?: unknown;
  operator_surface_kind?: unknown;
  runtime_host_kind?: unknown;
  carrier_kind?: unknown;
  runtime?: unknown;
  runtime_substrate_kind?: unknown;
  target_site_root?: unknown;
  session_site_root?: unknown;
  launch_source?: unknown;
  expires_at?: unknown;
  nars_launch?: {
    session_id?: unknown;
    runtime_session_id?: unknown;
    nars_session_id?: unknown;
    operator_surface_kind?: unknown;
    runtime_host_kind?: unknown;
    control_path?: unknown;
    session_path?: unknown;
  };
  required_environment?: {
    NARADA_AGENT_ID?: unknown;
    NARADA_RUNTIME_SESSION_ID?: unknown;
    NARADA_NARS_SESSION_ID?: unknown;
    NARADA_CARRIER_SESSION_ID?: unknown;
    NARADA_SITE_ROOT?: unknown;
  };
  carrier_actions?: {
    carrier_session_registration?: {
      carrier_session_id?: unknown;
      record?: {
        started_at?: unknown;
        parent_process?: {
          pid?: unknown;
        };
      };
    };
  };
  carrier_session?: {
    carrier_session_id?: unknown;
    record?: {
      started_at?: unknown;
      parent_process?: {
        pid?: unknown;
      };
    };
  };
  runtime_args?: unknown;
  started_at?: unknown;
  created_at?: unknown;
}

export function classifyAgentStartLaunchBindingStatus(
  executionStatus: CommandExecutionResult['status'],
  parsedRecord: LaunchResultRecord | null,
): Pick<OperatorProjectionLaunchBinding, 'status' | 'reason'> {
  const parsedStatus = stringValue(parsedRecord?.status)?.toLowerCase();
  const hasNarsSession = Boolean(
    stringValue(parsedRecord?.nars_launch?.nars_session_id ?? parsedRecord?.nars_launch?.session_id ?? parsedRecord?.required_environment?.NARADA_NARS_SESSION_ID),
  );
  if (hasNarsSession && (parsedStatus === 'materialized' || parsedStatus === 'success')) {
    return { status: 'ready', reason: null };
  }
  if (executionStatus === 'success') return { status: 'ready', reason: null };
  return { status: 'failed', reason: 'agent_start_failed' };
}

export function shouldDetachAgentStartProcess(options: Pick<AgentStartOptions, 'exec' | 'wait' | 'carrier' | 'runtime'>): boolean {
  if (options.exec !== true || options.wait === true) return false;
  if (options.runtime !== 'narada-agent-runtime-server') return false;
  return options.carrier === 'agent-cli' || options.carrier === 'agent-web-ui';
}

export function getCarrierStatus(options: CarrierStatusOptions): CarrierStatusResult {
  const siteRoot = resolve(options.siteRoot);
  const launchResultsDir = join(siteRoot, '.ai', 'runtime', 'agent-start-results');
  const allSummaries = readLaunchResults(launchResultsDir);
  const summaries = allSummaries
    .filter((summary) => !options.agent || summary.identity === options.agent || agentIdentityRefMatchesRequest(summary.agent_identity_ref, options.agent))
    .filter((summary) => !options.carrier || summary.carrier_kind === options.carrier)
    .filter((summary) => {
      if (!options.runtime) return true;
      return summary.runtime === options.runtime || summary.runtime_substrate_kind === options.runtime;
    })
    .sort((a, b) => b.mtime_ms - a.mtime_ms);
  const latest = summaries[0];

  return {
    schema: 'narada.carrier.status.v0',
    status: latest ? 'ok' : 'not_found',
    mutation_performed: false,
    site_root: siteRoot,
    agent: options.agent,
    carrier: options.carrier,
    runtime: options.runtime,
    latest,
    launch_results_dir: launchResultsDir,
    launch_results_seen: allSummaries.length,
    candidates_scanned: summaries.length,
  };
}

export function getCarrierControlPath(options: CarrierStatusOptions): CarrierStatusResult {
  return getCarrierStatus(options);
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
  mkdirSync(resultDir, { recursive: true });
  const resultPath = join(resultDir, 'result.json');
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
  const parsed = tryReadJsonFile(resultPath);
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

function readLaunchResults(launchResultsDir: string): LaunchResultSummary[] {
  if (!existsSync(launchResultsDir)) return [];
  return readdirSync(launchResultsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.result.json'))
    .map((entry) => readLaunchResult(join(launchResultsDir, entry.name)))
    .filter((summary): summary is LaunchResultSummary => Boolean(summary));
}

function readLaunchResult(path: string): LaunchResultSummary | null {
  try {
    const stats = statSync(path);
    const record = JSON.parse(readFileSync(path, 'utf8')) as LaunchResultRecord;
    const carrierSessionRegistration = record.carrier_actions?.carrier_session_registration;
    const runtimeSessionId = stringValue(
      record.nars_launch?.runtime_session_id
        ?? record.nars_launch?.session_id
        ?? record.required_environment?.NARADA_RUNTIME_SESSION_ID,
    );
    const narsSessionId = stringValue(
      record.nars_launch?.nars_session_id
        ?? record.nars_launch?.session_id
        ?? record.required_environment?.NARADA_NARS_SESSION_ID,
    );
    const carrierSessionId = stringValue(
      record.carrier_session?.carrier_session_id
        ?? carrierSessionRegistration?.carrier_session_id
        ?? record.required_environment?.NARADA_CARRIER_SESSION_ID,
    );
    const controlPath = stringValue(
      record.nars_launch?.control_path
        ?? controlPathFromRuntimeArgs(record.runtime_args)
        ?? (carrierSessionId
          ? join(
              siteRootFromLaunchResultPath(path),
              '.narada',
              'crew',
              'nars-sessions',
              carrierSessionId,
              'control.jsonl',
            )
          : undefined),
    );
    const sessionPath = stringValue(
      record.nars_launch?.session_path,
    );
    const parentPid = numberValue(
      record.carrier_session?.record?.parent_process?.pid
        ?? carrierSessionRegistration?.record?.parent_process?.pid,
    );
    return {
      path,
      mtime_ms: stats.mtimeMs,
      schema: stringValue(record.schema),
      status: stringValue(record.status),
      agent_start_event: stringValue(record.agent_start_event),
      identity: stringValue(record.identity ?? record.required_environment?.NARADA_AGENT_ID),
      agent_identity_ref: objectValue(record.agent_identity_ref),
      operator_surface_kind: stringValue(record.operator_surface_kind ?? record.nars_launch?.operator_surface_kind ?? record.carrier_kind),
      runtime_host_kind: stringValue(record.runtime_host_kind ?? record.nars_launch?.runtime_host_kind ?? record.runtime_substrate_kind ?? record.runtime),
      carrier_kind: stringValue(record.carrier_kind),
      runtime: stringValue(record.runtime),
      runtime_substrate_kind: stringValue(record.runtime_substrate_kind),
      site_root: stringValue(record.required_environment?.NARADA_SITE_ROOT),
      target_site_root: stringValue(record.target_site_root),
      session_site_root: stringValue(record.session_site_root),
      runtime_session_id: runtimeSessionId,
      nars_session_id: narsSessionId,
      carrier_session_id: carrierSessionId,
      control_path: controlPath,
      control_path_exists: controlPath ? existsSync(controlPath) : false,
      session_path: sessionPath,
      session_path_exists: sessionPath ? existsSync(sessionPath) : false,
      launch_source: stringValue(record.launch_source),
      parent_pid: parentPid,
      parent_process_alive: parentPid ? isProcessAlive(parentPid) : null,
      started_at: stringValue(
        record.started_at
          ?? record.carrier_session?.record?.started_at
          ?? carrierSessionRegistration?.record?.started_at
          ?? record.created_at,
      ),
      expires_at: stringValue(record.expires_at),
    };
  } catch {
    return null;
  }
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

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === 'EPERM';
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function controlPathFromRuntimeArgs(args: unknown): string | undefined {
  if (!Array.isArray(args)) return undefined;
  const index = args.findIndex((arg) => String(arg) === '--control-jsonl');
  return index >= 0 ? stringValue(args[index + 1]) : undefined;
}

function siteRootFromLaunchResultPath(path: string): string {
  return dirname(dirname(dirname(dirname(path))));
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

function windowsElevationState(): { elevated: boolean; execution: CommandExecutionResult } {
  const execution = runPowerShell([
    '$identity = [Security.Principal.WindowsIdentity]::GetCurrent()',
    '$principal = [Security.Principal.WindowsPrincipal]::new($identity)',
    '$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    'if ($isAdmin) { "true" } else { "false" }',
  ]);
  return {
    elevated: execution.status === 'success' && execution.stdout.trim() === 'true',
    execution,
  };
}

function isAccessDeniedMessage(message: string): boolean {
  return /\b(access denied|unauthorized|permission denied|requires elevation)\b/i.test(message);
}

function runPowerShell(commands: string[], env: Record<string, string> = {}): CommandExecutionResult {
  return runProcess('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    commands.join('; '),
  ], process.cwd(), env);
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): CommandExecutionResult {
  const result = runGovernedCommandSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
    env: {
      ...process.env,
      NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'),
      OUTPUT_FORMAT: 'json',
      ...env,
    },
  });
  const exitCode = result.status ?? (result.error ? 1 : 0);
  return {
    status: exitCode === 0 ? 'success' : 'failed',
    exit_code: exitCode,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
    error: result.error ? result.error.message : undefined,
  };
}

function runProcessDetachedUntilJson(
  command: string,
  args: string[],
  cwd: string,
  resultPath: string,
  env: Record<string, string> = {},
  timeoutMs = 30_000,
): CommandExecutionResult {
  const logDir = dirname(resultPath);
  mkdirSync(logDir, { recursive: true });
  const stdoutPath = join(logDir, 'detached-stdout.log');
  const stderrPath = join(logDir, 'detached-stderr.log');
  let stdoutFd: number | null = null;
  let stderrFd: number | null = null;
  try {
    stdoutFd = openSync(stdoutPath, 'a');
    stderrFd = openSync(stderrPath, 'a');
    const child = spawnHiddenPostureProcess(command, args, {
      posture: 'provider_subprocess',
      cwd,
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
      env: {
        ...process.env,
        NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'),
        OUTPUT_FORMAT: 'json',
        ...env,
      },
    });
    child.unref();
  } catch (error) {
    if (stdoutFd !== null) closeSync(stdoutFd);
    if (stderrFd !== null) closeSync(stderrFd);
    return {
      status: 'failed',
      exit_code: 1,
      stdout: '',
      stderr: '',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (stdoutFd !== null) closeSync(stdoutFd);
    if (stderrFd !== null) closeSync(stderrFd);
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const parsed = tryReadJsonFile(resultPath);
    if (parsed && typeof parsed === 'object') {
      return {
        status: 'success',
        exit_code: 0,
        stdout: `detached_stdout=${stdoutPath}`,
        stderr: `detached_stderr=${stderrPath}`,
      };
    }
    sleepSync(100);
  }
  const stderrTail = readTextTail(stderrPath, 2000);
  return {
    status: 'failed',
    exit_code: 1,
    stdout: `detached_stdout=${stdoutPath}`,
    stderr: `timed out waiting for agent-start JSON handoff: ${resultPath}\ndetached_stderr=${stderrPath}\n${stderrTail}`.trim(),
    error: 'agent_start_handoff_timeout',
  };
}

function runProcessInherited(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): CommandExecutionResult {
  const launch = startOperatorTerminal(command, args, {
    cwd,
    stdio: 'inherit',
    timeout: 0,
    env: {
      ...process.env,
      NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'),
      OUTPUT_FORMAT: 'json',
      ...env,
    },
  });
  const result = launch.result;
  const exitCode = result.status ?? (result.error ? 1 : 0);
  return {
    status: exitCode === 0 ? 'success' : 'failed',
    exit_code: exitCode,
    stdout: '',
    stderr: '',
    error: result.error ? result.error.message : undefined,
  };
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readTextTail(path: string, maxChars: number): string {
  try {
    if (!existsSync(path)) return '';
    const text = readFileSync(path, 'utf8');
    return text.length > maxChars ? text.slice(text.length - maxChars) : text;
  } catch {
    return '';
  }
}

function tryParseJson(value: string): unknown {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function appendNodeOption(existing: string | undefined, option: string): string {
  const current = String(existing ?? '').trim();
  return current.includes(option) ? current : [current, option].filter(Boolean).join(' ');
}

function truncateText(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}... [truncated ${value.length - max} chars]`;
}
