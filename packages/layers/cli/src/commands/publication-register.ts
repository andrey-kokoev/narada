import type { Command } from 'commander';
import {
  publicationConfirmCommand,
  publicationListCommand,
  publicationPrepareCommand,
} from './publication.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

function collectValues(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

export function registerPublicationCommands(program: Command): void {
  const publicationCmd = program
    .command('publication')
    .description('Repository Publication Intent Zone operators');

  publicationCmd
    .command('prepare')
    .description('Prepare a durable repo publication handoff bundle')
    .requiredOption('--message <text>', 'Commit message for the publication handoff')
    .requiredOption('--by <principal>', 'Principal requesting the publication')
    .option('--task <number>', 'Task number linkage')
    .option('--include <path>', 'Path to include in the handoff (repeatable)', collectValues, [])
    .option('--remote <name>', 'Remote name', 'origin')
    .option('--base-ref <ref>', 'Base ref for bundle range')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'publication prepare',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => publicationPrepareCommand({
        message: opts.message as string | undefined,
        by: opts.by as string | undefined,
        taskNumber: opts.task ? Number(opts.task) : undefined,
        include: opts.include as string[] | undefined,
        remote: opts.remote as string | undefined,
        baseRef: opts.baseRef as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  publicationCmd
    .command('confirm <publication-id>')
    .description('Confirm or fail a prepared repo publication')
    .requiredOption('--status <status>', 'Publication result: pushed, failed, or abandoned')
    .requiredOption('--by <principal>', 'Principal recording confirmation')
    .option('--remote-ref <ref>', 'Remote ref or push target')
    .option('--failure-reason <text>', 'Failure reason when status=failed')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'publication confirm',
      emit: emitCommandResult,
      format: (_id: string, opts: Record<string, unknown>) => opts.format,
      invocation: (publicationId, opts) => publicationConfirmCommand({
        publicationId,
        status: opts.status as never,
        by: opts.by as string | undefined,
        remoteRef: opts.remoteRef as string | undefined,
        failureReason: opts.failureReason as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  publicationCmd
    .command('list')
    .description('List repo publication handoffs')
    .option('--status <status>', 'Filter by status')
    .option('--limit <n>', 'Maximum rows', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'publication list',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => publicationListCommand({
        status: opts.status as never,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
