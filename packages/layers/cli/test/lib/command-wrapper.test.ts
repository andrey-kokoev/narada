import { describe, expect, it } from 'vitest';
import { directCommandAction, normalizeCommandError, runDirectCommand, runDirectCommandWithResource } from '../../src/lib/command-wrapper.js';

describe('command error normalization', () => {
  it('normalizes SQLITE_BUSY into a terse retryable operator error', () => {
    const error = Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });

    expect(normalizeCommandError('task claim', error)).toEqual({
      status: 'error',
      command: 'task claim',
      error: 'Task lifecycle database is busy. Retry the command, or avoid parallel task lifecycle writes.',
      retryable: true,
    });
  });

  it('does not normalize unrelated errors', () => {
    expect(normalizeCommandError('task claim', new Error('boom'))).toBeUndefined();
  });
});

describe('direct command runner', () => {
  it('emits successful results without exiting', async () => {
    const emitted: Array<{ result: unknown; format?: unknown }> = [];

    await runDirectCommand({
      command: 'task test',
      invocation: async () => ({ exitCode: 0, result: { status: 'success' } }),
      emit: (result, format) => emitted.push({ result, format }),
      format: 'json',
      exit: (code): never => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(emitted).toEqual([{ result: { status: 'success' }, format: 'json' }]);
  });

  it('emits non-zero results and exits with the command exit code', async () => {
    const emitted: unknown[] = [];
    let exitCode: number | null = null;

    await expect(runDirectCommand({
      command: 'task test',
      invocation: async () => ({ exitCode: 2, result: { status: 'error', error: 'bad' } }),
      emit: (result) => emitted.push(result),
      exit: (code): never => {
        exitCode = code;
        throw new Error('exit');
      },
    })).rejects.toThrow('exit');

    expect(emitted).toEqual([{ status: 'error', error: 'bad' }]);
    expect(exitCode).toBe(2);
  });

  it('normalizes SQLite busy thrown errors and exits general error', async () => {
    const emitted: unknown[] = [];
    let exitCode: number | null = null;

    await expect(runDirectCommand({
      command: 'task claim',
      invocation: async () => {
        throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
      },
      emit: (result) => emitted.push(result),
      exit: (code): never => {
        exitCode = code;
        throw new Error('exit');
      },
    })).rejects.toThrow('exit');

    expect(emitted).toEqual([{
      status: 'error',
      command: 'task claim',
      error: 'Task lifecycle database is busy. Retry the command, or avoid parallel task lifecycle writes.',
      retryable: true,
    }]);
    expect(exitCode).toBe(1);
  });

  it('rethrows unexpected invocation errors', async () => {
    await expect(runDirectCommand({
      command: 'task test',
      invocation: async () => {
        throw new Error('boom');
      },
      emit: () => undefined,
      exit: (code): never => {
        throw new Error(`unexpected exit ${code}`);
      },
    })).rejects.toThrow('boom');
  });
});

describe('direct command action helper', () => {
  it('adapts action arguments to a direct command invocation', async () => {
    const emitted: Array<{ result: unknown; format?: unknown }> = [];
    const action = directCommandAction<[string, { format: string }]>({
      command: 'task action',
      invocation: async (taskNumber, opts) => ({
        exitCode: 0,
        result: { status: 'success', taskNumber, optionFormat: opts.format },
      }),
      emit: (result, format) => emitted.push({ result, format }),
      format: (_taskNumber, opts) => opts.format,
      exit: (code): never => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    await action('123', { format: 'json' });

    expect(emitted).toEqual([{
      result: { status: 'success', taskNumber: '123', optionFormat: 'json' },
      format: 'json',
    }]);
  });

  it('preserves nonzero command exit behavior', async () => {
    const emitted: unknown[] = [];
    let exitCode: number | null = null;
    const action = directCommandAction<[Record<string, unknown>]>({
      command: 'task action',
      invocation: async () => ({ exitCode: 2, result: { status: 'error', error: 'bad' } }),
      emit: (result) => emitted.push(result),
      exit: (code): never => {
        exitCode = code;
        throw new Error('exit');
      },
    });

    await expect(action({})).rejects.toThrow('exit');

    expect(emitted).toEqual([{ status: 'error', error: 'bad' }]);
    expect(exitCode).toBe(2);
  });
});

describe('resource-scoped direct command runner', () => {
  it('closes the resource after successful command execution', async () => {
    const events: string[] = [];

    await runDirectCommandWithResource({
      command: 'task resource',
      open: () => ({ id: 'store' }),
      close: (resource) => {
        events.push(`close:${resource.id}`);
      },
      invocation: async (resource) => {
        events.push(`invoke:${resource.id}`);
        return { exitCode: 0, result: { status: 'success' } };
      },
      emit: () => undefined,
      exit: (code): never => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(events).toEqual(['invoke:store', 'close:store']);
  });

  it('closes the resource after normalized SQLite busy exit', async () => {
    const events: string[] = [];

    await expect(runDirectCommandWithResource({
      command: 'task resource',
      open: () => ({ id: 'store' }),
      close: (resource) => {
        events.push(`close:${resource.id}`);
      },
      invocation: async () => {
        events.push('invoke');
        throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
      },
      emit: () => undefined,
      exit: (): never => {
        throw new Error('exit');
      },
    })).rejects.toThrow('exit');

    expect(events).toEqual(['invoke', 'close:store']);
  });

  it('closes the resource after unexpected invocation errors', async () => {
    const events: string[] = [];

    await expect(runDirectCommandWithResource({
      command: 'task resource',
      open: () => ({ id: 'store' }),
      close: (resource) => {
        events.push(`close:${resource.id}`);
      },
      invocation: async () => {
        events.push('invoke');
        throw new Error('boom');
      },
      emit: () => undefined,
      exit: (code): never => {
        throw new Error(`unexpected exit ${code}`);
      },
    })).rejects.toThrow('boom');

    expect(events).toEqual(['invoke', 'close:store']);
  });
});
