import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { taskLifecycleStatusCommand } from '../../src/commands/task-lifecycle-status.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { openTaskLifecycleStore, type SqliteTaskLifecycleStore, type TaskStatus } from '../../src/lib/task-lifecycle-store.js';

function setupRepo(tempDir: string): void {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260429-200-existing.md'),
    '---\ntask_id: 200\nstatus: opened\n---\n\n# Existing\n',
  );
  writeFileSync(join(tempDir, '.ai', 'task-lifecycle-snapshot.json'), '{}\n');
}

function seedTask(
  store: SqliteTaskLifecycleStore,
  taskNumber: number,
  status: TaskStatus,
  agent?: string,
): void {
  const taskId = `20260429-${taskNumber}-status`;
  store.upsertLifecycle({
    task_id: taskId,
    task_number: taskNumber,
    status,
    governed_by: null,
    closed_at: null,
    closed_by: null,
    closure_mode: null,
    reopened_at: null,
    reopened_by: null,
    continuation_packet_json: null,
    updated_at: new Date().toISOString(),
  });
  store.upsertTaskSpec({
    task_id: taskId,
    task_number: taskNumber,
    title: `Task ${taskNumber}`,
    chapter_markdown: 'Lifecycle Status',
    goal_markdown: 'Goal',
    context_markdown: 'Context',
    required_work_markdown: 'Work',
    non_goals_markdown: null,
    acceptance_criteria_json: JSON.stringify(['Done']),
    dependencies_json: JSON.stringify([]),
    updated_at: new Date().toISOString(),
  });
  if (agent) {
    store.insertAssignment({
      assignment_id: `assign-${taskNumber}`,
      task_id: taskId,
      agent_id: agent,
      claimed_at: new Date().toISOString(),
      released_at: null,
      release_reason: null,
      intent: 'primary',
    });
  }
}

describe('task lifecycle status command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-lifecycle-status-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports allocation posture without mutating allocation state', async () => {
    const before = openTaskLifecycleStore(tempDir);
    before.db.close();

    const result = await taskLifecycleStatusCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      command_authority: {
        read_only: true,
        mutates_lifecycle_state: false,
        dry_run_allocation_would_mutate: false,
      },
      allocation: {
        max_task_number: 200,
        last_allocated_number: 0,
        next_allocatable_number: 201,
        sequence_drift: {
          kind: 'sequence_lags_tasks',
          amount: 200,
        },
      },
    });

    const after = openTaskLifecycleStore(tempDir);
    try {
      expect(after.getLastAllocated()).toBe(0);
      expect(after.getAllLifecycle()).toHaveLength(0);
    } finally {
      after.db.close();
    }
  });

  it('reports sequence ahead drift without allocating reserved numbers', async () => {
    const store = openTaskLifecycleStore(tempDir);
    try {
      seedTask(store, 210, 'opened');
      store.ensureTaskNumberFloor(250);
    } finally {
      store.db.close();
    }

    const result = await taskLifecycleStatusCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      allocation: {
        max_task_number: 210,
        last_allocated_number: 250,
        next_allocatable_number: 251,
        sequence_drift: {
          kind: 'sequence_ahead_of_tasks',
          amount: 40,
        },
      },
    });
  });

  it('reports Builder done posture with canonical lifecycle vocabulary', async () => {
    const store = openTaskLifecycleStore(tempDir);
    try {
      seedTask(store, 301, 'opened');
      seedTask(store, 302, 'claimed', 'builder');
      seedTask(store, 303, 'in_review', 'builder');
      seedTask(store, 304, 'blocked');
      seedTask(store, 305, 'deferred');
    } finally {
      store.db.close();
    }

    const result = await taskLifecycleStatusCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      builder_done_posture: {
        open_task_count: 1,
        in_progress_task_count: 1,
        review_requested_or_handoff_needed_count: 1,
        blocked_or_deferred_count: 2,
        current_builder_work_packet_clean_to_hand_back: false,
      },
    });
    const posture = (result.result as { builder_done_posture: { lifecycle_vocabulary: string[]; residuals: string[] } }).builder_done_posture;
    expect(posture.lifecycle_vocabulary).toEqual([
      'opened',
      'claimed',
      'needs_continuation',
      'in_review',
      'blocked',
      'deferred',
      'closed',
      'confirmed',
    ]);
    expect(posture.residuals.join(' ')).toContain('builder has active or review-pending task 302');
    expect(posture.residuals.join(' ')).toContain('builder has active or review-pending task 303');
  });

  it('renders bounded human output with diagnostic-only SQLite guidance', async () => {
    const result = await taskLifecycleStatusCommand({ cwd: tempDir, format: 'human' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const human = String((result.result as { _formatted: string })._formatted);
    expect(human).toContain('Task Lifecycle Status');
    expect(human).toContain('Next allocatable: 201');
    expect(human).toContain('Direct SQLite reads: diagnostic-only');
  });
});
