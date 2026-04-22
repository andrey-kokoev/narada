import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { taskReleaseCommand } from '../../src/commands/task-release.js';
import { taskReportCommand } from '../../src/commands/task-report.js';
import { taskReviewCommand } from '../../src/commands/task-review.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'reports'), { recursive: true });
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
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Test Task\n\n## Execution Notes\nCompleted.\n\n## Verification\nTests passed.\n',
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

  it('accepts report and marks it accepted', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    const reportResult = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Done',
      cwd: tempDir,
      format: 'json',
    });
    const reportId = (reportResult.result as { report_id: string }).report_id;

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'accepted',
      report: reportId,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Review record references report
    const reviewId = (result.result as { review_id: string }).review_id;
    const reviewRaw = readFileSync(join(tempDir, '.ai', 'reviews', `${reviewId}.json`), 'utf8');
    const review = JSON.parse(reviewRaw);
    expect(review.report_id).toBe(reportId);

    // Report status updated to accepted
    const reportFiles = readdirSync(join(tempDir, '.ai', 'tasks', 'reports')).filter((f) => f.endsWith('.json'));
    const reportRaw = readFileSync(join(tempDir, '.ai', 'tasks', 'reports', reportFiles[0]!), 'utf8');
    const report = JSON.parse(reportRaw);
    expect(report.report_status).toBe('accepted');
  });

  it('rejects report and marks it rejected', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    const reportResult = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Done',
      cwd: tempDir,
      format: 'json',
    });
    const reportId = (reportResult.result as { report_id: string }).report_id;

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'rejected',
      report: reportId,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Report status updated to rejected
    const reportFiles = readdirSync(join(tempDir, '.ai', 'tasks', 'reports')).filter((f) => f.endsWith('.json'));
    const reportRaw = readFileSync(join(tempDir, '.ai', 'tasks', 'reports', reportFiles[0]!), 'utf8');
    const report = JSON.parse(reportRaw);
    expect(report.report_status).toBe('rejected');
  });

  it('fails when report belongs to different task', async () => {
    // Create a second task
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-998-other-task.md'),
      '---\ntask_id: 998\nstatus: opened\n---\n\n# Task 998: Other\n',
    );

    await taskClaimCommand({ taskNumber: '998', agent: 'test-agent', cwd: tempDir, format: 'json' });
    const reportResult = await taskReportCommand({
      taskNumber: '998',
      agent: 'test-agent',
      summary: 'Done',
      cwd: tempDir,
      format: 'json',
    });
    const reportId = (reportResult.result as { report_id: string }).report_id;

    // Now try to review task 999 with report from task 998
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '999', reason: 'completed', cwd: tempDir, format: 'json' });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'accepted',
      report: reportId,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('belongs to task');
  });

  it('fails when report does not exist', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '999', reason: 'completed', cwd: tempDir, format: 'json' });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'accepted',
      report: 'wrr_999999999_nonexistent_task_test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('Report not found');
  });

  it('does not close task lacking evidence when verdict is accepted', async () => {
    // Create a task without execution notes or report
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-995-no-evidence.md'),
      '---\ntask_id: 995\nstatus: opened\n---\n\n# Task 995: No Evidence\n\n## Verification\nN/A.\n',
    );

    await taskClaimCommand({ taskNumber: '995', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '995', reason: 'completed', cwd: tempDir, format: 'json' });

    const result = await taskReviewCommand({
      taskNumber: '995',
      agent: 'reviewer',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { new_status: string; evidence_blocked?: boolean; evidence_reason?: string };
    expect(parsed.new_status).toBe('in_review');
    expect(parsed.evidence_blocked).toBe(true);
    expect(parsed.evidence_reason).toContain('lacks execution evidence');

    const taskContent = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-995-no-evidence.md'), 'utf8');
    expect(taskContent).toContain('status: in_review');
  });

  it('does not close task lacking verification when verdict is accepted', async () => {
    // Create a task with execution notes but no verification
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-994-no-verif.md'),
      '---\ntask_id: 994\nstatus: opened\n---\n\n# Task 994: No Verification\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n',
    );

    await taskClaimCommand({ taskNumber: '994', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReleaseCommand({ taskNumber: '994', reason: 'completed', cwd: tempDir, format: 'json' });

    const result = await taskReviewCommand({
      taskNumber: '994',
      agent: 'reviewer',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { new_status: string; evidence_blocked?: boolean; evidence_reason?: string };
    expect(parsed.new_status).toBe('in_review');
    expect(parsed.evidence_blocked).toBe(true);
    expect(parsed.evidence_reason).toContain('verification');

    const taskContent = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-994-no-verif.md'), 'utf8');
    expect(taskContent).toContain('status: in_review');
  });
});
