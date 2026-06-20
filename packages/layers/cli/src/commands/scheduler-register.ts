import type { Command } from 'commander';
import { directCommandAction, silentCommandContext } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import {
  schedulerSiteDaemonDisableCommand,
  schedulerSiteDaemonEnableCommand,
  schedulerSiteDaemonInstallCommand,
  schedulerSiteDaemonStatusCommand,
} from './scheduler.js';

export function registerSchedulerCommands(program: Command): void {
  const scheduler = program
    .command('scheduler')
    .description('Platform scheduler inspection and Site daemon planning');

  const siteDaemon = scheduler
    .command('site-daemon')
    .description('Site daemon scheduled-task status and installation planning');

  siteDaemon
    .command('status')
    .description('Inspect platform scheduler state for a Site daemon')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--task-name <name>', 'Platform scheduler task name')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'scheduler site-daemon status',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => schedulerSiteDaemonStatusCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        taskName: opts.taskName as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  siteDaemon
    .command('install')
    .description('Plan Site daemon scheduler installation and emit an elevation packet')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--task-name <name>', 'Platform scheduler task name')
    .option('--hidden', 'Plan hidden-window startup wrapper', false)
    .option('--dry-run', 'Return a plan without mutating platform scheduler state', true)
    .option('--execute', 'Execute scheduler installation when elevation is available', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'scheduler site-daemon install',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => schedulerSiteDaemonInstallCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        taskName: opts.taskName as string | undefined,
        hidden: opts.hidden as boolean | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        execute: opts.execute as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  siteDaemon
    .command('enable')
    .description('Reserved scheduler enable mutation; reports elevation contract')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--task-name <name>', 'Platform scheduler task name')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'scheduler site-daemon enable',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => schedulerSiteDaemonEnableCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        taskName: opts.taskName as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  siteDaemon
    .command('disable')
    .description('Reserved scheduler disable mutation; reports elevation contract')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--task-name <name>', 'Platform scheduler task name')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'scheduler site-daemon disable',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => schedulerSiteDaemonDisableCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        taskName: opts.taskName as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
