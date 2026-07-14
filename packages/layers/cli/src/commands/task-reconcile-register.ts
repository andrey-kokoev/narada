import type { Command } from 'commander';
import {
  taskReconcileClaimCommand,
  taskReconcileGuideCommand,
  taskReconcileInspectCommand,
  taskReconcileRecordCommand,
  taskReconcileRepairCommand,
} from './task-reconcile.js';
import {directCommandAction, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerTaskReconcileCommands(taskCmd: Command): void {
  const reconcileCmd = taskCmd
    .command('reconcile')
    .description('Task reconciliation operators (inspect, record, repair)');

  reconcileCmd
    .command('claim')
    .description('Reconcile an informal completion claim against lifecycle, evidence, verification, and git state')
    .option('--task <number>', 'Task number to reconcile')
    .option('--agent <id>', 'Agent whose current task should be reconciled')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'task reconcile claim',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => taskReconcileClaimCommand({
        taskNumber: opts.task as string | undefined,
        agent: opts.agent as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  reconcileCmd
    .command('guide')
    .description('Diagnose task lifecycle drift and print exact sanctioned next commands')
    .option('--task <number>', 'Task number to guide')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--range <start-end>', 'Restrict guide to task number range')
    .option('--by <id>', 'Operator or agent who would record and repair findings', 'operator')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'task reconcile guide',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => taskReconcileGuideCommand({
        taskNumber: opts.task as string | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        range: opts.range as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  reconcileCmd
    .command('inspect')
    .description('Detect task authority drift without recording or repairing it')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--range <start-end>', 'Restrict inspection to task number range')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'task reconcile inspect',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
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
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'task reconcile record',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
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
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'task reconcile repair',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => taskReconcileRepairCommand({
        finding: opts.finding as string | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
