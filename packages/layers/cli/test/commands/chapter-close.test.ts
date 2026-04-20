import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { chapterCloseCommand } from '../../src/commands/chapter-close.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('chapter close operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-chapter-close-'));
    mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'decisions'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('errors when chapter has no tasks', async () => {
    const result = await chapterCloseCommand({
      chapterName: 'Nonexistent Chapter',
      dryRun: true,
      cwd: tempDir,
      format: 'json',
    });
    expect(result.exitCode).toBe(1);
    expect((result.result as { error: string }).error).toContain('No tasks found');
  });

  it('dry-run reports task statuses without mutating', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-260-a.md'),
      '---\ntask_id: 260\nstatus: closed\n---\n\n# Task 260\n\n## Chapter\n\nTest Chapter\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-261-b.md'),
      '---\ntask_id: 261\nstatus: opened\n---\n\n# Task 261\n\n## Chapter\n\nTest Chapter\n',
    );

    const result = await chapterCloseCommand({
      chapterName: 'Test Chapter',
      dryRun: true,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(0);
    const r = result.result as {
      status: string;
      tasks: number;
      non_terminal: string[];
      completed: string[];
    };
    expect(r.status).toBe('dry_run');
    expect(r.tasks).toBe(2);
    expect(r.non_terminal).toHaveLength(1);
    expect(r.completed).toHaveLength(1);

    // Task file should NOT be mutated
    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-260-a.md'), 'utf8');
    expect(content).toContain('status: closed');
  });

  it('non-dry-run writes artifact and transitions closed to confirmed', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-260-a.md'),
      '---\ntask_id: 260\nstatus: closed\n---\n\n# Task 260\n\n## Chapter\n\nTest Chapter\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-261-b.md'),
      '---\ntask_id: 261\nstatus: confirmed\n---\n\n# Task 261\n\n## Chapter\n\nTest Chapter\n',
    );

    const result = await chapterCloseCommand({
      chapterName: 'Test Chapter',
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(0);
    const r = result.result as {
      status: string;
      artifact_path: string;
      transitioned_to_confirmed: string[];
    };
    expect(r.status).toBe('success');
    expect(r.transitioned_to_confirmed).toHaveLength(1);
    expect(existsSync(r.artifact_path)).toBe(true);

    // Task should now be confirmed
    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-260-a.md'), 'utf8');
    expect(content).toContain('status: confirmed');
  });

  it('non-dry-run fails when tasks are not terminal', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-260-a.md'),
      '---\ntask_id: 260\nstatus: closed\n---\n\n# Task 260\n\n## Chapter\n\nTest Chapter\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-261-b.md'),
      '---\ntask_id: 261\nstatus: opened\n---\n\n# Task 261\n\n## Chapter\n\nTest Chapter\n',
    );

    const result = await chapterCloseCommand({
      chapterName: 'Test Chapter',
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(1);
    const r = result.result as { status: string; error: string };
    expect(r.status).toBe('error');
    expect(r.error).toContain('Cannot close chapter');
    expect(r.error).toContain('20260420-261-b');

    // No artifact should be written
    const decisionsDir = join(tempDir, '.ai', 'decisions');
    const artifacts = require('node:fs').readdirSync(decisionsDir);
    expect(artifacts).toHaveLength(0);

    // Task status should NOT be transitioned
    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-260-a.md'), 'utf8');
    expect(content).toContain('status: closed');
  });

  it('includes review findings in closure artifact', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-260-a.md'),
      '---\ntask_id: 260\nstatus: closed\n---\n\n# Task 260\n\n## Chapter\n\nTest Chapter\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'reviews', 'review-20260420-260-a-123.json'),
      JSON.stringify({
        review_id: 'review-20260420-260-a-123',
        reviewer_agent_id: 'reviewer-1',
        task_id: '20260420-260-a',
        findings: [
          { severity: 'major', description: 'Missing test coverage', recommended_action: 'defer' },
          { severity: 'minor', description: 'Typo in docs', recommended_action: 'fix' },
        ],
        verdict: 'accepted_with_notes',
        reviewed_at: '2026-04-20T00:00:00Z',
      }),
    );

    const result = await chapterCloseCommand({
      chapterName: 'Test Chapter',
      dryRun: false,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(0);
    const r = result.result as { artifact_path: string; residuals: number };
    expect(r.residuals).toBe(1); // One deferred finding

    const artifact = readFileSync(r.artifact_path, 'utf8');
    expect(artifact).toContain('Missing test coverage');
    expect(artifact).toContain('Typo in docs');
    expect(artifact).toContain('Residuals');
  });
});
