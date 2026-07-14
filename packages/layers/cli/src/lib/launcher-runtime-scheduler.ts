import { accessSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import type { CommandExecutionResult } from './launcher-contracts.js';
import {
  runPowerShell,
  isAccessDeniedMessage,
  windowsElevationState,
} from './launcher-runtime-process.js';
import { tryParseJson } from './launcher-runtime-results.js';

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

