import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskCreateCommand } from '../../src/commands/task-create.js';
import {
  collectCriteriaCsvValues,
  collectCriteriaValue,
  mergeCriteriaInputs,
} from '../../src/commands/task-authoring-register.js';
import { taskListCommand } from '../../src/commands/task-list.js';
import { taskReadCommand } from '../../src/commands/task-read.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import {
  mkdtempSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  // Seed a prior task so number allocation has something to scan
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-alpha.md'),
    '---\nstatus: opened\n---\n\n# Task 100\n',
  );
}

describe('task create operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-create-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a task file and initializes SQLite lifecycle', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Test the create operator',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as Record<string, unknown>;
    expect(r.status).toBe('success');
    expect(r.task_number).toBe(101);
    expect(r.task_id).toMatch(/^\d{8}-101-test-the-create-operator$/);
    expect(r.handoff_actionability).toMatchObject({
      status: 'actionable',
    });

    // File exists and has content
    const filePath = r.file_path as string;
    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('status: opened');
    expect(content).toContain('## Goal');
    expect(content).toContain('Test the create operator');
    expect(content).toContain('## Acceptance Criteria');
    expect(content).not.toContain('1. TBD');

    // SQLite lifecycle row is observable through sanctioned read surface
    const listResult = await taskListCommand({ cwd: tempDir, format: 'json' });
    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const list = listResult.result as { count: number; tasks: Array<{ task_id: string; status: string }> };
    const created = list.tasks.find((t) => t.task_id === r.task_id);
    expect(created).toBeDefined();
    expect(created!.status).toBe('opened');
  });

  it('bootstraps the canonical task spec directory for a fresh Site before allocation and create', async () => {
    const freshSite = mkdtempSync(join(tmpdir(), 'narada-create-fresh-site-'));
    try {
      mkdirSync(join(freshSite, '.ai'), { recursive: true });
      const result = await taskCreateCommand({
        cwd: freshSite,
        title: 'Fresh Site task substrate',
        requiredWork: '1. Prove task creation repairs the missing canonical task directory.',
        criteria: ['Task file is created under canonical task spec directory.'],
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({
        status: 'success',
        task_number: 1,
      });
      expect(existsSync(join(freshSite, '.ai', 'do-not-open', 'tasks'))).toBe(true);
      expect(existsSync((result.result as { file_path: string }).file_path)).toBe(true);
    } finally {
      rmSync(freshSite, { recursive: true, force: true });
    }
  });

  it('initializes lifecycle and task spec authority rows together', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Authority row creation',
      criteria: ['Spec row exists', 'Lifecycle row exists'],
      dependsOn: '100',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { task_id: string; task_number: number };
    const store = openTaskLifecycleStore(tempDir);
    try {
      const lifecycle = store.getLifecycle(r.task_id);
      const spec = store.getTaskSpec(r.task_id);
      expect(lifecycle).toMatchObject({
        task_id: r.task_id,
        task_number: r.task_number,
        status: 'opened',
      });
      expect(spec).toMatchObject({
        task_id: r.task_id,
        task_number: r.task_number,
        title: 'Authority row creation',
      });
      expect(JSON.parse(spec!.acceptance_criteria_json)).toEqual(['Spec row exists', 'Lifecycle row exists']);
      expect(JSON.parse(spec!.dependencies_json)).toEqual([100]);
    } finally {
      store.db.close();
    }
  });

  it('requires --title', async () => {
    const result = await taskCreateCommand({ cwd: tempDir, title: '', format: 'json' });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error', error: expect.stringContaining('title') });
  });

  it('dry-run previews without creating file or database row', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Dry run preview',
      format: 'json',
      dryRun: true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      handoff_actionability: { status: 'actionable' },
    });
    const r = result.result as Record<string, unknown>;
    expect(r.status).toBe('dry_run');
    expect(r.task_number).toBe(101);

    // No file created
    const files = readdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'));
    const taskFiles = files.filter((f) => f.endsWith('.md') && !f.includes('alpha'));
    expect(taskFiles).toHaveLength(0);

    // No SQLite DB file created
    const dbFiles = files.filter((f) => f === 'task-lifecycle.db');
    expect(dbFiles).toHaveLength(0);
  });

  it('uses explicit --number when provided', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Explicit number',
      number: 999,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as Record<string, unknown>;
    expect(r.task_number).toBe(999);
    expect(r.task_id).toContain('-999-');
  });

  it('rejects collision with existing file', async () => {
    // Pre-create a file that would collide (use today's date prefix to match command)
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', `${datePrefix}-101-collider.md`),
      '---\nstatus: opened\n---\n\n# Collider\n',
    );

    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Collider',
      number: 101,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('already exists'),
    });
  });

  it('includes depends_on in front matter when provided', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Depends on something',
      dependsOn: '100,200',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const filePath = (result.result as Record<string, unknown>).file_path as string;
    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('depends_on: [100, 200]');
  });

  it('includes acceptance criteria from --criteria', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'With criteria',
      criteria: ['Thing A works', 'Thing B is clean'],
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const filePath = (result.result as Record<string, unknown>).file_path as string;
    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('- [ ] Thing A works');
    expect(content).toContain('- [ ] Thing B is clean');
  });

  it('preserves shell-sensitive rich text literally through --input-json', async () => {
    const payload = {
      title: 'Shell safe task',
      goal: 'Preserve `code`, $(not-expanded), "quotes", pipes | and\nmultiple lines.',
      required_work: [
        '1. Keep output literal:',
        '```text',
        '$ echo hello | tee out',
        '```',
      ].join('\n'),
      acceptance_criteria: [
        'Backticks `x` remain literal',
        '$() remains literal and is not shell-expanded',
        'Pipes | remain literal',
      ],
    };
    writeFileSync(join(tempDir, 'task-input.json'), JSON.stringify(payload, null, 2));

    const result = await taskCreateCommand({
      cwd: tempDir,
      inputJson: 'task-input.json',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const filePath = (result.result as Record<string, unknown>).file_path as string;
    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('Preserve `code`, $(not-expanded), "quotes", pipes | and');
    expect(content).toContain('$ echo hello | tee out');
    expect(content).toContain('- [ ] $() remains literal and is not shell-expanded');

    const store = openTaskLifecycleStore(tempDir);
    try {
      const spec = store.getTaskSpecByNumber((result.result as { task_number: number }).task_number);
      expect(JSON.parse(spec!.acceptance_criteria_json)).toEqual(payload.acceptance_criteria);
      expect(spec!.goal_markdown).toBe(payload.goal);
      expect(spec!.required_work_markdown).toBe(payload.required_work);
    } finally {
      store.db.close();
    }
  });

  it('returns input path errors before title validation for unreadable --input-json', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      inputJson: 'missing-task-input.json',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining("Failed to read --input-json path 'missing-task-input.json'"),
    });
    expect(JSON.stringify(result.result)).not.toContain('--title is required');
  });

  it('returns Windows path conversion guidance for native Windows --input-json paths', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      inputJson: 'D:\\code\\narada\\task-input.json',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('Windows path'),
    });
    expect(JSON.stringify(result.result)).toContain('wslpath -u');
    expect(JSON.stringify(result.result)).not.toContain('--title is required');
  });

  it('refuses explicit placeholder Required Work for executable task creation', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Placeholder handoff',
      requiredWork: '1. TBD',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'task_handoff_underspecified',
      handoff_actionability: {
        status: 'underspecified',
      },
    });
    const files = readdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'));
    expect(files.filter((name) => name.includes('placeholder-handoff'))).toHaveLength(0);
  });

  it('refuses suspicious rich inline text and points to structured input', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Suspicious inline',
      criteria: ['Run `narada task evidence list --range 1113-1118 | jq .tasks`'],
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('Use --input-json <file> or --from-file <path>'),
    });
  });

  it('keeps normal short inline task creation ergonomic', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Short inline task',
      goal: 'Keep simple authoring simple.',
      criteria: ['Simple criterion'],
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const content = readFileSync((result.result as Record<string, unknown>).file_path as string, 'utf8');
    expect(content).toContain('Keep simple authoring simple.');
    expect(content).toContain('- [ ] Simple criterion');
  });

  it('preserves comma-containing repeatable --criteria values and requires explicit CSV mode', async () => {
    const repeated = collectCriteriaValue('Preserve Smith, Jane as one criterion', []);
    expect(repeated).toEqual(['Preserve Smith, Jane as one criterion']);
    expect(collectCriteriaCsvValues('A, B')).toEqual(['A', 'B']);
    expect(mergeCriteriaInputs(repeated, 'Explicit CSV one, Explicit CSV two')).toEqual([
      'Preserve Smith, Jane as one criterion',
      'Explicit CSV one',
      'Explicit CSV two',
    ]);

    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Comma criteria',
      criteria: repeated,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const store = openTaskLifecycleStore(tempDir);
    try {
      const spec = store.getTaskSpecByNumber((result.result as { task_number: number }).task_number);
      expect(JSON.parse(spec!.acceptance_criteria_json)).toEqual([
        'Preserve Smith, Jane as one criterion',
      ]);
    } finally {
      store.db.close();
    }

    const dryRun = await taskCreateCommand({
      cwd: tempDir,
      title: 'Comma criteria dry run',
      criteria: repeated,
      dryRun: true,
      format: 'json',
    });
    expect((dryRun.result as { acceptance_criteria: string[] }).acceptance_criteria).toEqual([
      'Preserve Smith, Jane as one criterion',
    ]);
  });

  it('uses --goal when provided', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Goal override',
      goal: 'This is the real goal',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const filePath = (result.result as Record<string, unknown>).file_path as string;
    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('## Goal');
    expect(content).toContain('This is the real goal');
  });

  it('reads body from --from-file', async () => {
    const bodyContent = '# Custom Body\n\nThis was loaded from a file.\n';
    const sourceFile = join(tempDir, 'source-body.md');
    writeFileSync(sourceFile, bodyContent);

    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'From file',
      fromFile: 'source-body.md',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const filePath = (result.result as Record<string, unknown>).file_path as string;
    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('This was loaded from a file.');
  });

  it('uses --from-file body without duplicating front matter and preserves dependencies', async () => {
    const bodyContent = [
      '---',
      'status: draft',
      'depends_on: [100]',
      '---',
      '',
      '# Template Task',
      '',
      '## Goal',
      '',
      'Use the template.',
      '',
      '## Acceptance Criteria',
      '',
      '- [ ] Template criterion',
      '',
    ].join('\n');
    const sourceFile = join(tempDir, 'source-with-frontmatter.md');
    writeFileSync(sourceFile, bodyContent);

    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'From file with front matter',
      fromFile: 'source-with-frontmatter.md',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const filePath = (result.result as Record<string, unknown>).file_path as string;
    const content = readFileSync(filePath, 'utf8');
    expect(content.match(/^---$/gm)).toHaveLength(2);
    expect(content).toContain('status: opened');
    expect(content).toContain('depends_on: [100]');
    expect(content).toContain('# From file with front matter');

    const store = openTaskLifecycleStore(tempDir);
    try {
      const spec = store.getTaskSpecByNumber((result.result as { task_number: number }).task_number);
      expect(JSON.parse(spec!.dependencies_json)).toEqual([100]);
      expect(JSON.parse(spec!.acceptance_criteria_json)).toEqual(['Template criterion']);
    } finally {
      store.db.close();
    }
  });

  it('preserves explicit metadata flags when using --from-file', async () => {
    const bodyContent = [
      '# Template Task',
      '',
      '## Goal',
      '',
      'Template goal.',
      '',
      '## Acceptance Criteria',
      '',
      '- [ ] Template criterion',
      '',
    ].join('\n');
    writeFileSync(join(tempDir, 'metadata-template.md'), bodyContent);

    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Explicit title',
      goal: 'Explicit goal',
      chapter: 'Explicit Chapter',
      dependsOn: '100,200',
      criteria: ['Explicit criterion A', 'Explicit criterion B'],
      fromFile: 'metadata-template.md',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const content = readFileSync((result.result as Record<string, unknown>).file_path as string, 'utf8');
    expect(content).toContain('# Explicit title');
    expect(content).toContain('## Chapter');
    expect(content).toContain('Explicit Chapter');
    expect(content).toContain('Explicit goal');
    expect(content).toContain('depends_on: [100, 200]');
    expect(content).toContain('- [ ] Explicit criterion A');
    expect(content).not.toContain('Template criterion');

    const store = openTaskLifecycleStore(tempDir);
    try {
      const spec = store.getTaskSpecByNumber((result.result as { task_number: number }).task_number);
      expect(spec!.title).toBe('Explicit title');
      expect(spec!.goal_markdown).toBe('Explicit goal');
      expect(spec!.chapter_markdown).toBe('Explicit Chapter');
      expect(JSON.parse(spec!.dependencies_json)).toEqual([100, 200]);
      expect(JSON.parse(spec!.acceptance_criteria_json)).toEqual(['Explicit criterion A', 'Explicit criterion B']);
    } finally {
      store.db.close();
    }
  });

  it('preserves plain and numbered --from-file acceptance criteria in lifecycle authority', async () => {
    const bodyContent = [
      '# Template Task',
      '',
      '## Required Work',
      '',
      '1. Preserve parsed acceptance criteria.',
      '',
      '## Acceptance Criteria',
      '',
      '- Plain bullet criterion',
      '1. Numbered criterion',
      '',
    ].join('\n');
    writeFileSync(join(tempDir, 'source-criteria.md'), bodyContent);

    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'From file criteria',
      fromFile: 'source-criteria.md',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const taskNumber = (result.result as { task_number: number }).task_number;

    const store = openTaskLifecycleStore(tempDir);
    try {
      const spec = store.getTaskSpecByNumber(taskNumber);
      expect(JSON.parse(spec!.acceptance_criteria_json)).toEqual([
        'Plain bullet criterion',
        'Numbered criterion',
      ]);
    } finally {
      store.db.close();
    }

    const read = await taskReadCommand({ cwd: tempDir, taskNumber: String(taskNumber), format: 'json' });
    expect(read.exitCode).toBe(ExitCode.SUCCESS);
    expect((read.result as { task: { handoff_actionability: { status: string } } }).task.handoff_actionability.status).toBe('actionable');
    expect((read.result as { task: { acceptance_criteria: Array<{ text: string; checked: boolean }> } }).task.acceptance_criteria).toEqual([
      { text: 'Plain bullet criterion', checked: false },
      { text: 'Numbered criterion', checked: false },
    ]);
  });

  it('returns a clear diagnostic for unparseable --from-file acceptance criteria sections', async () => {
    const bodyContent = [
      '# Template Task',
      '',
      '## Acceptance Criteria',
      '',
      'Criteria are described in prose but not list items.',
      '',
    ].join('\n');
    writeFileSync(join(tempDir, 'source-bad-criteria.md'), bodyContent);

    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Bad criteria',
      fromFile: 'source-bad-criteria.md',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('Failed to parse --from-file Acceptance Criteria'),
    });
  });

  it('errors when --from-file does not exist', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Missing file',
      fromFile: 'nonexistent.md',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('from-file'),
    });
  });

  it('emits structured JSON output', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'JSON output',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toEqual(
      expect.objectContaining({
        status: 'success',
        task_id: expect.any(String),
        task_number: expect.any(Number),
        file_path: expect.any(String),
        title: 'JSON output',
      }),
    );
  });

  it('human output does not throw', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Human output',
      format: 'human',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      task_number: expect.any(Number),
    });
  });

  it('does not leave temp files behind', async () => {
    await taskCreateCommand({
      cwd: tempDir,
      title: 'No temp files',
      format: 'json',
    });

    const files = readdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'));
    const tempFiles = files.filter((f) => f.startsWith('.tmp-'));
    expect(tempFiles).toHaveLength(0);
  });

  it('includes chapter section when --chapter provided', async () => {
    const result = await taskCreateCommand({
      cwd: tempDir,
      title: 'Chaptered task',
      chapter: 'Task 585 — Command-Mediated Task Authority Boundary Contract',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const filePath = (result.result as Record<string, unknown>).file_path as string;
    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('## Chapter');
    expect(content).toContain('Task 585');
  });
});
