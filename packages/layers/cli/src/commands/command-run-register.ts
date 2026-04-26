import type { Command } from 'commander';
import {
  commandRunCommand,
  commandRunInspectCommand,
  commandRunListCommand,
} from './command-run.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult } from '../lib/cli-output.js';

export function registerCommandRunCommands(program: Command): void {
  const commandRunCmd = program
    .command('command-run')
    .description('Command Execution Intent Zone — governed command execution');

  commandRunCmd
    .command('run')
    .description('Request and execute a governed command run')
    .option('--cmd <command>', 'Command string to run; argv-first unless --shell is set')
    .option('--argv <json>', 'Command argv JSON array')
    .option('--preset <name>', 'Named diagnostic preset: cli-build, task-graph-json, workbench-diagnose')
    .option('--shell', 'Run through shell mode after classification', false)
    .option('--task <number>', 'Link to a task number')
    .option('--agent <id>', 'Agent identity linkage')
    .option('--requester <identity>', 'Requester identity')
    .option('--requester-kind <kind>', 'Requester kind: operator, agent, or system')
    .option('--side-effect <class>', 'Side-effect class')
    .option('--timeout <seconds>', 'Timeout in seconds')
    .option('--output-profile <profile>', 'Output admission profile', 'bounded_excerpt')
    .option('--rationale <text>', 'Why this run is being requested')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'command-run run',
      emit: emitCommandResult,
      invocation: (opts) => commandRunCommand({
        cmd: opts.cmd as string | undefined,
        argv: opts.argv as string | undefined,
        preset: opts.preset as never,
        shell: opts.shell as boolean | undefined,
        taskNumber: opts.task ? Number(opts.task) : undefined,
        agent: opts.agent as string | undefined,
        requester: opts.requester as string | undefined,
        requesterKind: opts.requesterKind as 'operator' | 'agent' | 'system' | undefined,
        sideEffect: opts.sideEffect as never,
        timeout: opts.timeout ? Number(opts.timeout) : undefined,
        outputProfile: opts.outputProfile as never,
        rationale: opts.rationale as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      }),
    }));

  commandRunCmd
    .command('inspect')
    .description('Inspect a command run without raw unbounded output')
    .requiredOption('--run-id <id>', 'Run ID to inspect')
    .option('--full', 'Include full metadata and retained artifact pointer', false)
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'command-run inspect',
      emit: emitCommandResult,
      invocation: (opts) => commandRunInspectCommand({
        runId: opts.runId as string | undefined,
        full: opts.full as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      }),
    }));

  commandRunCmd
    .command('list')
    .description('List recent command runs with bounded output')
    .option('--task <number>', 'Filter by task number')
    .option('--agent <id>', 'Filter by agent ID')
    .option('--limit <n>', 'Maximum rows', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'command-run list',
      emit: emitCommandResult,
      invocation: (opts) => commandRunListCommand({
        taskNumber: opts.task ? Number(opts.task) : undefined,
        agent: opts.agent as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      }),
    }));
}
