import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimTaskService } from '@narada2/task-governance-core/task-assignment-lifecycle-service';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { taskDeferCommand } from '../../src/commands/task-defer.js';
import { taskListCommand } from '../../src/commands/task-list.js';
import { taskReadCommand } from '../../src/commands/task-read.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

process.env.NARADA_TASK_LIFECYCLE_FAST_SQLITE = '1';

function setupRepo(tempDir: string): void {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 2,
      schema: 'https://narada.dev/schemas/agent-roster/v2',
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'builder', role: 'implementer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z', status: 'idle', task: null, last_done: null, updated_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
    '---\ntask_id: 20260420-999-test-task\nstatus: opened\n---\n\n# Task 999: Test Task\n\n## Acceptance Criteria\n\n- [ ] External access is available.\n',
  );
}

describe('task defer command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-defer-command-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('moves a claimed task to deferred with unblock evidence and releases active ownership', async () => {
    await claimTaskService({ taskNumber: '999', agent: 'builder', cwd: tempDir });

    const result = await taskDeferCommand({
      taskNumber: '999',
      agent: 'builder',
      reason: 'Graph credentials are not available in this locus',
      unblock: 'Bind a real Graph source and rerun connectivity check',
      residuals: '["Needs external credential"]',
      cwd: tempDir,
      format: 'json',
    });

    expect(result).toMatchObject({ exitCode: ExitCode.SUCCESS });
    expect(result.result).toMatchObject({
      status: 'success',
      new_status: 'deferred',
      unblock_condition: 'Bind a real Graph source and rerun connectivity check',
    });

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(content).toContain('status: deferred');
    expect(content).toContain('defer_reason: Graph credentials are not available in this locus');
    expect(content).toContain('unblock_condition: Bind a real Graph source and rerun connectivity check');

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycleByNumber(999)?.status).toBe('deferred');
      expect(store.getActiveAssignment('20260420-999-test-task')).toBeUndefined();
      expect(store.listReportRecords('20260420-999-test-task')).toHaveLength(1);
    } finally {
      store.db.close();
    }

    const read = await taskReadCommand({ taskNumber: '999', cwd: tempDir, format: 'json' });
    expect((read.result as { task: { status: string; assignment: unknown } }).task.status).toBe('deferred');
    expect((read.result as { task: { assignment: unknown } }).task.assignment).toBeNull();

    const list = await taskListCommand({ cwd: tempDir, format: 'json' });
    expect((list.result as { tasks: unknown[] }).tasks).toEqual([]);
  });

  it('rejects deferral without an unblock condition', async () => {
    await claimTaskService({ taskNumber: '999', agent: 'builder', cwd: tempDir });

    const result = await taskDeferCommand({
      taskNumber: '999',
      agent: 'builder',
      reason: 'blocked',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: '--unblock is required',
    });
  });
});
