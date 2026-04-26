import type { Command } from 'commander';
import {
  testRunCommand,
  testRunInspectCommand,
  testRunListCommand,
} from './test-run.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult } from '../lib/cli-output.js';

export function registerTestRunCommands(program: Command): void {
  const testRunCmd = program
    .command('test-run')
    .description('Testing Intent Zone — governed test execution');

  testRunCmd
    .command('run')
    .description('Request and execute a governed test run')
    .requiredOption('--cmd <command>', 'Test command to run')
    .option('--task <number>', 'Link to a task number')
    .option('--timeout <seconds>', 'Timeout in seconds')
    .option('--scope <scope>', 'Scope: focused or full')
    .option('--requester <identity>', 'Requester identity', 'operator')
    .option('--rationale <text>', 'Why this run is being requested')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'test-run run',
      emit: emitCommandResult,
      invocation: (opts) => testRunCommand({
        cmd: opts.cmd as string | undefined,
        taskNumber: opts.task ? Number(opts.task) : undefined,
        timeout: opts.timeout ? Number(opts.timeout) : undefined,
        scope: opts.scope as 'focused' | 'full' | undefined,
        requester: opts.requester as string | undefined,
        rationale: opts.rationale as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      }),
    }));

  testRunCmd
    .command('inspect')
    .description('Inspect a test run result by ID')
    .requiredOption('--run-id <id>', 'Run ID to inspect')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'test-run inspect',
      emit: emitCommandResult,
      invocation: (opts) => testRunInspectCommand({
        runId: opts.runId as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      }),
    }));

  testRunCmd
    .command('list')
    .description('List recent test runs')
    .option('--task <number>', 'Filter to a specific task number')
    .option('--limit <n>', 'Maximum number of runs to show', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'test-run list',
      emit: emitCommandResult,
      invocation: (opts) => testRunListCommand({
        taskNumber: opts.task ? Number(opts.task) : undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      }),
    }));
}
