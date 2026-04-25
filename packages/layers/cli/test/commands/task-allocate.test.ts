import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskAllocateCommand } from '../../src/commands/task-allocate.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-alpha.md'),
    '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n',
  );
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-200-beta.md'),
    '---\ntask_id: 200\nstatus: opened\n---\n\n# Task 200\n',
  );
}

describe('task allocate operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-allocate-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('allocates the next number from scanned max', async () => {
    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ status: 'success', allocated_number: 201 });

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLastAllocated()).toBe(201);
    } finally {
      store.db.close();
    }
  });

  it('allocates sequentially', async () => {
    const r1 = await taskAllocateCommand({ cwd: tempDir, format: 'json' });
    expect(r1.result).toMatchObject({ allocated_number: 201 });

    const r2 = await taskAllocateCommand({ cwd: tempDir, format: 'json' });
    expect(r2.result).toMatchObject({ allocated_number: 202 });
  });

  it('allocates a sequential range with --count', async () => {
    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json', count: 3 });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      allocated_number: 201,
      allocated_numbers: [201, 202, 203],
      count: 3,
    });

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLastAllocated()).toBe(203);
    } finally {
      store.db.close();
    }
  });

  it('reconciles stale registry with current max', async () => {
    // Create a registry that lags behind the actual task files
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '.registry.json'),
      JSON.stringify({ version: 1, last_allocated: 50, reserved: [], released: [] }, null, 2),
    );

    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // Should allocate 201 (max from files is 200), not 51
    expect(result.result).toMatchObject({ allocated_number: 201 });

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLastAllocated()).toBe(201);
    } finally {
      store.db.close();
    }
  });

  it('allocates from a registry with reservations field (all released)', async () => {
    // Simulate reservation-era registry where all reservations are released
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '.registry.json'),
      JSON.stringify(
        {
          version: 1,
          last_allocated: 200,
          reservations: [
            {
              range_start: 150,
              range_end: 150,
              purpose: 'Legacy',
              reserved_by: 'test',
              reserved_at: '2026-01-01T00:00:00.000Z',
              expires_at: '2026-01-02T00:00:00.000Z',
              status: 'released',
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // Should allocate 201 (max from files is 200), not reuse 150
    expect(result.result).toMatchObject({ allocated_number: 201 });

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLastAllocated()).toBe(201);
    } finally {
      store.db.close();
    }
  });

  it('allocates from a registry with empty reservations array', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '.registry.json'),
      JSON.stringify(
        {
          version: 1,
          last_allocated: 200,
          reservations: [],
        },
        null,
        2,
      ),
    );

    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ allocated_number: 201 });
  });

  it('does not reuse released numbers from legacy registry once SQLite is authoritative', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '.registry.json'),
      JSON.stringify(
        {
          version: 1,
          last_allocated: 200,
          reserved: [200],
          released: [199, 198],
        },
        null,
        2,
      ),
    );

    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // SQLite authority is monotonic; projection-era released numbers are ignored.
    expect(result.result).toMatchObject({ allocated_number: 201 });

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLastAllocated()).toBe(201);
    } finally {
      store.db.close();
    }
  });

  it('emits structured JSON output', async () => {
    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toEqual(
      expect.objectContaining({
        status: 'success',
        allocated_number: expect.any(Number),
      }),
    );
  });

  it('human output does not throw', async () => {
    const result = await taskAllocateCommand({ cwd: tempDir, format: 'human' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ status: 'success', allocated_number: expect.any(Number) });
  });

  it('does not leave temp files behind after allocation', async () => {
    await taskAllocateCommand({ cwd: tempDir, format: 'json' });

    const files = readdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'));
    const tempFiles = files.filter((f) => f.startsWith('.tmp-'));
    expect(tempFiles).toHaveLength(0);
  });

  it('dry-run reports next number without mutating registry', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '.registry.json'),
      JSON.stringify({ version: 1, last_allocated: 200, reserved: [], released: [] }, null, 2),
    );

    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json', dryRun: true });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ status: 'dry_run', next_number: 201 });
    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLastAllocated()).toBe(0);
    } finally {
      store.db.close();
    }
  });

  it('dry-run previews a sequential range with --count', async () => {
    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json', dryRun: true, count: 3 });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'dry_run',
      next_number: 201,
      next_numbers: [201, 202, 203],
      count: 3,
    });
    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLastAllocated()).toBe(0);
    } finally {
      store.db.close();
    }
  });

  it('rejects invalid count', async () => {
    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json', count: 0 });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error', error: '--count must be a positive integer' });
  });

  it('dry-run previews next number from reservation-era registry', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '.registry.json'),
      JSON.stringify(
        {
          version: 1,
          last_allocated: 200,
          reservations: [
            {
              range_start: 150,
              range_end: 150,
              status: 'released',
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json', dryRun: true });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ status: 'dry_run', next_number: 201 });
  });

  it('dry-run human output does not throw', async () => {
    const result = await taskAllocateCommand({ cwd: tempDir, format: 'human', dryRun: true });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ status: 'dry_run', next_number: expect.any(Number) });
  });
});
