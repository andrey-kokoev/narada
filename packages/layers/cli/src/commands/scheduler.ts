import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  getSchedulerSiteDaemonStatus,
  planSchedulerSiteDaemonInstall,
  setSchedulerSiteDaemonEnabled,
} from '../lib/launcher-runtime-scheduler.js';

export interface SchedulerSiteDaemonOptions {
  siteRoot?: string;
  site?: string;
  taskName?: string;
  hidden?: boolean;
  dryRun?: boolean;
  execute?: boolean;
  format?: CliFormat;
}

export async function schedulerSiteDaemonStatusCommand(
  options: SchedulerSiteDaemonOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = getSchedulerSiteDaemonStatus({
    siteRoot: requireSiteRoot(options),
    taskName: options.taskName,
  });
  return {
    exitCode: ['error', 'access_denied'].includes(status.status) ? ExitCode.INVALID_CONFIG : ExitCode.SUCCESS,
    result: formattedResult(status, formatSchedulerStatus(status), options.format ?? 'auto'),
  };
}

export async function schedulerSiteDaemonInstallCommand(
  options: SchedulerSiteDaemonOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const plan = planSchedulerSiteDaemonInstall({
    siteRoot: requireSiteRoot(options),
    taskName: options.taskName,
    hidden: options.hidden,
    dryRun: options.execute ? false : options.dryRun ?? true,
    execute: options.execute,
  });
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(plan, formatInstallPlan(plan), options.format ?? 'auto'),
  };
}

export async function schedulerSiteDaemonEnableCommand(
  options: SchedulerSiteDaemonOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return schedulerSiteDaemonEnabledCommand(true, options);
}

export async function schedulerSiteDaemonDisableCommand(
  options: SchedulerSiteDaemonOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return schedulerSiteDaemonEnabledCommand(false, options);
}

function schedulerSiteDaemonEnabledCommand(
  enabled: boolean,
  options: SchedulerSiteDaemonOptions,
): { exitCode: ExitCode; result: unknown } {
  const result = setSchedulerSiteDaemonEnabled({
    siteRoot: requireSiteRoot(options),
    taskName: options.taskName,
    enabled,
  });
  return {
    exitCode: result.status === 'ok' ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
    result: formattedResult(
      result,
      `scheduler site-daemon ${enabled ? 'enable' : 'disable'} ${result.status}`,
      options.format ?? 'auto',
    ),
  };
}

function requireSiteRoot(options: SchedulerSiteDaemonOptions): string {
  const siteRoot = options.siteRoot ?? options.site;
  if (!siteRoot) {
    throw new Error('site_root_required: pass --site-root <path> or --site <path>');
  }
  return siteRoot;
}

function formatSchedulerStatus(status: ReturnType<typeof getSchedulerSiteDaemonStatus>): string {
  if (status.status === 'ok') {
    return `${status.task_name}: ok`;
  }
  return `${status.task_name}: ${status.status}${status.error ? ` (${status.error})` : ''}`;
}

function formatInstallPlan(plan: ReturnType<typeof planSchedulerSiteDaemonInstall>): string {
  return [
    `${plan.task_name}: ${plan.status}`,
    `site: ${plan.site_root}`,
    `hidden: ${String(plan.hidden)}`,
    `elevation_required: ${String(plan.elevation_required)}`,
  ].join('\n');
}
