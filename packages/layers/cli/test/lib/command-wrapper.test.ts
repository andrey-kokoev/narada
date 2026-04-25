import { describe, expect, it } from 'vitest';
import { normalizeCommandError } from '../../src/lib/command-wrapper.js';

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
