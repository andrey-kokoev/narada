import type { Command } from 'commander';
import {
  postureCheckCommand,
  postureShowCommand,
  postureUpdateCommand,
} from './posture.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerPostureCommands(program: Command): void {
  const postureCmd = program
    .command('posture')
    .description('CCC posture advisory signal management');

  postureCmd
    .command('show')
    .description('Display current CCC posture')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'posture show',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => postureShowCommand({
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  postureCmd
    .command('update')
    .description('Update CCC posture from a JSON file')
    .requiredOption('--from <source>', 'Source label, e.g. manual or chapter-closure-400-410')
    .option('--file <path>', 'Path to posture JSON file')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'posture update',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => postureUpdateCommand({
        from: opts.from as string,
        file: opts.file as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  postureCmd
    .command('check')
    .description('Validate current CCC posture schema and freshness')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'posture check',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => postureCheckCommand({
        format: resolveCommandFormat(opts.format, 'auto'),
        cwd: opts.cwd as string | undefined,
      }),
    }));
}
