import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskCreateCommand } from '../../src/commands/task-create.js';
import { taskListCommand } from '../../src/commands/task-list.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import {
  mkdtempSync,
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

    // File exists and has content
    const filePath = r.file_path as string;
    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('status: opened');
    expect(content).toContain('## Goal');
    expect(content).toContain('Test the create operator');
    expect(content).toContain('## Acceptance Criteria');

    // SQLite lifecycle row is observable through sanctioned read surface
    const listResult = await taskListCommand({ cwd: tempDir, format: 'json' });
    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const list = listResult.result as { count: number; tasks: Array<{ task_id: string; status: string }> };
    const created = list.tasks.find((t) => t.task_id === r.task_id);
    expect(created).toBeDefined();
    expect(created!.status).toBe('opened');
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
