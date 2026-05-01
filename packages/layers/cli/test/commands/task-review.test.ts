import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimTaskService, continueTaskService, releaseTaskService } from '@narada2/task-governance/task-assignment-lifecycle-service';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { taskCloseCommand } from '../../src/commands/task-close.js';
import { taskEvidenceAdmitCommand } from '../../src/commands/task-evidence.js';
import { taskReviewCommand } from '../../src/commands/task-review.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

process.env.NARADA_TASK_LIFECYCLE_FAST_SQLITE = '1';

function setupRepo(tempDir: string): void {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'worker', role: 'implementer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'reviewer', role: 'reviewer', capabilities: ['review'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );
  const store = openTaskLifecycleStore(tempDir);
  try {
    for (const agent of ['worker', 'reviewer']) {
      store.upsertRosterEntry({
        agent_id: agent,
        role: agent === 'reviewer' ? 'reviewer' : 'implementer',
        capabilities_json: JSON.stringify(agent === 'reviewer' ? ['review'] : ['claim']),
        first_seen_at: '2026-01-01T00:00:00Z',
        last_active_at: '2026-01-01T00:00:00Z',
        status: 'idle',
        task_number: null,
        last_done: null,
        updated_at: '2026-01-01T00:00:00Z',
      });
    }
  } finally {
    store.db.close();
  }

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Test Task\n\n## Acceptance Criteria\n\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nTests passed.\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1000-evidence-repair-task.md'),
    '---\ntask_id: 1000\nstatus: opened\n---\n\n# Task 1000: Evidence Repair Task\n\n## Acceptance Criteria\n\n- [x] Done\n\n## Execution Notes\nCompleted.\n',
  );
}

describe('task review command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-review-command-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('delegates accepted reviews and writes mutation evidence', async () => {
    await claimTaskService({ taskNumber: '999', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '999', reason: 'completed', cwd: tempDir });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      verdict: 'accepted',
      new_status: 'closed',
      close_action: 'closed',
    });

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycle('20260420-999-test-task')?.status).toBe('closed');
      expect(store.listReviews('20260420-999-test-task')).toHaveLength(1);
    } finally {
      store.db.close();
    }
  });

  it('rejects invalid findings through the command wrapper without mutation', async () => {
    await claimTaskService({ taskNumber: '999', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '999', reason: 'completed', cwd: tempDir });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'accepted',
      findings: JSON.stringify([{ severity: 'invalid', description: 'bad' }]),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('severity');
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8')).toContain('status: in_review');
  });

  it('routes accepted reviews with rejected evidence admission into evidence repair continuation', async () => {
    await claimTaskService({ taskNumber: '1000', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '1000', reason: 'completed', cwd: tempDir });

    const review = await taskReviewCommand({
      taskNumber: '1000',
      agent: 'reviewer',
      verdict: 'accepted_with_notes',
      findings: JSON.stringify([{ severity: 'minor', description: 'Add durable verification evidence.' }]),
      cwd: tempDir,
      format: 'json',
    });

    expect(review.exitCode).toBe(ExitCode.SUCCESS);
    expect(review.result).toMatchObject({
      status: 'success',
      verdict: 'accepted_with_notes',
      review_verdict_status: 'accepted',
      new_status: 'needs_continuation',
      close_action: 'skipped',
      evidence_blocked: true,
    });

    let store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycle('20260420-1000-evidence-repair-task')?.status).toBe('needs_continuation');
      expect(store.getLatestEvidenceAdmissionResult('20260420-1000-evidence-repair-task')?.verdict).toBe('rejected');
    } finally {
      store.db.close();
    }

    const continued = await continueTaskService({
      taskNumber: '1000',
      agent: 'worker',
      reason: 'evidence_repair',
      cwd: tempDir,
    });
    expect(continued.exitCode).toBe(ExitCode.SUCCESS);
    expect(continued.result).toMatchObject({
      status: 'success',
      task_status: 'claimed',
    });
    expect((continued.result as { previous_agent_id?: string }).previous_agent_id).toBeUndefined();

    const taskPath = join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1000-evidence-repair-task.md');
    writeFileSync(
      taskPath,
      readFileSync(taskPath, 'utf8') + '\n## Verification\nFocused evidence repair test passed.\n',
    );
    await releaseTaskService({ taskNumber: '1000', reason: 'completed', cwd: tempDir });

    const admitted = await taskEvidenceAdmitCommand({
      taskNumber: '1000',
      by: 'worker',
      cwd: tempDir,
      format: 'json',
    });
    expect(admitted.exitCode).toBe(ExitCode.SUCCESS);

    const closed = await taskCloseCommand({
      taskNumber: '1000',
      by: 'worker',
      cwd: tempDir,
      format: 'json',
    });
    expect(closed.exitCode).toBe(ExitCode.SUCCESS);
    expect(closed.result).toMatchObject({
      status: 'success',
      new_status: 'closed',
    });

    store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycle('20260420-1000-evidence-repair-task')?.status).toBe('closed');
    } finally {
      store.db.close();
    }
  });
});
