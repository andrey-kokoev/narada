import type { Command } from 'commander';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { coherenceScanCommand } from './coherence-scan.js';

export function registerCoherenceCommands(program: Command): void {
  const coherenceCmd = program
    .command('coherence')
    .description('Self-maintenance coherence observation operators');

  coherenceCmd
    .command('scan')
    .description('Scan for bounded repo incoherences and optionally submit inbox envelopes')
    .option('--module <name>', 'Module to run: operational, semantic, telos, documentation, mutation_evidence, locus, authority_inversion, or all; repeatable/comma-separated', collectValues, [])
    .option('--submit', 'Submit findings to Canonical Inbox as inert envelopes', false)
    .option('--limit <n>', 'Maximum findings', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'coherence scan',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => coherenceScanCommand({
        submit: opts.submit as boolean | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        modules: opts.module as string[] | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}
