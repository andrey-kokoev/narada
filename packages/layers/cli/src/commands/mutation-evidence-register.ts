import type { Command } from 'commander';
import { mutationEvidenceReconcileCommand } from './mutation-evidence.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerMutationEvidenceCommands(program: Command): void {
  const cmd = program
    .command('mutation-evidence')
    .description('Validate and replay Git-visible mutation evidence');

  cmd
    .command('reconcile')
    .description('Validate mutation evidence and reconcile local SQLite projections')
    .option('--apply', 'Apply supported replay operations', false)
    .option('--family <family>', 'Evidence family: task_lifecycle|inbox')
    .option('--evidence-dir <path>', 'Evidence directory', '.ai/mutation-evidence')
    .option('--limit <n>', 'Maximum findings to emit', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'mutation-evidence reconcile',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => mutationEvidenceReconcileCommand({
        apply: Boolean(opts.apply),
        family: opts.family as string | undefined,
        evidenceDir: opts.evidenceDir as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
