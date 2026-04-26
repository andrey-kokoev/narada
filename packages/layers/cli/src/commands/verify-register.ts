import type { Command } from 'commander';
import { verifyExplainCommand } from './verify-explain.js';
import { verifyRunCommand } from './verify-run.js';
import { verifyStatusCommand } from './verify-status.js';
import { verifySuggestCommand } from './verify-suggest.js';
import { directCommandAction, silentCommandContext } from '../lib/command-wrapper.js';
import { emitCommandResult } from '../lib/cli-output.js';

export function registerVerifyCommands(program: Command): void {
  const verifyCmd = program
    .command('verify')
    .description('Diagnostic verification operators — does not create durable test-run records. For canonical task verification, use `test-run`.');

  verifyCmd
    .command('status')
    .description('Summarize recent verification runs and outliers')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'verify status',
      emit: emitCommandResult,
      invocation: (opts) => verifyStatusCommand({
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT,
      }, silentCommandContext()),
      }, silentCommandContext()),
    }));

  verifyCmd
    .command('suggest')
    .description('Suggest the smallest verification command for changed files')
    .requiredOption('--files <paths>', 'Comma-separated changed source files')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'verify suggest',
      emit: emitCommandResult,
      invocation: (opts) => verifySuggestCommand({
        files: (opts.files as string | undefined)?.split(',').map((f) => f.trim()).filter(Boolean) ?? [],
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT,
      }, silentCommandContext()),
      }, silentCommandContext()),
    }));

  verifyCmd
    .command('explain')
    .description('Explain verification relevant to a task')
    .requiredOption('--task <number>', 'Task number')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'verify explain',
      emit: emitCommandResult,
      invocation: (opts) => verifyExplainCommand({
        taskNumber: opts.task as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT,
      }, silentCommandContext()),
      }, silentCommandContext()),
    }));

  verifyCmd
    .command('run')
    .description('Run a verification command through guarded scripts')
    .requiredOption('--cmd <command>', 'Verification command to run')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--allow-multi-file', 'Allow multi-file focused tests', false)
    .option('--allow-package', 'Allow package-level test commands', false)
    .option('--allow-full-suite', 'Allow full-suite commands', false)
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'verify run',
      emit: emitCommandResult,
      invocation: (opts) => verifyRunCommand({
        cmd: opts.cmd as string | undefined,
        cwd: opts.cwd as string | undefined,
        allowMultiFile: opts.allowMultiFile as boolean | undefined,
        allowPackage: opts.allowPackage as boolean | undefined,
        allowFullSuite: opts.allowFullSuite as boolean | undefined,
        format: process.env.OUTPUT_FORMAT,
      }, silentCommandContext()),
      }, silentCommandContext()),
    }));
}
