import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskListCommand } from '../../src/commands/task-list.js';
import { Database } from '@narada2/control-plane';
import { SqliteTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('task list operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-list-'));
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty when no runnable tasks', async () => {
    const result = await taskListCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(0);
    const r = result.result as { count: number; tasks: unknown[] };
    expect(r.count).toBe(0);
    expect(r.tasks).toHaveLength(0);
  });

  it('lists only opened and needs_continuation tasks', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-260-a.md'),
      '---\ntask_id: 260\nstatus: opened\n---\n\n# Task 260\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-261-b.md'),
      '---\ntask_id: 261\nstatus: needs_continuation\n---\n\n# Task 261\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-262-c.md'),
      '---\ntask_id: 262\nstatus: closed\n---\n\n# Task 262\n',
    );

    const result = await taskListCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(0);
    const r = result.result as { count: number; tasks: Array<{ task_number: number; status: string }> };
    expect(r.count).toBe(2);
    expect(r.tasks.map((t) => t.task_number)).toEqual([260, 261]);
  });

  it('sorts by affinity strength descending', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-260-a.md'),
      '---\ntask_id: 260\nstatus: opened\ncontinuation_affinity:\n  preferred_agent_id: agent-a\n  affinity_strength: 3\n---\n\n# Task 260\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-261-b.md'),
      '---\ntask_id: 261\nstatus: opened\ncontinuation_affinity:\n  preferred_agent_id: agent-b\n  affinity_strength: 1\n---\n\n# Task 261\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-262-c.md'),
      '---\ntask_id: 262\nstatus: opened\n---\n\n# Task 262\n',
    );

    const result = await taskListCommand({ cwd: tempDir, format: 'json' });
    const r = result.result as { tasks: Array<{ task_number: number; affinity: { strength: number } }> };
    expect(r.tasks[0].task_number).toBe(260);
    expect(r.tasks[0].affinity.strength).toBe(3);
    expect(r.tasks[1].task_number).toBe(261);
    expect(r.tasks[1].affinity.strength).toBe(1);
    expect(r.tasks[2].task_number).toBe(262);
    expect(r.tasks[2].affinity.strength).toBe(0);
  });

  it('uses SQLite projection when DB exists (SQLite status wins)', async () => {
    // Markdown says opened, SQLite says closed → task should not appear
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-270-test.md'),
      '---\ntask_id: 270\nstatus: opened\n---\n\n# Task 270\n',
    );
    // Markdown says closed, SQLite says opened → task should appear as opened
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-271-test.md'),
      '---\ntask_id: 271\nstatus: closed\n---\n\n# Task 271\n',
    );

    // Create SQLite DB at the expected path
    const dbPath = join(tempDir, '.ai', 'task-lifecycle.db');
    const db = new Database(dbPath);
    const store = new SqliteTaskLifecycleStore({ db });
    store.initSchema();

    store.upsertLifecycle({
      task_id: '20260420-270-test',
      task_number: 270,
      status: 'closed',
      governed_by: 'operator',
      closed_at: new Date().toISOString(),
      closed_by: 'operator',
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: new Date().toISOString(),
    });

    store.upsertLifecycle({
      task_id: '20260420-271-test',
      task_number: 271,
      status: 'opened',
      governed_by: null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: new Date().toISOString(),
    });

    db.close();

    const result = await taskListCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(0);
    const r = result.result as { count: number; tasks: Array<{ task_number: number; status: string }> };

    // Only task 271 should appear, with SQLite-authoritative status 'opened'
    expect(r.count).toBe(1);
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0].task_number).toBe(271);
    expect(r.tasks[0].status).toBe('opened');
  });

  it('filters runnable tasks by range', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-520-a.md'),
      '---\ntask_id: 520\nstatus: opened\n---\n\n# Task 520\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-521-b.md'),
      '---\ntask_id: 521\nstatus: opened\n---\n\n# Task 521\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-522-c.md'),
      '---\ntask_id: 522\nstatus: opened\n---\n\n# Task 522\n',
    );

    const result = await taskListCommand({ cwd: tempDir, format: 'json', range: '521-522' });
    expect(result.exitCode).toBe(0);
    const r = result.result as { count: number; tasks: Array<{ task_number: number }> };
    expect(r.count).toBe(2);
    expect(r.tasks.map((t) => t.task_number)).toEqual([521, 522]);
  });
});
