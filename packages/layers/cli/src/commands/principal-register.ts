import type { Command } from 'commander';
import {
  principalStatusCommand,
  principalListCommand,
  principalAttachCommand,
  principalDetachCommand,
} from './principal.js';
import { principalSyncFromTasksCommand } from './principal-sync-from-tasks.js';
import { silentCommandContext } from '../lib/command-wrapper.js';
import { emitFiniteCommandResult, emitFormatterBackedCommandResult } from '../lib/cli-output.js';

function outputFormat(): 'json' | 'human' | 'auto' {
  return process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto';
}

export function registerPrincipalCommands(program: Command): void {
  const principalCmd = program
    .command('principal')
    .description('Manage principal runtime state');

  principalCmd
    .command('status')
    .description('Show principal runtime state for all scopes')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: Record<string, unknown>) => {
      const result = await principalStatusCommand(
        {
          format: outputFormat(),
          verbose: opts.verbose as boolean | undefined,
          config: opts.config as string | undefined,
        },
        silentCommandContext({ verbose: !!opts.verbose }),
      );
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  principalCmd
    .command('list')
    .description('List principal runtimes')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--scope <id>', 'Filter by scope ID')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: Record<string, unknown>) => {
      const result = await principalListCommand(
        {
          format: outputFormat(),
          verbose: opts.verbose as boolean | undefined,
          config: opts.config as string | undefined,
          scope: opts.scope as string | undefined,
        },
        silentCommandContext({ verbose: !!opts.verbose }),
      );
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  principalCmd
    .command('attach <scope-id>')
    .description('Attach a principal to a scope')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--principal <id>', 'Principal identity ID (generated if omitted)')
    .option('--runtime <id>', 'Runtime instance ID (generated if omitted)')
    .option('--type <type>', 'Principal type: operator, agent, worker, external', 'operator')
    .option('--mode <mode>', 'Attachment mode: observe or interact', 'interact')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (scopeId: string, opts: Record<string, unknown>) => {
      const result = await principalAttachCommand(
        {
          scope: scopeId,
          format: outputFormat(),
          verbose: opts.verbose as boolean | undefined,
          config: opts.config as string | undefined,
          principal: opts.principal as string | undefined,
          runtime: opts.runtime as string | undefined,
          type: opts.type as string | undefined,
          mode: opts.mode as string | undefined,
        },
        silentCommandContext({ verbose: !!opts.verbose }),
      );
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  principalCmd
    .command('detach <runtime-id>')
    .description('Detach a principal from its scope')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--reason <text>', 'Detach reason')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (runtimeId: string, opts: Record<string, unknown>) => {
      const result = await principalDetachCommand(
        {
          runtimeId,
          format: outputFormat(),
          verbose: opts.verbose as boolean | undefined,
          config: opts.config as string | undefined,
          reason: opts.reason as string | undefined,
        },
        silentCommandContext({ verbose: !!opts.verbose }),
      );
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  principalCmd
    .command('sync-from-tasks')
    .description('Reconcile PrincipalRuntime state from task governance artifacts')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--principal-state-dir <path>', 'Directory containing PrincipalRuntime state file')
    .option('--dry-run', 'Show divergences without applying corrections', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(async (opts: Record<string, unknown>) => {
      const result = await principalSyncFromTasksCommand({
        cwd: opts.cwd as string | undefined,
        principalStateDir: opts.principalStateDir as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: outputFormat(),
      });
      emitFiniteCommandResult(result, { format: opts.format });
    });
}
