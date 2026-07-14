import type { Command } from 'commander';
import {
  carrierActionsListCommand,
  carrierActionsShowCommand,
} from './carrier-actions.js';
import {directCommandAction, silentCommandContext, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerCarrierActionsCommands(program: Command): void {
  const carrierActionsCmd = program
    .command('carrier-actions')
    .description('Read-only runtime action admission evidence inspection');

  carrierActionsCmd
    .command('list')
    .description('List runtime action admission decisions')
    .option('--decision <decision>', 'Filter by decision')
    .option('--limit <n>', 'Maximum decisions', '50')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'carrier-actions list',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => carrierActionsListCommand({
        decision: opts.decision as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  carrierActionsCmd
    .command('show <request-id>')
    .description('Show one runtime action admission decision')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'carrier-actions show',
      emit: emitCommandResult,
      format: (_requestId: string, opts: CommanderOptionValues) => opts.format,
      invocation: (requestId, opts) => carrierActionsShowCommand({
        requestId,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
