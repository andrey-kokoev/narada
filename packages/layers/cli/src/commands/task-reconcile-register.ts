import type { Command } from 'commander';
import {
  taskReconcileInspectCommand,
  taskReconcileRecordCommand,
  taskReconcileRepairCommand,
} from './task-reconcile.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerTaskReconcileCommands(taskCmd: Command): void {
  const reconcileCmd = taskCmd
    .command('reconcile')
    .description('Task reconciliation operators (inspect, record, repair)');

  reconcileCmd
    .command('inspect')
    .description('Detect task authority drift without recording or repairing it')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--range <start-end>', 'Restrict inspection to task number range')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task reconcile inspect',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskReconcileInspectCommand({
        cwd: opts.cwd as string | undefined,
        range: opts.range as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  reconcileCmd
    .command('record')
    .description('Record reconciliation findings for later sanctioned repair')
    .option('--by <id>', 'Operator or agent recording findings', 'operator')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--range <start-end>', 'Restrict recording to task number range')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task reconcile record',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskReconcileRecordCommand({
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        range: opts.range as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  reconcileCmd
    .command('repair')
    .description('Apply a sanctioned reconciliation repair')
    .requiredOption('--finding <id>', 'Finding ID to repair')
    .requiredOption('--by <id>', 'Operator or agent performing repair')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task reconcile repair',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskReconcileRepairCommand({
        finding: opts.finding as string | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
