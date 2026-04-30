import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTaskLifecycleStore, type TaskStatus } from '../../src/lib/task-lifecycle-store.js';
import { taskUnblockCommand } from '../../src/commands/task-unblock.js';
import { taskWorkboardCommand } from '../../src/commands/task-workboard.js';
import { taskContinueCommand } from '../../src/commands/task-continue.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

process.env.NARADA_TASK_LIFECYCLE_FAST_SQLITE = '1';

function setupRepo(tempDir: string, status: TaskStatus = 'deferred'): void {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 2,
      schema: 'https://narada.dev/schemas/agent-roster/v2',
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'builder', role: 'builder', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z', status: 'idle', task: null, last_done: null, updated_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
    `---\ntask_id: 20260420-999-test-task\nstatus: ${status}\ndefer_reason: Waiting on external account\nunblock_condition: Account authorized\n---\n\n# Task 999: Test Task\n\n## Acceptance Criteria\n\n- [ ] External access is available.\n`,
  );

  const store = openTaskLifecycleStore(tempDir);
  try {
    store.upsertRosterEntry({
      agent_id: 'builder',
      role: 'builder',
      capabilities_json: JSON.stringify(['claim']),
      first_seen_at: '2026-01-01T00:00:00Z',
      last_active_at: '2026-01-01T00:00:00Z',
      status: 'idle',
      task_number: null,
      last_done: null,
      updated_at: '2026-01-01T00:00:00Z',
    });
    store.upsertLifecycle({
      task_id: '20260420-999-test-task',
      task_number: 999,
      status,
      governed_by: null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: '2026-01-01T00:00:00Z',
    });
    store.upsertTaskSpec({
      task_id: '20260420-999-test-task',
      task_number: 999,
      title: 'Test Task',
      chapter_markdown: null,
      goal_markdown: null,
      context_markdown: null,
      required_work_markdown: null,
      non_goals_markdown: null,
      acceptance_criteria_json: JSON.stringify(['External access is available.']),
      dependencies_json: JSON.stringify([]),
      updated_at: '2026-01-01T00:00:00Z',
    });
  } finally {
    store.db.close();
  }
}

describe('task unblock command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-unblock-command-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects deferred resumption without evidence and rationale', async () => {
    setupRepo(tempDir);

    const withoutEvidence = await taskUnblockCommand({
      taskNumber: '999',
      agent: 'builder',
      rationale: 'blocker cleared',
      cwd: tempDir,
      format: 'json',
    });
    expect(withoutEvidence.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(withoutEvidence.result).toMatchObject({ status: 'error', error: '--evidence is required' });

    const withoutRationale = await taskUnblockCommand({
      taskNumber: '999',
      agent: 'builder',
      evidence: 'OAuth account can be reached',
      cwd: tempDir,
      format: 'json',
    });
    expect(withoutRationale.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(withoutRationale.result).toMatchObject({ status: 'error', error: '--rationale is required' });
  });

  it('moves a deferred task back to opened with governed unblock evidence', async () => {
    setupRepo(tempDir);

    const result = await taskUnblockCommand({
      taskNumber: '999',
      agent: 'builder',
      evidence: 'OAuth account can be reached',
      rationale: 'The external blocker named in unblock_condition is now satisfied',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      previous_status: 'deferred',
      new_status: 'opened',
      evidence: 'OAuth account can be reached',
    });

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(content).toContain('status: opened');
    expect(content).toContain('unblock_evidence: OAuth account can be reached');
    expect(content).toContain('unblock_rationale: The external blocker named in unblock_condition is now satisfied');

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycleByNumber(999)?.status).toBe('opened');
      expect(store.getLifecycleByNumber(999)?.continuation_packet_json).toContain('task_unblock');
    } finally {
      store.db.close();
    }

    const evidenceFiles = readdirSync(join(tempDir, '.ai', 'mutation-evidence', 'task_lifecycle'));
    expect(evidenceFiles).toHaveLength(1);
    const evidenceRecord = JSON.parse(
      readFileSync(join(tempDir, '.ai', 'mutation-evidence', 'task_lifecycle', evidenceFiles[0]!), 'utf8'),
    ) as { command: string; subject: { number: number } };
    expect(evidenceRecord.command).toBe('task unblock');
    expect(evidenceRecord.subject.number).toBe(999);
  });

  it('makes an unblocked task visible as local followup work', async () => {
    setupRepo(tempDir);

    await taskUnblockCommand({
      taskNumber: '999',
      agent: 'builder',
      evidence: 'OAuth account can be reached',
      rationale: 'The task can now re-enter normal claim flow',
      cwd: tempDir,
      format: 'json',
    });

    const workboard = await taskWorkboardCommand({ cwd: tempDir, format: 'json' });
    const result = workboard.result as { local_followups: Array<{ task_number: number; status: string }> };
    expect(result.local_followups).toContainEqual(expect.objectContaining({
      task_number: 999,
      status: 'opened',
    }));
  });

  it('rejects unblocking tasks that are not deferred', async () => {
    setupRepo(tempDir, 'opened');

    const result = await taskUnblockCommand({
      taskNumber: '999',
      agent: 'builder',
      evidence: 'irrelevant',
      rationale: 'irrelevant',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: 'Task 20260420-999-test-task is opened; only deferred tasks can be unblocked',
    });
  });

  it('leaves continuation authority to normal claim/continue semantics after unblock', async () => {
    setupRepo(tempDir);

    await taskUnblockCommand({
      taskNumber: '999',
      agent: 'builder',
      evidence: 'OAuth account can be reached',
      rationale: 'The task can now be claimed normally',
      cwd: tempDir,
      format: 'json',
    });

    const continued = await taskContinueCommand({
      taskNumber: '999',
      agent: 'builder',
      reason: 'operator_override',
      cwd: tempDir,
      format: 'json',
    });

    expect(continued.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(continued.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining("Use 'narada task claim'"),
    });
  });
});
