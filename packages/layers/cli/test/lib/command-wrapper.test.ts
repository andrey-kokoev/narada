import type { CommanderOptionValues } from '../../src/lib/command-wrapper.js';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  directCommandAction,
  normalizeCommandError,
  resourceScopedDirectCommandAction,
  runDirectCommand,
  runDirectCommandWithResource,
} from '../../src/lib/command-wrapper.js';
import { WorkspaceLaunchContractError } from '../../src/commands/workspace-launch-contracts.js';

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

  it('emits unexpected invocation errors as structured command errors', async () => {
    const emitted: unknown[] = [];
    let exitCode: number | null = null;

    await expect(runDirectCommand({
      command: 'task test',
      invocation: async () => {
        throw new Error('boom');
      },
      emit: (result) => emitted.push(result),
      exit: (code): never => {
        exitCode = code;
        throw new Error('exit');
      },
    })).rejects.toThrow('exit');

    expect(emitted).toEqual([{
      status: 'error',
      command: 'task test',
      error: 'boom',
      retryable: false,
    }]);
    expect(exitCode).toBe(1);
  });

  it('preserves launcher contract refusals as stable redacted action envelopes', async () => {
    const emitted: unknown[] = [];
    let exitCode: number | null = null;

    await expect(runDirectCommand({
      command: 'launcher workspace-launch',
      invocation: async () => {
        throw new WorkspaceLaunchContractError(
          'workspace_launch_mcp_scope_missing',
          'MCP scope must be explicitly admitted.',
          'Set McpScope on the launch record.',
        );
      },
      emit: (result) => emitted.push(result),
      exit: (code): never => {
        exitCode = code;
        throw new Error('exit');
      },
    })).rejects.toThrow('exit');

    expect(emitted).toEqual([{
      schema: 'narada.workspace_launch.action_refusal.v1',
      status: 'refused',
      command: 'launcher workspace-launch',
      reason_code: 'workspace_launch_mcp_scope_missing',
      message: 'MCP scope must be explicitly admitted.',
      required_next_step: 'Set McpScope on the launch record.',
      artifact_path: null,
      retryable: false,
    }]);
    expect(exitCode).toBe(1);
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
    const action = directCommandAction<[CommanderOptionValues]>({
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

  it('refuses mutating commands from a configured non-authority clone', async () => {
    const authority = mkdtempSync(join(tmpdir(), 'narada-authority-'));
    const embodiment = mkdtempSync(join(tmpdir(), 'narada-embodiment-'));
    try {
      mkdirSync(join(embodiment, '.ai'), { recursive: true });
      writeFileSync(join(embodiment, '.ai', 'authority-clone.json'), JSON.stringify({
        authority_root: authority,
      }));

      const emitted: unknown[] = [];
      let exitCode: number | null = null;
      const action = directCommandAction<[CommanderOptionValues]>({
        command: 'task claim',
        invocation: async () => ({ exitCode: 0, result: { status: 'success' } }),
        emit: (result) => emitted.push(result),
        exit: (code): never => {
          exitCode = code;
          throw new Error('exit');
        },
      });

      await expect(action({ cwd: embodiment })).rejects.toThrow('exit');

      expect(exitCode).toBe(1);
      expect(emitted).toEqual([
        expect.objectContaining({
          status: 'error',
          authority_clone: expect.objectContaining({
            status: 'non_authority_clone',
            authority_root: authority,
          }),
        }),
      ]);
    } finally {
      rmSync(authority, { recursive: true, force: true });
      rmSync(embodiment, { recursive: true, force: true });
    }
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

  it('closes the resource after structured unexpected invocation error exits', async () => {
    const events: string[] = [];
    const emitted: unknown[] = [];
    let exitCode: number | null = null;

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
      emit: (result) => emitted.push(result),
      exit: (code): never => {
        exitCode = code;
        throw new Error('exit');
      },
    })).rejects.toThrow('exit');

    expect(events).toEqual(['invoke', 'close:store']);
    expect(emitted).toEqual([{
      status: 'error',
      command: 'task resource',
      error: 'boom',
      retryable: false,
    }]);
    expect(exitCode).toBe(1);
  });
});

describe('resource-scoped direct command action helper', () => {
  it('adapts action arguments to a resource-scoped invocation', async () => {
    const events: string[] = [];
    const emitted: Array<{ result: unknown; format?: unknown }> = [];
    const action = resourceScopedDirectCommandAction<{ id: string }, [string, { format: string }]>({
      command: 'task resource action',
      open: (taskNumber) => {
        events.push(`open:${taskNumber}`);
        return { id: 'store' };
      },
      close: (resource) => {
        events.push(`close:${resource.id}`);
      },
      invocation: async (resource, taskNumber) => {
        events.push(`invoke:${resource.id}:${taskNumber}`);
        return { exitCode: 0, result: { status: 'success', taskNumber } };
      },
      emit: (result, format) => emitted.push({ result, format }),
      format: (_taskNumber, opts) => opts.format,
      exit: (code): never => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    await action('123', { format: 'json' });

    expect(events).toEqual(['open:123', 'invoke:store:123', 'close:store']);
    expect(emitted).toEqual([{ result: { status: 'success', taskNumber: '123' }, format: 'json' }]);
  });

  it('closes resources when the adapted invocation exits nonzero', async () => {
    const events: string[] = [];
    let exitCode: number | null = null;
    const action = resourceScopedDirectCommandAction<{ id: string }, [CommanderOptionValues]>({
      command: 'task resource action',
      open: () => {
        events.push('open');
        return { id: 'store' };
      },
      close: (resource) => {
        events.push(`close:${resource.id}`);
      },
      invocation: async () => {
        events.push('invoke');
        return { exitCode: 2, result: { status: 'error', error: 'bad' } };
      },
      emit: () => undefined,
      exit: (code): never => {
        exitCode = code;
        throw new Error('exit');
      },
    });

    await expect(action({})).rejects.toThrow('exit');

    expect(events).toEqual(['open', 'invoke', 'close:store']);
    expect(exitCode).toBe(2);
  });
});
