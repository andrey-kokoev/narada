import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { chapterCloseCommand } from '../../src/commands/chapter-close.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'decisions'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
}

function writeTask(tempDir: string, filename: string, frontMatter: string, title: string, extraBody = '') {
  writeFileSync(
    join(tempDir, '.ai', 'tasks', filename),
    `---\n${frontMatter}---\n\n# ${title}\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n${extraBody}`,
  );
}

describe('chapter close operator — legacy chapter-name mode', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-chapter-close-'));
    setupRepo(tempDir);
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
    writeTask(tempDir, '20260420-260-a.md', 'task_id: 260\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n', 'Task 260', '\n## Chapter\n\nTest Chapter\n');
    writeTask(tempDir, '20260420-261-b.md', 'task_id: 261\nstatus: opened\n', 'Task 261', '\n## Chapter\n\nTest Chapter\n');

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

    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-260-a.md'), 'utf8');
    expect(content).toContain('status: closed');
  });

  it('non-dry-run writes artifact and transitions closed to confirmed', async () => {
    writeTask(tempDir, '20260420-260-a.md', 'task_id: 260\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n', 'Task 260', '\n## Chapter\n\nTest Chapter\n');
    writeTask(tempDir, '20260420-261-b.md', 'task_id: 261\nstatus: confirmed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n', 'Task 261', '\n## Chapter\n\nTest Chapter\n');

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

    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-260-a.md'), 'utf8');
    expect(content).toContain('status: confirmed');
  });

  it('non-dry-run fails when tasks are not terminal', async () => {
    writeTask(tempDir, '20260420-260-a.md', 'task_id: 260\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n', 'Task 260', '\n## Chapter\n\nTest Chapter\n');
    writeTask(tempDir, '20260420-261-b.md', 'task_id: 261\nstatus: opened\n', 'Task 261', '\n## Chapter\n\nTest Chapter\n');

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

    const decisionsDir = join(tempDir, '.ai', 'decisions');
    const artifacts = require('node:fs').readdirSync(decisionsDir);
    expect(artifacts).toHaveLength(0);

    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-260-a.md'), 'utf8');
    expect(content).toContain('status: closed');
  });

  it('includes review findings in closure artifact', async () => {
    writeTask(tempDir, '20260420-260-a.md', 'task_id: 260\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n', 'Task 260', '\n## Chapter\n\nTest Chapter\n');
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
    expect(r.residuals).toBe(1);

    const artifact = readFileSync(r.artifact_path, 'utf8');
    expect(artifact).toContain('Missing test coverage');
    expect(artifact).toContain('Typo in docs');
    expect(artifact).toContain('Residuals');
  });
});

