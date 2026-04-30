import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { taskPreflightCommand } from '../../src/commands/task-preflight.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

process.env.NARADA_TASK_LIFECYCLE_FAST_SQLITE = '1';

function setupRepo(tempDir: string): void {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'assignments'), { recursive: true });
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260430-101-open.md'),
    '---\ntask_id: 20260430-101-open\nstatus: opened\n---\n\n# Task 101\n',
  );
  writeFileSync(join(tempDir, '.ai', 'task-lifecycle-snapshot.json'), '{"version":1}\n');

  const store = openTaskLifecycleStore(tempDir);
  try {
    store.ensureTaskNumberFloor(150);
    store.upsertLifecycle({
      task_id: '20260430-101-open',
      task_number: 101,
      status: 'opened',
      governed_by: null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: '2026-01-01T00:00:00Z',
    });
    store.upsertLifecycle({
      task_id: '20260430-102-deferred',
      task_number: 102,
      status: 'deferred',
      governed_by: null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: '2026-01-01T00:00:00Z',
    });
  } finally {
    store.db.close();
  }
}

describe('task preflight command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-preflight-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports bounded task authority coordinates and lifecycle summary', async () => {
    const result = await taskPreflightCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const preflight = result.result as {
      command_authority: { read_only: boolean; bounded_output: boolean };
      authority: {
        canonical_task_db: { exists: boolean; path: string };
        canonical_task_spec_dir: { exists: boolean; file_count: number };
        legacy_surfaces: Array<{ path: string; exists: boolean; warning: string | null }>;
      };
      allocation: { last_allocated_number: number; next_allocatable_number: number };
      lifecycle_summary: { total: number; by_status: Record<string, number>; deferred_tasks: number[] };
    };

    expect(preflight.command_authority).toMatchObject({ read_only: true, bounded_output: true });
    expect(preflight.authority.canonical_task_db.exists).toBe(true);
    expect(preflight.authority.canonical_task_spec_dir).toMatchObject({ exists: true, file_count: 1 });
    expect(preflight.allocation).toMatchObject({
      last_allocated_number: 150,
      next_allocatable_number: 151,
    });
    expect(preflight.lifecycle_summary).toMatchObject({
      total: 2,
      by_status: { opened: 1, deferred: 1 },
      deferred_tasks: [102],
    });
  });

  it('warns about legacy task surfaces without dumping task snapshots', async () => {
    const result = await taskPreflightCommand({ cwd: tempDir, format: 'json' });
    const preflight = result.result as {
      authority: { legacy_surfaces: Array<{ path: string; exists: boolean; warning: string | null }> };
      dirty_state: { entries: string[]; truncated: boolean };
    };

    expect(preflight.authority.legacy_surfaces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        exists: true,
        warning: expect.stringContaining('legacy task spec surface'),
      }),
      expect.objectContaining({
        exists: true,
        warning: expect.stringContaining('legacy assignment projection surface'),
      }),
    ]));
    expect(preflight.dirty_state.entries.length).toBeLessThanOrEqual(12);
  });
});
