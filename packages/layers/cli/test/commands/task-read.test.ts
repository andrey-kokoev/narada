import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskReadCommand } from '../../src/commands/task-read.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { Database } from '@narada2/control-plane';
import { SqliteTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { parseFrontMatter } from '../../src/lib/task-governance.js';
import { parseTaskSpecFromMarkdown } from '../../src/lib/task-spec.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'decisions'), { recursive: true });
}

function createTask(tempDir: string, num: number, status: string, bodyExtra = '') {
  const taskId = `20260420-${num}-test`;
  const raw = `---\ntask_id: ${num}\nstatus: ${status}\ndepends_on: [100, 101]\n---\n
# Task ${num}: Test Task Title

## Goal
Do the thing.

## Context
Some background.

## Required Work
1. Step one
2. Step two

## Acceptance Criteria
- [ ] Do thing A
- [x] Do thing B

${bodyExtra}`;
  seedTaskFromRaw(tempDir, taskId, num, raw, status);
}

function seedTaskFromRaw(tempDir: string, taskId: string, num: number, raw: string, statusOverride?: string) {
  writeFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', `${taskId}.md`), raw);
  const { frontMatter, body } = parseFrontMatter(raw);
  const spec = parseTaskSpecFromMarkdown({ taskId, taskNumber: num, frontMatter, body });
  const db = new Database(join(tempDir, '.ai', 'task-lifecycle.db'));
  const store = new SqliteTaskLifecycleStore({ db });
  store.initSchema();
  store.upsertLifecycle({
    task_id: taskId,
    task_number: num,
    status: (statusOverride ?? String(frontMatter.status ?? 'opened')) as 'opened' | 'claimed' | 'in_review' | 'closed' | 'confirmed',
    governed_by: null,
    closed_at: null,
    closed_by: null,
    reopened_at: null,
    reopened_by: null,
    continuation_packet_json: null,
    updated_at: new Date().toISOString(),
  });
  store.upsertTaskSpec({
    task_id: spec.task_id,
    task_number: spec.task_number,
    title: spec.title,
    chapter_markdown: spec.chapter,
    goal_markdown: spec.goal,
    context_markdown: spec.context,
    required_work_markdown: spec.required_work,
    non_goals_markdown: spec.non_goals,
    acceptance_criteria_json: JSON.stringify(spec.acceptance_criteria),
    dependencies_json: JSON.stringify(spec.dependencies),
    updated_at: spec.updated_at,
  });
  db.close();
}

function seedTaskFileOnly(tempDir: string, taskId: string, raw: string) {
  writeFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', `${taskId}.md`), raw);
}

function seedLifecycleOnly(tempDir: string, taskId: string, num: number, status: 'opened' | 'claimed' | 'in_review' | 'closed' | 'confirmed' = 'opened') {
  const db = new Database(join(tempDir, '.ai', 'task-lifecycle.db'));
  const store = new SqliteTaskLifecycleStore({ db });
  store.initSchema();
  store.upsertLifecycle({
    task_id: taskId,
    task_number: num,
    status,
    governed_by: null,
    closed_at: null,
    closed_by: null,
    reopened_at: null,
    reopened_by: null,
    continuation_packet_json: null,
    updated_at: new Date().toISOString(),
  });
  db.close();
}

