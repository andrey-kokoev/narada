import type { Command } from 'commander';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { qualificationEffectivenessCheckCommand, qualificationStatusCommand } from './qualification.js';

export function registerQualificationCommands(program: Command): void {
  const qualification = program
    .command('qualification')
    .description('Site role/principal qualification inspection');

  qualification
    .command('status')
    .description('Inspect qualification state for a governed work class')
    .requiredOption('--agent <id>', 'Agent or principal ID')
    .option('--role <role>', 'Role ID')
    .option('--work-class <class>', 'Governed work class', 'task_construction')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'qualification status',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => qualificationStatusCommand({
        agent: opts.agent as string | undefined,
        role: opts.role as string | undefined,
        workClass: opts.workClass as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  qualification
    .command('effectiveness-check')
    .description('Inspect whether qualification effectiveness evidence is required')
    .requiredOption('--agent <id>', 'Agent or principal ID')
    .option('--role <role>', 'Role ID')
    .option('--work-class <class>', 'Governed work class', 'task_construction')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'qualification effectiveness-check',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => qualificationEffectivenessCheckCommand({
        agent: opts.agent as string | undefined,
        role: opts.role as string | undefined,
        workClass: opts.workClass as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
