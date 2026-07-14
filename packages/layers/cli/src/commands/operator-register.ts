import type { Command } from 'commander';
import { operatorStartCommand } from './operator.js';
import {directCommandAction, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerOperatorCommands(program: Command): void {
  const operatorCmd = program
    .command('operator')
    .description('First-time Operator guidance and bounded front-door commands');

  operatorCmd
    .command('start')
    .description('Read-only first-time Operator front door for a Site or operation locus')
    .requiredOption('--site <site-id-or-root>', 'Target Site id or root path')
    .option('--operation <operation-id>', 'Operation Specification id or path')
    .option('--role <role>', 'Role to prepare next action for', 'architect')
    .option('--execute', 'Reserved for future explicit execution; currently reports unsupported without mutating', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'human')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'operator start',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => operatorStartCommand({
        site: opts.site as string | undefined,
        operation: opts.operation as string | undefined,
        role: opts.role as string | undefined,
        execute: opts.execute as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'human'),
      }),
    }));
}
