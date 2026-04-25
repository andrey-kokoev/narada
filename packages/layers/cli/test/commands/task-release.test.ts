import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { taskReleaseCommand } from '../../src/commands/task-release.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { loadAssignment } from '../../src/lib/task-governance.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
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

describe('task release operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-release-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('releases a claimed task as completed', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

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

    const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: in_review');

    const assignment = await loadAssignment(tempDir, '20260420-999-test-task');
    expect(assignment?.assignments[0].release_reason).toBe('completed');
    expect(assignment?.assignments[0].released_at).not.toBeNull();
  });

  it('releases a claimed task as abandoned', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReleaseCommand({
      taskNumber: '999',
      reason: 'abandoned',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      release_reason: 'abandoned',
      new_status: 'opened',
    });

    const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: opened');
  });

  it('fails when task has no assignment record', async () => {
    const result = await taskReleaseCommand({
      taskNumber: '999',
      reason: 'completed',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('no assignment record');
  });

  it('fails when task has no active assignment', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '999', reason: 'completed', cwd: tempDir, format: 'json' });

    const result = await taskReleaseCommand({
      taskNumber: '999',
      reason: 'completed',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('no active assignment');
  });

  it('fails without task number', async () => {
    const result = await taskReleaseCommand({
      reason: 'completed',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('Task number is required');
  });

  it('releases a claimed task as budget_exhausted', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const packetPath = join(tempDir, 'continuation.json');
    writeFileSync(packetPath, JSON.stringify({
      last_completed_step: 'Step 1',
      remaining_work: 'Step 2',
      files_touched: ['src/a.ts'],
      verification_run: 'none',
      known_blockers: 'none',
      resume_recommendation: 'same agent',
    }));

    const result = await taskReleaseCommand({
      taskNumber: '999',
      reason: 'budget_exhausted',
      continuation: packetPath,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      release_reason: 'budget_exhausted',
      new_status: 'needs_continuation',
    });

    const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: needs_continuation');
  });

  it('fails with invalid release reason', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReleaseCommand({
      taskNumber: '999',
      reason: 'invalid_reason' as 'completed',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('budget_exhausted');
  });

  it('fails if task status is not claimed', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    // Corrupt the task file status behind the operator's back
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Test Task\n',
    );

    const result = await taskReleaseCommand({
      taskNumber: '999',
      reason: 'completed',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('consistency error');
  });

  it('fails without reason', async () => {
    const result = await taskReleaseCommand({
      taskNumber: '999',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('--reason must be one of');
  });

  it('requires continuation packet for budget_exhausted', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReleaseCommand({
      taskNumber: '999',
      reason: 'budget_exhausted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('--continuation');

    // Assignment must still be active (failure-atomic)
    const assignment = await loadAssignment(tempDir, '20260420-999-test-task');
    const active = assignment?.assignments.find((a: { released_at: string | null }) => a.released_at === null);
    expect(active).toBeDefined();

    // Task status must still be claimed
    const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: claimed');
  });

  it('accepts continuation packet for budget_exhausted', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const packetPath = join(tempDir, 'continuation.json');
    writeFileSync(packetPath, JSON.stringify({
      last_completed_step: 'Step 3 done',
      remaining_work: 'Step 4 and 5',
      files_touched: ['src/a.ts'],
      verification_run: 'tests pass',
      known_blockers: 'none',
      resume_recommendation: 'same agent',
    }));

    const result = await taskReleaseCommand({
      taskNumber: '999',
      reason: 'budget_exhausted',
      continuation: packetPath,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      new_status: 'needs_continuation',
    });

    const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: needs_continuation');
    expect(taskContent).toContain('continuation_packet');
  });
});
