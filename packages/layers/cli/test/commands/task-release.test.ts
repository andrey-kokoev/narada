import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimTaskService } from '@narada2/task-governance-core/task-assignment-lifecycle-service';
import { loadAssignment } from '../../src/lib/task-governance.js';
import { taskReleaseCommand } from '../../src/commands/task-release.js';
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
        { agent_id: 'test-agent', role: 'implementer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Test Task\n',
  );
}

describe('task release command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-release-command-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('delegates a completed release and writes mutation evidence', async () => {
    await claimTaskService({ taskNumber: '999', agent: 'test-agent', cwd: tempDir });

    const result = await taskReleaseCommand({
      taskNumber: '999',
      reason: 'completed',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      release_reason: 'completed',
      new_status: 'in_review',
    });
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8')).toContain('status: in_review');
  });

  it('preserves failure atomicity through the command wrapper', async () => {
    await claimTaskService({ taskNumber: '999', agent: 'test-agent', cwd: tempDir });

    const result = await taskReleaseCommand({
      taskNumber: '999',
      reason: 'budget_exhausted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('--continuation');
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8')).toContain('status: claimed');

    const assignment = await loadAssignment(tempDir, '20260420-999-test-task');
    expect(assignment?.assignments.find((item) => item.released_at === null)).toBeDefined();
  });
});
