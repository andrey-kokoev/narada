import type { Command } from 'commander';
import {directCommandAction, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { roleLoopNextCommand, roleLoopNextObligationCommand } from './role-loop.js';

export function registerRoleLoopCommands(program: Command): void {
  const roleLoopCmd = program
    .command('role-loop')
    .description('Compact role duty-loop surfaces for Operator nudges such as next');

  roleLoopCmd
    .command('next')
    .description('Return bounded next-duty state for an agent or role without claiming work')
    .option('--agent <id>', 'Agent identity to inspect')
    .option('--role <role>', 'Role shorthand when agent id equals role')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--include-workboard', 'Include compact workboard exploration payload explicitly', false)
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'role-loop next',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => roleLoopNextCommand({
        agent: opts.agent as string | undefined,
        role: opts.role as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        includeWorkboard: opts.includeWorkboard as boolean | undefined,
      }),
    }));

  roleLoopCmd
    .command('next-obligation')
    .description('Return one bounded next obligation/review/routing action for an agent or role')
    .option('--agent <id>', 'Agent identity to inspect')
    .option('--role <role>', 'Role shorthand when agent id equals role')
    .option('--recurrence-key <key>', 'Mark this packet as recurrence of a known CAPA/ergonomics incident')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'role-loop next-obligation',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => roleLoopNextObligationCommand({
        agent: opts.agent as string | undefined,
        role: opts.role as string | undefined,
        recurrenceKey: opts.recurrenceKey as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
