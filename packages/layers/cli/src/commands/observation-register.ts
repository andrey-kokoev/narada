import type { Command } from 'commander';
import {
  observationInspectCommand,
  observationListCommand,
  observationOpenCommand,
} from './observation.js';
import {directCommandAction, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerObservationCommands(program: Command): void {
  const observationCmd = program
    .command('observation')
    .description('Observation artifact operators');

  observationCmd
    .command('list')
    .description('List recent observation artifacts')
    .option('--limit <n>', 'Maximum artifacts to list', '20')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'observation list',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => observationListCommand({
        cwd: opts.cwd as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  observationCmd
    .command('inspect <artifact-id>')
    .description('Inspect an observation artifact')
    .option('--content', 'Include full artifact content', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'observation inspect',
      emit: emitCommandResult,
      format: (_artifactId: string, opts: CommanderOptionValues) => opts.format,
      invocation: (artifactId, opts) => observationInspectCommand({
        artifactId,
        cwd: opts.cwd as string | undefined,
        content: opts.content as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  observationCmd
    .command('open <artifact-id>')
    .description('Return the path and shell open command for an observation artifact')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'observation open',
      emit: emitCommandResult,
      format: (_artifactId: string, opts: CommanderOptionValues) => opts.format,
      invocation: (artifactId, opts) => observationOpenCommand({
        artifactId,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
