import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskAllocateCommand } from '../../src/commands/task-allocate.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
  writeFileSync(
    join(tempDir, '.ai', 'tasks', '20260420-100-alpha.md'),
    '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n',
  );
  writeFileSync(
    join(tempDir, '.ai', 'tasks', '20260420-200-beta.md'),
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

    const registryRaw = readFileSync(join(tempDir, '.ai', 'tasks', '.registry.json'), 'utf8');
    const registry = JSON.parse(registryRaw);
    expect(registry.last_allocated).toBe(201);
    expect(registry.reserved).toContain(201);
  });

  it('allocates sequentially', async () => {
    const r1 = await taskAllocateCommand({ cwd: tempDir, format: 'json' });
    expect(r1.result).toMatchObject({ allocated_number: 201 });

    const r2 = await taskAllocateCommand({ cwd: tempDir, format: 'json' });
    expect(r2.result).toMatchObject({ allocated_number: 202 });
  });

  it('reconciles stale registry with current max', async () => {
    // Create a registry that lags behind the actual task files
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '.registry.json'),
      JSON.stringify({ version: 1, last_allocated: 50, reserved: [], released: [] }, null, 2),
    );

    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // Should allocate 201 (max from files is 200), not 51
    expect(result.result).toMatchObject({ allocated_number: 201 });

    const registryRaw = readFileSync(join(tempDir, '.ai', 'tasks', '.registry.json'), 'utf8');
    const registry = JSON.parse(registryRaw);
    expect(registry.last_allocated).toBe(201);
  });

  it('allocates from a registry with reservations field (all released)', async () => {
    // Simulate reservation-era registry where all reservations are released
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '.registry.json'),
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

    const registryRaw = readFileSync(join(tempDir, '.ai', 'tasks', '.registry.json'), 'utf8');
    const registry = JSON.parse(registryRaw);
    expect(registry.last_allocated).toBe(201);
    expect(registry.reserved).toContain(201);
  });

  it('allocates from a registry with empty reservations array', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '.registry.json'),
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

  it('reuses released numbers from legacy registry', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '.registry.json'),
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
    // Should reuse the smallest released number
    expect(result.result).toMatchObject({ allocated_number: 198 });

    const registryRaw = readFileSync(join(tempDir, '.ai', 'tasks', '.registry.json'), 'utf8');
    const registry = JSON.parse(registryRaw);
    expect(registry.released).not.toContain(198);
    expect(registry.reserved).toContain(198);
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

    const files = readdirSync(join(tempDir, '.ai', 'tasks'));
    const tempFiles = files.filter((f) => f.startsWith('.tmp-'));
    expect(tempFiles).toHaveLength(0);
  });

  it('dry-run reports next number without mutating registry', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '.registry.json'),
      JSON.stringify({ version: 1, last_allocated: 200, reserved: [], released: [] }, null, 2),
    );

    const beforeRaw = readFileSync(join(tempDir, '.ai', 'tasks', '.registry.json'), 'utf8');

    const result = await taskAllocateCommand({ cwd: tempDir, format: 'json', dryRun: true });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ status: 'dry_run', next_number: 201 });

    const afterRaw = readFileSync(join(tempDir, '.ai', 'tasks', '.registry.json'), 'utf8');
    expect(afterRaw).toBe(beforeRaw);
  });

  it('dry-run previews next number from reservation-era registry', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '.registry.json'),
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
