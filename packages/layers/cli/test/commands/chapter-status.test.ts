import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { chapterStatusCommand } from '../../src/commands/chapter-status.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'decisions'), { recursive: true });
}

function writeTask(tempDir: string, filename: string, frontMatter: string, title: string, extraBody = '') {
  writeFileSync(
    join(tempDir, '.ai', 'tasks', filename),
    `---\n${frontMatter}---\n\n# ${title}\n${extraBody}`,
  );
}

describe('chapter status operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-chapter-status-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('derives proposed when no tasks in range', async () => {
    const result = await chapterStatusCommand({ range: '100-102', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { state: string; tasks_found: number };
    expect(r.state).toBe('proposed');
    expect(r.tasks_found).toBe(0);
  });

  it('derives shaped when all tasks exist', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: opened\n', 'Task 101 — B');
    writeTask(tempDir, '20260420-102-c.md', 'task_id: 102\nstatus: opened\n', 'Task 102 — C');

    const result = await chapterStatusCommand({ range: '100-102', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { state: string; tasks_found: number };
    expect(r.state).toBe('shaped');
    expect(r.tasks_found).toBe(3);
  });

  it('derives executing when at least one task is claimed', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: claimed\n', 'Task 101 — B');
    writeTask(tempDir, '20260420-102-c.md', 'task_id: 102\nstatus: opened\n', 'Task 102 — C');

    const result = await chapterStatusCommand({ range: '100-102', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { state: string };
    expect(r.state).toBe('executing');
  });

  it('derives review_ready when all tasks are terminal', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: closed\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: confirmed\n', 'Task 101 — B');
    writeTask(tempDir, '20260420-102-c.md', 'task_id: 102\nstatus: closed\n', 'Task 102 — C');

    const result = await chapterStatusCommand({ range: '100-102', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { state: string; blockers: unknown[] };
    expect(r.state).toBe('review_ready');
    expect(r.blockers).toHaveLength(0);
  });

  it('derives closing when closure draft exists', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: closed\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: confirmed\n', 'Task 101 — B');
    writeFileSync(
      join(tempDir, '.ai', 'decisions', '20260422-100-101-chapter-closure-draft.md'),
      '---\nstatus: draft\n---\n\n# Closure Draft\n',
    );

    const result = await chapterStatusCommand({ range: '100-101', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { state: string; closure_draft_exists: boolean };
    expect(r.state).toBe('closing');
    expect(r.closure_draft_exists).toBe(true);
  });

  it('derives closed when closure decision accepted', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: confirmed\n', 'Task 100 — A');
    writeFileSync(
      join(tempDir, '.ai', 'decisions', '20260422-100-100-chapter-closure.md'),
      '---\nstatus: accepted\n---\n\n# Closure Decision\n',
    );

    const result = await chapterStatusCommand({ range: '100', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { state: string; closure_decision_exists: boolean };
    expect(r.state).toBe('closed');
    expect(r.closure_decision_exists).toBe(true);
  });

  it('derives committed when closure decision is 24h old', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: confirmed\n', 'Task 100 — A');
    const decisionPath = join(tempDir, '.ai', 'decisions', '20260422-100-100-chapter-closure.md');
    writeFileSync(decisionPath, '---\nstatus: accepted\n---\n\n# Closure Decision\n');

    // Set mtime to 25 hours ago
    const fs = await import('node:fs');
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(decisionPath, oldTime, oldTime);

    const result = await chapterStatusCommand({ range: '100', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { state: string; closure_decision_age_hours: number };
    expect(r.state).toBe('committed');
    expect(r.closure_decision_age_hours).toBeGreaterThanOrEqual(24);
  });

  it('reports blockers for non-terminal tasks', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: closed\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: claimed\n', 'Task 101 — B');

    const result = await chapterStatusCommand({ range: '100-101', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { state: string; blockers: Array<{ task_number: number; status: string }> };
    expect(r.state).toBe('executing');
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0].task_number).toBe(101);
    expect(r.blockers[0].status).toBe('claimed');
  });

  it('warns when tasks are missing from range', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — A');
    // Missing 101 and 102

    const result = await chapterStatusCommand({ range: '100-102', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { warnings: string[]; tasks_found: number };
    expect(r.tasks_found).toBe(1);
    expect(r.warnings.some((w) => w.includes('Expected 3 tasks'))).toBe(true);
  });

  it('returns error for invalid range', async () => {
    const result = await chapterStatusCommand({ range: 'abc', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { error: string };
    expect(r.error).toContain('Invalid range format');
  });

  it('does not mutate task files', async () => {
    const path = join(tempDir, '.ai', 'tasks', '20260420-100-a.md');
    writeFileSync(path, '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n');
    const before = require('node:fs').readFileSync(path, 'utf8');

    await chapterStatusCommand({ range: '100', cwd: tempDir, format: 'json' });

    const after = require('node:fs').readFileSync(path, 'utf8');
    expect(after).toBe(before);
  });

  it('handles single-number range', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: confirmed\n', 'Task 100 — A');

    const result = await chapterStatusCommand({ range: '100', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { range: string; state: string };
    expect(r.range).toBe('100-100');
    expect(r.state).toBe('review_ready');
  });

  it('derives executing when a task is in_progress', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: in_progress\n', 'Task 101 — B');

    const result = await chapterStatusCommand({ range: '100-101', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { state: string };
    expect(r.state).toBe('executing');
  });

  it('derives review_ready when tasks are accepted', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: accepted\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: accepted\n', 'Task 101 — B');

    const result = await chapterStatusCommand({ range: '100-101', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { state: string; blockers: unknown[] };
    expect(r.state).toBe('review_ready');
    expect(r.blockers).toHaveLength(0);
  });

  it('derives review_ready when tasks are deferred', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: deferred\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: confirmed\n', 'Task 101 — B');

    const result = await chapterStatusCommand({ range: '100-101', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { state: string; blockers: unknown[] };
    expect(r.state).toBe('review_ready');
    expect(r.blockers).toHaveLength(0);
  });
});
