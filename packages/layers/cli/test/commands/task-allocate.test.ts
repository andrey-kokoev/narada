import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskAllocateCommand } from '../../src/commands/task-allocate.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
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
});