describe('task read operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-read-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns error for non-existent task', async () => {
    const result = await taskReadCommand({ taskNumber: '999', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const parsed = result.result as { status: string; error: string };
    expect(parsed.status).toBe('error');
    expect(parsed.error).toContain('not found');
  });

  it('returns error for invalid task number', async () => {
    const result = await taskReadCommand({ taskNumber: 'abc', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const parsed = result.result as { status: string; error: string };
    expect(parsed.status).toBe('error');
  });

  it('reads task with full JSON shape', async () => {
    createTask(tempDir, 200, 'opened');
    const result = await taskReadCommand({ taskNumber: '200', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const parsed = result.result as { status: string; task: Record<string, unknown> };
    expect(parsed.status).toBe('ok');
    expect(parsed.task.task_number).toBe(200);
    expect(parsed.task.task_id).toBe('20260420-200-test');
    expect(parsed.task.title).toBe('Task 200: Test Task Title');
    expect(parsed.task.status).toBe('opened');
    expect(parsed.task.goal).toBe('Do the thing.');
    expect(parsed.task.context).toBe('Some background.');
    expect(parsed.task.required_work).toContain('Step one');
    expect(parsed.task.dependencies).toEqual([100, 101]);

    const ac = parsed.task.acceptance_criteria as Array<{ text: string; checked: boolean }>;
    expect(ac).toHaveLength(2);
    expect(ac[0].text).toBe('Do thing A');
    expect(ac[0].checked).toBe(false);
    expect(ac[1].text).toBe('Do thing B');
    expect(ac[1].checked).toBe(true);

    const evidence = parsed.task.evidence as Record<string, unknown>;
    expect(evidence.has_execution_notes).toBe(false);
    expect(evidence.has_verification).toBe(false);
    expect(evidence.has_report).toBe(false);
    expect(evidence.has_review).toBe(false);
    expect(evidence.has_closure).toBe(false);
    expect(evidence.all_criteria_checked).toBe(false);
    expect(evidence.unchecked_count).toBe(1);
  });

  it('backfills missing task spec from an existing markdown projection', async () => {
    const taskId = '20260420-209-test';
    seedTaskFileOnly(
      tempDir,
      taskId,
      `---\ntask_id: 209\nstatus: opened\ndepends_on: [108]\n---\n
# Task 209: Projection Only

## Goal
Read through sanctioned command.

## Required Work
1. Backfill task spec.

## Acceptance Criteria
- [ ] Read succeeds
`,
    );
    seedLifecycleOnly(tempDir, taskId, 209);

    const result = await taskReadCommand({ taskNumber: '209', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { task: { title: string; goal: string; dependencies: number[] } };
    expect(parsed.task.title).toBe('Task 209: Projection Only');
    expect(parsed.task.goal).toBe('Read through sanctioned command.');
    expect(parsed.task.dependencies).toEqual([108]);

    const db = new Database(join(tempDir, '.ai', 'task-lifecycle.db'));
    const store = new SqliteTaskLifecycleStore({ db });
    store.initSchema();
    const spec = store.getTaskSpecByNumber(209);
    expect(spec?.title).toBe('Task 209: Projection Only');
    db.close();
  });

  it('backfills lifecycle and task spec for markdown-only task projections', async () => {
    const taskId = '20260420-210-test';
    seedTaskFileOnly(
      tempDir,
      taskId,
      `---\ntask_id: 210\nstatus: claimed\n---\n
# Task 210: Markdown Only

## Goal
Repair missing authority rows.

## Acceptance Criteria
- [x] Read succeeds
`,
    );

    const db = new Database(join(tempDir, '.ai', 'task-lifecycle.db'));
    const store = new SqliteTaskLifecycleStore({ db });
    store.initSchema();
    db.close();

    const result = await taskReadCommand({ taskNumber: '210', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { task: { status: string; title: string } };
    expect(parsed.task.status).toBe('claimed');
    expect(parsed.task.title).toBe('Task 210: Markdown Only');

    const verifyDb = new Database(join(tempDir, '.ai', 'task-lifecycle.db'));
    const verifyStore = new SqliteTaskLifecycleStore({ db: verifyDb });
    verifyStore.initSchema();
    expect(verifyStore.getLifecycleByNumber(210)?.status).toBe('claimed');
    expect(verifyStore.getTaskSpecByNumber(210)?.title).toBe('Task 210: Markdown Only');
    verifyDb.close();
  });

  it('includes execution notes and verification when present', async () => {
    createTask(tempDir, 201, 'claimed', '## Execution Notes\nDid the work.\n\n## Verification\nTests passed.\n');
    const result = await taskReadCommand({ taskNumber: '201', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const parsed = result.result as { task: { execution_notes: string; verification: string; evidence: Record<string, unknown> } };
    expect(parsed.task.execution_notes).toBe('Did the work.');
    expect(parsed.task.verification).toBe('Tests passed.');
    expect(parsed.task.evidence.has_execution_notes).toBe(true);
    expect(parsed.task.evidence.has_verification).toBe(true);
  });

  it('includes assignment from sqlite', async () => {
    createTask(tempDir, 202, 'claimed');
    const dbPath = join(tempDir, '.ai', 'task-lifecycle.db');
    const db = new Database(dbPath);
    const store = new SqliteTaskLifecycleStore({ db });
    store.initSchema();
    store.insertAssignment({
      assignment_id: 'a-fs-1',
      task_id: '20260420-202-test',
      agent_id: 'test-agent',
      claimed_at: '2026-01-01T00:00:00Z',
      released_at: null,
      release_reason: null,
      intent: 'primary',
    });
    db.close();

    const result = await taskReadCommand({ taskNumber: '202', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const parsed = result.result as { task: { assignment: { agent_id: string; intent: string } | null } };
    expect(parsed.task.assignment).not.toBeNull();
    expect(parsed.task.assignment!.agent_id).toBe('test-agent');
    expect(parsed.task.assignment!.intent).toBe('primary');
  });

  it('reads SQLite lifecycle when available', async () => {
    createTask(tempDir, 203, 'opened');

    const dbPath = join(tempDir, '.ai', 'task-lifecycle.db');
    const db = new Database(dbPath);
    const store = new SqliteTaskLifecycleStore({ db });
    store.initSchema();

    store.upsertLifecycle({
      task_id: '20260420-203-test',
      task_number: 203,
      status: 'claimed',
      governed_by: null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: new Date().toISOString(),
    });

    store.insertAssignment({
      assignment_id: 'a1',
      task_id: '20260420-203-test',
      agent_id: 'sqlite-agent',
      claimed_at: '2026-01-01T00:00:00Z',
      released_at: null,
      release_reason: null,
      intent: 'primary',
    });

    db.close();

    const result = await taskReadCommand({ taskNumber: '203', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const parsed = result.result as { task: { status: string; assignment: { agent_id: string } | null } };
    // SQLite status wins over markdown
    expect(parsed.task.status).toBe('claimed');
    expect(parsed.task.assignment).not.toBeNull();
    expect(parsed.task.assignment!.agent_id).toBe('sqlite-agent');
  });

  it('returns human-readable output', async () => {
    createTask(tempDir, 204, 'opened');
    const result = await taskReadCommand({ taskNumber: '204', cwd: tempDir, format: 'human' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const text = result.result as string;
    expect(text).toContain('Task 204: Test Task Title');
    expect(text).toContain('Status:');
    expect(text).toContain('opened');
    expect(text).toContain('Goal:');
    expect(text).toContain('Do the thing.');
    expect(text).toContain('Acceptance Criteria:');
    expect(text).toContain('[ ] Do thing A');
    expect(text).toContain('[x] Do thing B');
    expect(text).toContain('Evidence:');
  });

  it('does not leak raw substrate info on default path', async () => {
    createTask(tempDir, 205, 'opened');
    const result = await taskReadCommand({ taskNumber: '205', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const json = JSON.stringify(result.result);
    // Should not contain substrate implementation details
    expect(json).not.toContain('markdown');
    expect(json).not.toContain('sqlite');
    expect(json).not.toContain('front matter');
    expect(json).not.toContain('.ai/do-not-open');
  });

  it('truncates long sections in human mode by default', async () => {
    const longGoal = Array(20).fill('A long line.').join('\n');
    seedTaskFromRaw(
      tempDir,
      '20260420-206-test',
      206,
      `---\ntask_id: 206\nstatus: opened\n---\n
# Task 206

## Goal\n${longGoal}\n
## Acceptance Criteria
- [ ] Do thing
`,
      'opened',
    );

    const result = await taskReadCommand({ taskNumber: '206', cwd: tempDir, format: 'human' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const text = result.result as string;
    // Should show truncation notice
    expect(text).toContain('… (');
    expect(text).toContain('more lines)');
  });

  it('shows full sections in human mode with --verbose', async () => {
    const longGoal = Array(20).fill('A long line.').join('\n');
    seedTaskFromRaw(
      tempDir,
      '20260420-207-test',
      207,
      `---\ntask_id: 207\nstatus: opened\n---\n
# Task 207

## Goal\n${longGoal}\n
## Acceptance Criteria
- [ ] Do thing
`,
      'opened',
    );

    const result = await taskReadCommand({ taskNumber: '207', cwd: tempDir, format: 'human', verbose: true });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const text = result.result as string;
    // Should NOT show truncation notice
    expect(text).not.toContain('more lines)');
    // All 20 lines should be present
    const lineCount = (text.match(/A long line\./g) ?? []).length;
    expect(lineCount).toBe(20);
  });

  it('shows warnings for terminal task with unchecked criteria', async () => {
    seedTaskFromRaw(
      tempDir,
      '20260420-208-test',
      208,
      `---\ntask_id: 208\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n
# Task 208

## Acceptance Criteria
- [ ] Do thing A
- [x] Do thing B

## Execution Notes
Done.

## Verification
OK.
`,
      'closed',
    );

    const result = await taskReadCommand({ taskNumber: '208', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const parsed = result.result as { task: { warnings: string[]; evidence: { has_governed_provenance: boolean } } };
    expect(parsed.task.warnings.length).toBeGreaterThan(0);
    expect(parsed.task.warnings.some((w) => w.includes('unchecked'))).toBe(true);
    expect(parsed.task.evidence.has_governed_provenance).toBe(true);
  });
});
