import type { Command } from 'commander';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { roleLoopNextCommand } from './role-loop.js';

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
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'role-loop next',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => roleLoopNextCommand({
        agent: opts.agent as string | undefined,
        role: opts.role as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
