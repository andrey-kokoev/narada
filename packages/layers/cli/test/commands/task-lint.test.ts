import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskLintCommand } from '../../src/commands/task-lint.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
}

describe('task lint tool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-lint-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('passes with no issues', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-100-alpha.md'),
      '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n',
    );

    const result = await taskLintCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ status: 'success', issues: [] });
  });

  it('detects broken depends_on', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-100-alpha.md'),
      '---\ntask_id: 100\nstatus: opened\ndepends_on: [999]\n---\n\n# Task 100\n',
    );

    const result = await taskLintCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const issues = (result.result as { issues: Array<{ type: string }> }).issues;
    expect(issues.some((i) => i.type === 'broken_dependency')).toBe(true);
  });

  it('detects duplicate numbers', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-100-alpha.md'),
      '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-100-beta.md'),
      '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100 dup\n',
    );

    const result = await taskLintCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const issues = (result.result as { issues: Array<{ type: string }> }).issues;
    expect(issues.some((i) => i.type === 'duplicate_number')).toBe(true);
  });

  it('detects task_id mismatch', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-100-alpha.md'),
      '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 100\n',
    );

    const result = await taskLintCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const issues = (result.result as { issues: Array<{ type: string }> }).issues;
    expect(issues.some((i) => i.type === 'task_id_mismatch')).toBe(true);
  });

  it('detects duplicate filename numbers without front matter', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-100-alpha.md'),
      '# Task 100\n\nNo front matter here.',
    );
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-100-beta.md'),
      '# Task 100 dup\n\nAlso no front matter.',
    );

    const result = await taskLintCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const issues = (result.result as { issues: Array<{ type: string }> }).issues;
    expect(issues.some((i) => i.type === 'duplicate_number')).toBe(true);
  });
});
