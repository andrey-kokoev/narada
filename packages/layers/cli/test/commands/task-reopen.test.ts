import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskReopenCommand } from '../../src/commands/task-reopen.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
}

describe('task reopen operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-reopen-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reopens a raw-closed task with governance violations', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'),
      `---\ntask_id: 100\nstatus: closed\n---\n\n# Task 100: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    const result = await taskReopenCommand({
      taskNumber: '100',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; previous_status: string; new_status: string; violations_cleared: string[] };
    expect(r.status).toBe('success');
    expect(r.previous_status).toBe('closed');
    expect(r.new_status).toBe('opened');
    expect(r.violations_cleared).toContain('terminal_without_governed_provenance');

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'), 'utf8');
    expect(content).toContain('status: opened');
    expect(content).toContain('reopened_by: operator-1');
    expect(content).toContain('reopened_at:');
    expect(content).not.toContain('governed_by:');
  });

  it('refuses to reopen a valid terminal task without --force', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-101-test.md'),
      `---\ntask_id: 101\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 101: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    const result = await taskReopenCommand({
      taskNumber: '101',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; error: string };
    expect(r.status).toBe('error');
    expect(r.error).toContain('Use --force');
  });

  it('reopens a valid terminal task with --force', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-102-test.md'),
      `---\ntask_id: 102\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 102: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    const result = await taskReopenCommand({
      taskNumber: '102',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
      force: true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; previous_status: string; new_status: string };
    expect(r.status).toBe('success');
    expect(r.previous_status).toBe('closed');
    expect(r.new_status).toBe('opened');
  });

  it('returns to in_review when the task has a review record', async () => {
    mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-103-test.md'),
      `---\ntask_id: 103\nstatus: closed\n---\n\n# Task 103: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );
    writeFileSync(
      join(tempDir, '.ai', 'reviews', 'review-20260420-103-test-1234567890.json'),
      JSON.stringify({
        review_id: 'review-20260420-103-test-1234567890',
        reviewer_agent_id: 'reviewer',
        task_id: '20260420-103-test',
        findings: [],
        verdict: 'accepted',
        reviewed_at: '2026-01-01T00:00:00Z',
      }, null, 2),
    );

    const result = await taskReopenCommand({
      taskNumber: '103',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
      force: true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; new_status: string };
    expect(r.status).toBe('success');
    expect(r.new_status).toBe('in_review');
  });

  it('fails when task is not terminal', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-104-test.md'),
      `---\ntask_id: 104\nstatus: opened\n---\n\n# Task 104: Test\n`,
    );

    const result = await taskReopenCommand({
      taskNumber: '104',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; error: string };
    expect(r.status).toBe('error');
    expect(r.error).toContain('not terminal');
  });

  it('fails when task file is missing', async () => {
    const result = await taskReopenCommand({
      taskNumber: '999',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    const r = result.result as { status: string; error: string };
    expect(r.status).toBe('error');
    expect(r.error).toContain('not found');
  });

  it('stale closed_by/closed_at after reopen does not count as valid provenance', async () => {
    // Create a pre-501-style closed task (closed_by + closed_at, no governed_by)
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-105-test.md'),
      `---\ntask_id: 105\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 105: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    // Reopen it (force because it's valid by pre-501 compatibility)
    const reopenResult = await taskReopenCommand({
      taskNumber: '105',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
      force: true,
    });
    expect(reopenResult.exitCode).toBe(ExitCode.SUCCESS);

    // Now simulate a raw bypass: someone edits the file back to closed
    // WITHOUT governed_by, but the old closed_by/closed_at are still there
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-105-test.md'),
      `---\ntask_id: 105\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\nreopened_at: 2026-04-23T00:00:00Z\nreopened_by: operator-1\n---\n\n# Task 105: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    // Evidence inspection should detect the bypass because reopened_at > closed_at
    const { inspectTaskEvidence } = await import('../../src/lib/task-governance.js');
    const evidence = await inspectTaskEvidence(tempDir, '105');
    expect(evidence.has_governed_provenance).toBe(false);
    expect(evidence.violations).toContain('terminal_without_governed_provenance');
  });
});
