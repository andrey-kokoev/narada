import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskAmendCommand } from '../../src/commands/task-amend.js';
import { taskReadCommand } from '../../src/commands/task-read.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { Database } from '@narada2/control-plane';
import { SqliteTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { parseFrontMatter } from '../../src/lib/task-governance.js';
import { parseTaskSpecFromMarkdown } from '../../src/lib/task-spec.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
}

function createTask(tempDir: string, num: number, status: string, bodyExtra = '') {
  const taskId = `20260420-${num}-test`;
  const raw = `---\ntask_id: ${num}\nstatus: ${status}\n---\n
# Task ${num}: Original Title

## Goal
Do the thing.

## Context
Some background.

## Required Work
1. Step one
2. Step two

## Non-Goals
- Do not expand scope.

## Acceptance Criteria
- [ ] Do thing A
- [x] Do thing B

${bodyExtra}`;
  writeFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', `${taskId}.md`), raw);

  const { frontMatter, body } = parseFrontMatter(raw);
  const spec = parseTaskSpecFromMarkdown({ taskId, taskNumber: num, frontMatter, body });
  const db = new Database(join(tempDir, '.ai', 'task-lifecycle.db'));
  const store = new SqliteTaskLifecycleStore({ db });
  store.initSchema();
  store.upsertLifecycle({
    task_id: taskId,
    task_number: num,
    status: status as 'opened' | 'claimed' | 'in_review' | 'closed' | 'confirmed',
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

describe('task amend operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-amend-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('amends goal on an opened task', async () => {
    createTask(tempDir, 200, 'opened');

    const result = await taskAmendCommand({
      taskNumber: '200',
      by: 'operator-1',
      goal: 'Do the thing better.',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as Record<string, unknown>;
    expect(r.changes).toContain('goal');

    // Verify via read command
    const readResult = await taskReadCommand({ taskNumber: '200', cwd: tempDir, format: 'json' });
    const task = (readResult.result as { task: { goal: string } }).task;
    expect(task.goal).toBe('Do the thing better.');
  });

  it('requires --by', async () => {
    createTask(tempDir, 201, 'opened');

    const result = await taskAmendCommand({
      taskNumber: '201',
      by: '',
      goal: 'New goal',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error', error: expect.stringContaining('by') });
  });

  it('rejects amendment with no changes specified', async () => {
    createTask(tempDir, 202, 'opened');

    const result = await taskAmendCommand({
      taskNumber: '202',
      by: 'operator-1',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error', error: expect.stringContaining('No amendments') });
  });

  it('rejects amendment of closed task', async () => {
    createTask(tempDir, 203, 'closed');

    const result = await taskAmendCommand({
      taskNumber: '203',
      by: 'operator-1',
      goal: 'New goal',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('closed'),
    });
  });

  it('rejects amendment of confirmed task', async () => {
    createTask(tempDir, 204, 'confirmed');

    const result = await taskAmendCommand({
      taskNumber: '204',
      by: 'operator-1',
      goal: 'New goal',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('confirmed'),
    });
  });

  it('amends title', async () => {
    createTask(tempDir, 205, 'opened');

    const result = await taskAmendCommand({
      taskNumber: '205',
      by: 'operator-1',
      title: 'New Task Title',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const readResult = await taskReadCommand({ taskNumber: '205', cwd: tempDir, format: 'json' });
    const task = (readResult.result as { task: { title: string } }).task;
    expect(task.title).toBe('New Task Title');
  });

  it('amends context', async () => {
    createTask(tempDir, 206, 'opened');

    const result = await taskAmendCommand({
      taskNumber: '206',
      by: 'operator-1',
      context: 'Updated context.',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const readResult = await taskReadCommand({ taskNumber: '206', cwd: tempDir, format: 'json' });
    const task = (readResult.result as { task: { context: string } }).task;
    expect(task.context).toBe('Updated context.');
  });

  it('amends required work', async () => {
    createTask(tempDir, 207, 'opened');

    const result = await taskAmendCommand({
      taskNumber: '207',
      by: 'operator-1',
      requiredWork: '1. New step.',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const readResult = await taskReadCommand({ taskNumber: '207', cwd: tempDir, format: 'json' });
    const task = (readResult.result as { task: { required_work: string } }).task;
    expect(task.required_work).toContain('New step');
  });

  it('amends non-goals', async () => {
    createTask(tempDir, 208, 'opened');

    const result = await taskAmendCommand({
      taskNumber: '208',
      by: 'operator-1',
      nonGoals: '- Do not touch production.',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const readResult = await taskReadCommand({ taskNumber: '208', cwd: tempDir, format: 'json' });
    const task = (readResult.result as { task: { non_goals: string | null } }).task;
    // task-read does not expose non_goals directly; verify via file content
    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-208-test.md'), 'utf8');
    expect(content).toContain('Do not touch production.');
  });

  it('replaces acceptance criteria', async () => {
    createTask(tempDir, 209, 'opened');

    const result = await taskAmendCommand({
      taskNumber: '209',
      by: 'operator-1',
      criteria: ['Criterion X', 'Criterion Y'],
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const readResult = await taskReadCommand({ taskNumber: '209', cwd: tempDir, format: 'json' });
    const task = (readResult.result as { task: { acceptance_criteria: Array<{ text: string }> } }).task;
    expect(task.acceptance_criteria).toHaveLength(2);
    expect(task.acceptance_criteria[0].text).toBe('Criterion X');
    expect(task.acceptance_criteria[1].text).toBe('Criterion Y');
  });

  it('appends acceptance criteria', async () => {
    createTask(tempDir, 210, 'opened');

    const result = await taskAmendCommand({
      taskNumber: '210',
      by: 'operator-1',
      appendCriteria: ['Criterion Z'],
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const readResult = await taskReadCommand({ taskNumber: '210', cwd: tempDir, format: 'json' });
    const task = (readResult.result as { task: { acceptance_criteria: Array<{ text: string }> } }).task;
    expect(task.acceptance_criteria).toHaveLength(3);
    expect(task.acceptance_criteria[2].text).toBe('Criterion Z');
  });

  it('amends from file', async () => {
    createTask(tempDir, 211, 'opened');
    const newBody = '# Task 211: From File\n\n## Goal\nReplaced goal.\n';
    writeFileSync(join(tempDir, 'new-body.md'), newBody);

    const result = await taskAmendCommand({
      taskNumber: '211',
      by: 'operator-1',
      fromFile: 'new-body.md',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-211-test.md'), 'utf8');
    expect(content).toContain('Replaced goal.');
  });

  it('records amendment audit in front matter and execution notes', async () => {
    createTask(tempDir, 212, 'opened');

    await taskAmendCommand({
      taskNumber: '212',
      by: 'operator-audit',
      goal: 'Audited goal.',
      format: 'json',
      cwd: tempDir,
    });

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-212-test.md'), 'utf8');
    expect(content).toContain('amended_by: operator-audit');
    expect(content).toContain('amended_at:');
    expect(content).toContain('Amended by operator-audit');
    expect(content).toContain('goal');
  });

  it('returns error for non-existent task', async () => {
    const result = await taskAmendCommand({
      taskNumber: '999',
      by: 'operator-1',
      goal: 'New goal',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error', error: expect.stringContaining('not found') });
  });

  it('returns error for invalid task number', async () => {
    const result = await taskAmendCommand({
      taskNumber: 'abc',
      by: 'operator-1',
      goal: 'New goal',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error', error: expect.stringContaining('Invalid') });
  });

  it('emits structured JSON output', async () => {
    createTask(tempDir, 213, 'opened');

    const result = await taskAmendCommand({
      taskNumber: '213',
      by: 'operator-1',
      goal: 'JSON test goal.',
      format: 'json',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toEqual(
      expect.objectContaining({
        status: 'success',
        task_number: 213,
        amended_by: 'operator-1',
        changes: expect.any(Array),
      }),
    );
  });

  it('human output does not throw', async () => {
    createTask(tempDir, 214, 'opened');

    const result = await taskAmendCommand({
      taskNumber: '214',
      by: 'operator-1',
      goal: 'Human goal.',
      format: 'human',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      task_number: 214,
    });
  });
});
