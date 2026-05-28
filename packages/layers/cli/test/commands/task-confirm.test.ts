import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskConfirmCommand } from '../../src/commands/task-confirm.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTaskLifecycleStore, type TaskStatus } from '../../src/lib/task-lifecycle-store.js';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
}

function createClosedTask(tempDir: string, num: number, hasProvenance = true) {
  const fm = hasProvenance
    ? `---\ntask_id: ${num}\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\ngoverned_by: task_close:operator\n---\n`
    : `---\ntask_id: ${num}\nstatus: closed\n---\n`;
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', `20260420-${num}-test.md`),
    `${fm}\n# Task ${num}\n\n## Goal\nDone.\n`,
  );
}

function seedLifecycle(tempDir: string, num: number, status: TaskStatus): void {
  const store = openTaskLifecycleStore(tempDir);
  try {
    store.upsertLifecycle({
      task_id: `20260420-${num}-test`,
      task_number: num,
      status,
      source: 'sqlite',
      closed_at: status === 'closed' || status === 'confirmed' ? '2026-04-20T00:00:00.000Z' : null,
      closed_by: status === 'closed' || status === 'confirmed' ? 'operator' : null,
      closure_mode: status === 'closed' || status === 'confirmed' ? 'operator_direct' : null,
      governed_by: status === 'closed' || status === 'confirmed' ? 'task_close:operator' : null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: '2026-04-20T00:00:00.000Z',
    });
  } finally {
    store.db.close();
  }
}

describe('task confirm operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-confirm-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('confirms a closed task with governed provenance', async () => {
    createClosedTask(tempDir, 200, true);

    const result = await taskConfirmCommand({
      taskNumber: '200',
      by: 'operator-1',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as Record<string, unknown>;
    expect(r.new_status).toBe('confirmed');
    expect(r.confirmed_by).toBe('operator-1');

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-200-test.md'), 'utf8');
    expect(content).toContain('status: confirmed');
    expect(content).toContain('confirmed_by: operator-1');
    expect(content).toContain('confirmed_at:');
  });

  it('updates sqlite lifecycle authority when confirming a closed task', async () => {
    createClosedTask(tempDir, 206, true);
    seedLifecycle(tempDir, 206, 'closed');

    const result = await taskConfirmCommand({
      taskNumber: '206',
      by: 'operator-1',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const store = openTaskLifecycleStore(tempDir);
    try {
      const lifecycle = store.getLifecycle('20260420-206-test');
      expect(lifecycle?.status).toBe('confirmed');
      expect(lifecycle?.governed_by).toBe('task_confirm:operator-1');
    } finally {
      store.db.close();
    }
  });

  it('repairs confirmed markdown projection when sqlite lifecycle is still closed', async () => {
    createClosedTask(tempDir, 207, true);
    seedLifecycle(tempDir, 207, 'closed');
    const taskPath = join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-207-test.md');
    const confirmedContent = readFileSync(taskPath, 'utf8')
      .replace('status: closed', 'status: confirmed')
      .replace('---\n\n# Task 207', 'confirmed_by: prior\nconfirmed_at: 2026-04-21T00:00:00.000Z\n---\n\n# Task 207');
    writeFileSync(taskPath, confirmedContent);

    const result = await taskConfirmCommand({
      taskNumber: '207',
      by: 'operator-1',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycle('20260420-207-test')?.status).toBe('confirmed');
    } finally {
      store.db.close();
    }
  });

  it('rejects confirming a task without governed provenance', async () => {
    createClosedTask(tempDir, 201, false);

    const result = await taskConfirmCommand({
      taskNumber: '201',
      by: 'operator-1',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('governed closure provenance'),
    });
  });

  it('rejects confirming an opened task', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-202-test.md'),
      '---\ntask_id: 202\nstatus: opened\n---\n\n# Task 202\n',
    );

    const result = await taskConfirmCommand({
      taskNumber: '202',
      by: 'operator-1',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('expected: closed'),
    });
  });

  it('rejects confirming a confirmed task', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-203-test.md'),
      '---\ntask_id: 203\nstatus: confirmed\nconfirmed_by: prior\n---\n\n# Task 203\n',
    );

    const result = await taskConfirmCommand({
      taskNumber: '203',
      by: 'operator-1',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('expected: closed'),
    });
  });

  it('returns error for non-existent task', async () => {
    const result = await taskConfirmCommand({
      taskNumber: '999',
      by: 'operator-1',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('not found'),
    });
  });

  it('returns error for invalid task number', async () => {
    const result = await taskConfirmCommand({
      taskNumber: 'abc',
      by: 'operator-1',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('Invalid'),
    });
  });

  it('emits structured JSON output', async () => {
    createClosedTask(tempDir, 204, true);

    const result = await taskConfirmCommand({
      taskNumber: '204',
      by: 'operator-1',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toEqual(
      expect.objectContaining({
        status: 'success',
        task_number: 204,
        new_status: 'confirmed',
        confirmed_by: 'operator-1',
      }),
    );
  });

  it('human output does not throw', async () => {
    createClosedTask(tempDir, 205, true);

    const result = await taskConfirmCommand({
      taskNumber: '205',
      by: 'operator-1',
      format: 'human',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      new_status: 'confirmed',
    });
  });
});
