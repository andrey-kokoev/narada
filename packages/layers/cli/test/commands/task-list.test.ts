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

  function writeOpenedTask(taskNumber: number): void {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', `20260420-${taskNumber}-task.md`),
      `---\ntask_id: 20260420-${taskNumber}-task\ntask_number: ${taskNumber}\nstatus: opened\n---\n\n# Task ${taskNumber}\n\n## Acceptance Criteria\n\n- [ ] Done\n`,
    );
  }

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
      '---\ntask_id: 20260420-260-a\ntask_number: 260\nstatus: opened\n---\n\n# Task 260\n\n## Acceptance Criteria\n\n- [ ] Done\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-261-b.md'),
      '---\ntask_id: 20260420-261-b\ntask_number: 261\nstatus: needs_continuation\n---\n\n# Task 261\n\n## Acceptance Criteria\n\n- [ ] Done\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-262-c.md'),
      '---\ntask_id: 20260420-262-c\ntask_number: 262\nstatus: closed\n---\n\n# Task 262\n\n## Acceptance Criteria\n\n- [ ] Done\n',
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
      '---\ntask_id: 20260420-260-a\ntask_number: 260\nstatus: opened\ncontinuation_affinity:\n  preferred_agent_id: agent-a\n  affinity_strength: 3\n---\n\n# Task 260\n\n## Acceptance Criteria\n\n- [ ] Done\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-261-b.md'),
      '---\ntask_id: 20260420-261-b\ntask_number: 261\nstatus: opened\ncontinuation_affinity:\n  preferred_agent_id: agent-b\n  affinity_strength: 1\n---\n\n# Task 261\n\n## Acceptance Criteria\n\n- [ ] Done\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-262-c.md'),
      '---\ntask_id: 20260420-262-c\ntask_number: 262\nstatus: opened\n---\n\n# Task 262\n\n## Acceptance Criteria\n\n- [ ] Done\n',
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
      '---\ntask_id: 20260420-270-test\ntask_number: 270\nstatus: opened\n---\n\n# Task 270\n\n## Acceptance Criteria\n\n- [ ] Done\n',
    );
    // Markdown says closed, SQLite says opened → task should appear as opened
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-271-test.md'),
      '---\ntask_id: 20260420-271-test\ntask_number: 271\nstatus: closed\n---\n\n# Task 271\n\n## Acceptance Criteria\n\n- [ ] Done\n',
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
      '---\ntask_id: 20260420-520-a\ntask_number: 520\nstatus: opened\n---\n\n# Task 520\n\n## Acceptance Criteria\n\n- [ ] Done\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-521-b.md'),
      '---\ntask_id: 20260420-521-b\ntask_number: 521\nstatus: opened\n---\n\n# Task 521\n\n## Acceptance Criteria\n\n- [ ] Done\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-522-c.md'),
      '---\ntask_id: 20260420-522-c\ntask_number: 522\nstatus: opened\n---\n\n# Task 522\n\n## Acceptance Criteria\n\n- [ ] Done\n',
    );

    const result = await taskListCommand({ cwd: tempDir, format: 'json', range: '521-522' });
    expect(result.exitCode).toBe(0);
    const r = result.result as { count: number; tasks: Array<{ task_number: number }> };
    expect(r.count).toBe(2);
    expect(r.tasks.map((t) => t.task_number)).toEqual([521, 522]);
  });

  it('bounds JSON output by default', async () => {
    for (let taskNumber = 600; taskNumber < 625; taskNumber++) {
      writeOpenedTask(taskNumber);
    }

    const result = await taskListCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(0);
    const r = result.result as {
      count: number;
      total_count: number;
      limit: number;
      truncated: boolean;
      next_step: string | null;
      tasks: Array<{ task_number: number }>;
    };
    expect(r.count).toBe(20);
    expect(r.total_count).toBe(25);
    expect(r.limit).toBe(20);
    expect(r.truncated).toBe(true);
    expect(r.next_step).toContain('--all');
    expect(r.tasks).toHaveLength(20);
  });

  it('allows explicit larger bounded output', async () => {
    for (let taskNumber = 700; taskNumber < 725; taskNumber++) {
      writeOpenedTask(taskNumber);
    }

    const result = await taskListCommand({ cwd: tempDir, format: 'json', limit: 23 });
    expect(result.exitCode).toBe(0);
    const r = result.result as { count: number; total_count: number; limit: number; truncated: boolean; tasks: unknown[] };
    expect(r.count).toBe(23);
    expect(r.total_count).toBe(25);
    expect(r.limit).toBe(23);
    expect(r.truncated).toBe(true);
    expect(r.tasks).toHaveLength(23);
  });

  it('allows explicit unbounded output', async () => {
    for (let taskNumber = 800; taskNumber < 825; taskNumber++) {
      writeOpenedTask(taskNumber);
    }

    const result = await taskListCommand({ cwd: tempDir, format: 'json', all: true });
    expect(result.exitCode).toBe(0);
    const r = result.result as { count: number; total_count: number; limit: null; truncated: boolean; tasks: unknown[] };
    expect(r.count).toBe(25);
    expect(r.total_count).toBe(25);
    expect(r.limit).toBeNull();
    expect(r.truncated).toBe(false);
    expect(r.tasks).toHaveLength(25);
  });

  it('applies range before default output bound', async () => {
    for (let taskNumber = 900; taskNumber < 950; taskNumber++) {
      writeOpenedTask(taskNumber);
    }

    const result = await taskListCommand({ cwd: tempDir, format: 'json', range: '910-934' });
    expect(result.exitCode).toBe(0);
    const r = result.result as { count: number; total_count: number; truncated: boolean; tasks: Array<{ task_number: number }> };
    expect(r.count).toBe(20);
    expect(r.total_count).toBe(25);
    expect(r.truncated).toBe(true);
    expect(r.tasks[0].task_number).toBe(910);
    expect(r.tasks[19].task_number).toBe(929);
  });
});
