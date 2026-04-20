import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { taskReleaseCommand } from '../../src/commands/task-release.js';
import { taskReviewCommand } from '../../src/commands/task-review.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'test-agent', role: 'implementer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'reviewer', role: 'reviewer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );

  writeFileSync(
    join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Test Task\n',
  );
}

describe('task review operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-review-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('accepts a completed task', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '999', reason: 'completed', cwd: tempDir, format: 'json' });

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
    });

    const taskContent = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: closed');
  });

  it('rejects a completed task', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '999', reason: 'completed', cwd: tempDir, format: 'json' });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'rejected',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      verdict: 'rejected',
      new_status: 'opened',
    });

    const taskContent = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: opened');
  });

  it('fails when task is not in_review', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('cannot be reviewed');
  });

  it('fails with invalid verdict', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '999', reason: 'completed', cwd: tempDir, format: 'json' });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'invalid' as 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('verdict must be one of');
  });

  it('fails when agent is not reviewer or admin', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '999', reason: 'completed', cwd: tempDir, format: 'json' });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'test-agent',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('only');
    expect((result.result as { error: string }).error).toContain('reviewer');
  });

  it('rejects invalid findings shape', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '999', reason: 'completed', cwd: tempDir, format: 'json' });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'accepted',
      findings: JSON.stringify([{ severity: 'invalid', description: 'foo' }]),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('severity');
  });

  it('rejects findings missing description', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '999', reason: 'completed', cwd: tempDir, format: 'json' });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'accepted',
      findings: JSON.stringify([{ severity: 'major' }]),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('description');
  });

  it('rejects non-array findings', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '999', reason: 'completed', cwd: tempDir, format: 'json' });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'accepted',
      findings: JSON.stringify({ severity: 'major', description: 'foo' }),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('array');
  });

  it('stores review record', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '999', reason: 'completed', cwd: tempDir, format: 'json' });

    const findings = JSON.stringify([{ severity: 'minor', description: 'Nit', location: 'line 5' }]);
    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'accepted_with_notes',
      findings,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const reviewId = (result.result as { review_id: string }).review_id;
    const reviewRaw = readFileSync(join(tempDir, '.ai', 'reviews', `${reviewId}.json`), 'utf8');
    const review = JSON.parse(reviewRaw);
    expect(review.reviewer_agent_id).toBe('reviewer');
    expect(review.verdict).toBe('accepted_with_notes');
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].severity).toBe('minor');
  });
});
