import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskDeriveFromFindingCommand } from '../../src/commands/task-derive-from-finding.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-target.md'),
    '---\ntask_id: 100\nstatus: closed\n---\n\n# Task 100: Target\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'reviews', 'review-100-1.json'),
    JSON.stringify({
      review_id: 'review-100-1',
      reviewer_agent_id: 'reviewer',
      task_id: '20260420-100-target',
      findings: [
        {
          finding_id: 'f-001',
          severity: 'major',
          description: 'Missing edge case test',
          category: 'test',
          recommended_action: 'add_test',
        },
      ],
      verdict: 'rejected',
      reviewed_at: '2026-04-20T00:00:00Z',
    }, null, 2),
  );
}

describe('task derive-from-finding operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-derive-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('derives a corrective task from a finding', async () => {
    const result = await taskDeriveFromFindingCommand({
      findingId: 'f-001',
      review: 'review-100-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      finding_id: 'f-001',
      review_id: 'review-100-1',
      target_task: '20260420-100-target',
    });

    const taskFile = (result.result as { task_file: string }).task_file;
    const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', taskFile), 'utf8');
    expect(taskContent).toContain('status: opened');
    expect(taskContent).toContain('depends_on: [100]');
    expect(taskContent).toContain('Missing edge case test');
    expect(taskContent).toContain('add_test');
  });

  it('fails when finding does not exist', async () => {
    const result = await taskDeriveFromFindingCommand({
      findingId: 'f-999',
      review: 'review-100-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('not found');
  });

  it('fails when review does not exist', async () => {
    const result = await taskDeriveFromFindingCommand({
      findingId: 'f-001',
      review: 'review-missing',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('Review not found');
  });

  it('allocates a new number on second run without collision', async () => {
    const r1 = await taskDeriveFromFindingCommand({
      findingId: 'f-001',
      review: 'review-100-1',
      cwd: tempDir,
      format: 'json',
    });
    expect(r1.exitCode).toBe(ExitCode.SUCCESS);

    const r2 = await taskDeriveFromFindingCommand({
      findingId: 'f-001',
      review: 'review-100-1',
      cwd: tempDir,
      format: 'json',
    });
    // Should succeed but allocate a new number — not a collision
    expect(r2.exitCode).toBe(ExitCode.SUCCESS);
    expect((r2.result as { task_number: number }).task_number).not.toBe(
      (r1.result as { task_number: number }).task_number,
    );
  });

  it('fails when target task has no parseable front matter or number', async () => {
    // Create a target task with no front matter and no number in filename
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', 'untitled-task.md'),
      '# Untitled Task\n\nNo front matter.',
    );

    // Update review to point to this unparseable task
    writeFileSync(
      join(tempDir, '.ai', 'reviews', 'review-bad-target.json'),
      JSON.stringify({
        review_id: 'review-bad-target',
        reviewer_agent_id: 'reviewer',
        task_id: 'untitled-task',
        findings: [
          {
            finding_id: 'f-bad',
            severity: 'major',
            description: 'Something wrong',
            target_task_id: 'untitled-task',
          },
        ],
        verdict: 'rejected',
        reviewed_at: '2026-04-20T00:00:00Z',
      }, null, 2),
    );

    const result = await taskDeriveFromFindingCommand({
      findingId: 'f-bad',
      review: 'review-bad-target',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('Could not resolve target task number');
  });
});
