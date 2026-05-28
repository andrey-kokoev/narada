import type { Command } from 'commander';
import {
  carrierActionsListCommand,
  carrierActionsShowCommand,
} from './carrier-actions.js';
import { directCommandAction, silentCommandContext } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerCarrierActionsCommands(program: Command): void {
  const carrierActionsCmd = program
    .command('carrier-actions')
    .description('Read-only Carrier Action Admission evidence inspection');

  carrierActionsCmd
    .command('list')
    .description('List Carrier Action Admission decisions')
    .option('--decision <decision>', 'Filter by decision')
    .option('--limit <n>', 'Maximum decisions', '50')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'carrier-actions list',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => carrierActionsListCommand({
        decision: opts.decision as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  carrierActionsCmd
    .command('show <request-id>')
    .description('Show one Carrier Action Admission decision')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'carrier-actions show',
      emit: emitCommandResult,
      format: (_requestId: string, opts: Record<string, unknown>) => opts.format,
      invocation: (requestId, opts) => carrierActionsShowCommand({
        requestId,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
