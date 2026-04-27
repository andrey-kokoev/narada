import type { Command } from 'commander';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { workNextCommand } from './work-next.js';

export function registerWorkNextCommands(program: Command): void {
  program
    .command('work-next')
    .description('Unified next action for an agent: task work, inbox work, or idle')
    .requiredOption('--agent <id>', 'Agent ID')
    .option('--start-task', 'When task work is selected, create dispatch packet and start execution context', false)
    .option('--exec-task', 'With --start-task, mark dispatch start as executed', false)
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'work-next',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => workNextCommand({
        agent: opts.agent as string | undefined,
        cwd: opts.cwd as string | undefined,
        startTask: opts.startTask as boolean | undefined,
        execTask: opts.execTask as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
