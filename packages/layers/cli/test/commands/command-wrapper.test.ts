import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { directCommandAction } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('directCommandAction commander option normalization', () => {
  it('honors --cwd after positional arguments for task evidence inspect shape', async () => {
    const originalArgv = process.argv;
    const observed: Array<{ taskNumber: string; cwd: unknown }> = [];
    const program = new Command();
    program.exitOverride();
    const task = program.command('task');
    const evidence = task.command('evidence');
    evidence
      .command('inspect <task-number>')
      .option('--cwd <path>', 'Working directory', '.')
      .action(directCommandAction<[string, Record<string, unknown>]>({
        command: 'task evidence inspect',
        emit: () => {},
        invocation: async (taskNumber, opts) => {
          observed.push({ taskNumber, cwd: opts.cwd });
          return { exitCode: ExitCode.SUCCESS, result: { status: 'ok' } };
        },
      }));

    const argv = ['node', 'narada', 'task', 'evidence', 'inspect', '40', '--cwd', '/tmp/user-site'];
    try {
      process.argv = argv;
      await program.parseAsync(argv);
    } finally {
      process.argv = originalArgv;
    }

    expect(observed).toEqual([{ taskNumber: '40', cwd: '/tmp/user-site' }]);
  });

  it('honors --cwd before positional arguments for another task command shape', async () => {
    const originalArgv = process.argv;
    const observed: Array<{ taskNumber: string; cwd: unknown }> = [];
    const program = new Command();
    program.exitOverride();
    const task = program.command('task');
    task
      .command('read <task-number>')
      .option('--cwd <path>', 'Working directory', '.')
      .action(directCommandAction<[string, Record<string, unknown>]>({
        command: 'task read',
        emit: () => {},
        invocation: async (taskNumber, opts) => {
          observed.push({ taskNumber, cwd: opts.cwd });
          return { exitCode: ExitCode.SUCCESS, result: { status: 'ok' } };
        },
      }));

    const argv = ['node', 'narada', 'task', 'read', '--cwd', '/tmp/user-site', '41'];
    try {
      process.argv = argv;
      await program.parseAsync(argv);
    } finally {
      process.argv = originalArgv;
    }

    expect(observed).toEqual([{ taskNumber: '41', cwd: '/tmp/user-site' }]);
  });
});
