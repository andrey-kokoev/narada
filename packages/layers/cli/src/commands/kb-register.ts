import type { Command } from 'commander';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { kbAliasAddCommand, kbLintCommand, kbSearchCommand } from './kb.js';

export function registerKbCommands(program: Command): void {
  const kb = program
    .command('kb')
    .description('Site-local KB and runbook lookup operators');

  kb.command('search')
    .description('Search Site-local KB/runbooks by title, aliases, symptoms, systems, failure modes, and body excerpt')
    .requiredOption('--query <text>', 'Operator symptom phrase or lookup text')
    .option('--limit <n>', 'Maximum results', '10')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'kb search',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => kbSearchCommand({
        query: opts.query as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  const alias = kb.command('alias').description('Manage KB lookup aliases and symptom metadata');
  alias.command('add')
    .description('Add governed lookup metadata to a Site-local KB/runbook markdown file')
    .requiredOption('--file <path>', 'KB/runbook markdown file relative to the Site root')
    .option('--alias <text>', 'Lookup alias; may be repeated', collect, [])
    .option('--symptom <text>', 'Symptom phrase; may be repeated', collect, [])
    .option('--system <text>', 'System name; may be repeated', collect, [])
    .option('--failure-mode <text>', 'Failure mode; may be repeated', collect, [])
    .option('--related-runbook <path>', 'Related runbook path; may be repeated', collect, [])
    .requiredOption('--by <principal>', 'Principal recording the metadata')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'kb alias add',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => kbAliasAddCommand({
        file: opts.file as string | undefined,
        alias: opts.alias as string[] | undefined,
        symptom: opts.symptom as string[] | undefined,
        system: opts.system as string[] | undefined,
        failureMode: opts.failureMode as string[] | undefined,
        relatedRunbook: opts.relatedRunbook as string[] | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  kb.command('lint')
    .description('Check incident/runbook KB entries for lookup aliases or symptom phrases')
    .option('--limit <n>', 'Maximum findings', '50')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'kb lint',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => kbLintCommand({
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
