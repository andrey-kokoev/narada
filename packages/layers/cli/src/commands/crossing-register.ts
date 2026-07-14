import type { Command } from 'commander';
import {
  crossingListCommand,
  crossingShowCommand,
} from './crossing.js';
import {directCommandAction, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerCrossingCommands(program: Command): void {
  const crossingCmd = program
    .command('crossing')
    .description('Crossing regime inspection operators (read-only)');

  crossingCmd
    .command('list')
    .description('List declared crossing regimes from the canonical inventory')
    .option('--classification <csv>', 'Filter by classification: canonical,advisory,deferred')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'crossing list',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => resolveCommandFormat(opts.format),
      invocation: (opts) => crossingListCommand({
        format: resolveCommandFormat(opts.format),
        classification: opts.classification as string | undefined,
      }),
    }));

  crossingCmd
    .command('show <name>')
    .description('Show a single crossing regime declaration')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'crossing show',
      emit: emitCommandResult,
      format: (_name: string, opts: CommanderOptionValues) => resolveCommandFormat(opts.format),
      invocation: (name, opts) => crossingShowCommand({
        name,
        format: resolveCommandFormat(opts.format),
      }),
    }));
}