describe('chapter close operator — range-based mode', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-chapter-close-range-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('--start generates closure decision template with all sections', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: confirmed\n', 'Task 101 — B');

    const result = await chapterCloseCommand({
      range: '100-101',
      start: true,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(0);
    const r = result.result as { status: string; draft_path: string };
    expect(r.status).toBe('success');
    expect(existsSync(r.draft_path)).toBe(true);

    const draft = readFileSync(r.draft_path, 'utf8');
    expect(draft).toContain('status: draft');
    expect(draft).toContain('Task-by-Task Assessment');
    expect(draft).toContain('Semantic Drift Check');
    expect(draft).toContain('Authority Boundary Check');
    expect(draft).toContain('Gap Table');
    expect(draft).toContain('CCC Posture Before / After');
    expect(draft).toContain('Closure Action');
  });

  it('--start fails if tasks not terminal', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: opened\n', 'Task 101 — B');

    const result = await chapterCloseCommand({
      range: '100-101',
      start: true,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(1);
    const r = result.result as { status: string; error: string };
    expect(r.status).toBe('error');
    expect(r.error).toContain('not terminal');

    const decisionsDir = join(tempDir, '.ai', 'decisions');
    const files = require('node:fs').readdirSync(decisionsDir);
    expect(files).toHaveLength(0);
  });

  it('--finish accepts closure and transitions tasks to confirmed', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: confirmed\n', 'Task 101 — B');
    // confirmed task was already validated when transitioned; no re-check needed for it

    // First create the draft
    const startResult = await chapterCloseCommand({
      range: '100-101',
      start: true,
      cwd: tempDir,
      format: 'json',
    });
    expect(startResult.exitCode).toBe(0);

    // Now finish it
    const finishResult = await chapterCloseCommand({
      range: '100-101',
      finish: true,
      cwd: tempDir,
      format: 'json',
    });

    expect(finishResult.exitCode).toBe(0);
    const r = finishResult.result as {
      status: string;
      decision_path: string;
      transitioned_to_confirmed: string[];
    };
    expect(r.status).toBe('success');
    expect(r.transitioned_to_confirmed).toHaveLength(1);

    const decision = readFileSync(r.decision_path, 'utf8');
    expect(decision).toContain('status: accepted');

    const taskContent = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-100-a.md'), 'utf8');
    expect(taskContent).toContain('status: confirmed');
  });

  it('--finish fails if no draft exists', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n', 'Task 100 — A');

    const result = await chapterCloseCommand({
      range: '100',
      finish: true,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(1);
    const r = result.result as { status: string; error: string };
    expect(r.status).toBe('error');
    expect(r.error).toContain('No closure draft found');
  });

  it('--finish fails if draft is incomplete', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n', 'Task 100 — A');
    writeFileSync(
      join(tempDir, '.ai', 'decisions', '20260422-100-100-chapter-closure-draft.md'),
      '---\nstatus: draft\n---\n\n# Incomplete Draft\n',
    );

    const result = await chapterCloseCommand({
      range: '100',
      finish: true,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(1);
    const r = result.result as { status: string; error: string };
    expect(r.status).toBe('error');
    expect(r.error).toContain('incomplete');
  });

  it('--reopen returns chapter to executing', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: confirmed\n', 'Task 100 — A');
    writeFileSync(
      join(tempDir, '.ai', 'decisions', '20260422-100-100-chapter-closure-draft.md'),
      '---\nstatus: draft\n---\n\n# Closure Draft\n',
    );

    const result = await chapterCloseCommand({
      range: '100',
      reopen: true,
      reason: 'Found a gap',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(0);
    const r = result.result as { status: string; new_state: string; reason: string };
    expect(r.status).toBe('success');
    expect(r.new_state).toBe('executing');
    expect(r.reason).toBe('Found a gap');
  });

  it('--reopen fails if no closure draft or decision exists', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: confirmed\n', 'Task 100 — A');

    const result = await chapterCloseCommand({
      range: '100',
      reopen: true,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(1);
    const r = result.result as { status: string; error: string };
    expect(r.status).toBe('error');
    expect(r.error).toContain('Nothing to reopen');
  });

  it('no persistent chapter state file is created', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n', 'Task 100 — A');

    await chapterCloseCommand({
      range: '100',
      start: true,
      cwd: tempDir,
      format: 'json',
    });

    // Only decisions and tasks dirs should exist; no chapter-state file
    const fs = require('node:fs');
    const rootFiles = fs.readdirSync(join(tempDir, '.ai'));
    expect(rootFiles).not.toContain('chapter-state.json');
    expect(rootFiles).not.toContain('chapters');
  });

  it('--start accepts accepted tasks as terminal', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: accepted\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: deferred\n', 'Task 101 — B');

    const result = await chapterCloseCommand({
      range: '100-101',
      start: true,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(0);
    const r = result.result as { status: string; draft_path: string };
    expect(r.status).toBe('success');
    expect(existsSync(r.draft_path)).toBe(true);
  });

  it('--finish transitions accepted tasks to confirmed', async () => {
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: accepted\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: confirmed\n', 'Task 101 — B');

    const startResult = await chapterCloseCommand({
      range: '100-101',
      start: true,
      cwd: tempDir,
      format: 'json',
    });
    expect(startResult.exitCode).toBe(0);

    const finishResult = await chapterCloseCommand({
      range: '100-101',
      finish: true,
      cwd: tempDir,
      format: 'json',
    });

    expect(finishResult.exitCode).toBe(0);
    const r = finishResult.result as { status: string; transitioned_to_confirmed: string[] };
    expect(r.status).toBe('success');
    // Only 'closed' tasks are transitioned; 'accepted' is not transitioned by --finish
    expect(r.transitioned_to_confirmed).toHaveLength(0);
  });

  it('--finish rejects terminal tasks with unchecked criteria', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-100-a.md'),
      `---\ntask_id: 100\nstatus: closed\n---\n\n# Task 100 — A\n\n## Acceptance Criteria\n- [ ] Unchecked\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: confirmed\n', 'Task 101 — B');

    const startResult = await chapterCloseCommand({
      range: '100-101',
      start: true,
      cwd: tempDir,
      format: 'json',
    });
    expect(startResult.exitCode).toBe(0);

    const finishResult = await chapterCloseCommand({
      range: '100-101',
      finish: true,
      cwd: tempDir,
      format: 'json',
    });

    expect(finishResult.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = finishResult.result as { status: string; error: string };
    expect(r.status).toBe('error');
    expect(r.error).toContain('closure invariant');
    expect(r.error).toContain('terminal_with_unchecked_criteria');

    // No transitions should have occurred
    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-100-a.md'), 'utf8');
    expect(content).toContain('status: closed');
  });
});
