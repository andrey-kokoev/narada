import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chapterPreflightCommand } from '../../src/commands/chapter-preflight.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

function setupRepo(tempDir: string): void {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
}

function writeTask(tempDir: string, number: number, status = 'opened'): void {
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', `20260426-${number}-task.md`),
    `---\ntask_id: ${number}\nstatus: ${status}\n---\n\n# Task ${number}\n`,
  );
}

function initGit(tempDir: string): void {
  execFileSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: tempDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Narada Test'], { cwd: tempDir, stdio: 'ignore' });
}

describe('chapter preflight operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `narada-chapter-preflight-${process.pid}-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    setupRepo(tempDir);
  });

  afterEach(() => {
    try {
      chmodSync(join(tempDir, '.git'), 0o700);
    } catch {
      // The test may not have initialized Git.
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('passes when tasks exist and commit authority is available', async () => {
    initGit(tempDir);
    writeTask(tempDir, 912);
    writeTask(tempDir, 913);

    const result = await chapterPreflightCommand({
      range: '912-913',
      cwd: tempDir,
      expectCommit: true,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { ready: boolean; checks: Array<{ name: string; status: string }> };
    expect(r.ready).toBe(true);
    expect(r.checks).toContainEqual(expect.objectContaining({ name: 'chapter_tasks_present', status: 'pass' }));
    expect(r.checks).toContainEqual(expect.objectContaining({ name: 'git_metadata_writable', status: 'pass' }));
  });

  it('fails early when tasks are missing from the chapter range', async () => {
    initGit(tempDir);
    writeTask(tempDir, 912);

    const result = await chapterPreflightCommand({
      range: '912-913',
      cwd: tempDir,
      expectCommit: true,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { ready: boolean; checks: Array<{ name: string; status: string }> };
    expect(r.ready).toBe(false);
    expect(r.checks).toContainEqual(expect.objectContaining({ name: 'chapter_tasks_present', status: 'fail' }));
  });

  it('fails when commit is expected outside a Git work tree', async () => {
    writeTask(tempDir, 912);

    const result = await chapterPreflightCommand({
      range: '912',
      cwd: tempDir,
      expectCommit: true,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { checks: Array<{ name: string; status: string }> };
    expect(r.checks).toContainEqual(expect.objectContaining({ name: 'git_work_tree', status: 'fail' }));
  });

  it('fails when push is expected and no upstream is configured', async () => {
    initGit(tempDir);
    writeTask(tempDir, 912);

    const result = await chapterPreflightCommand({
      range: '912',
      cwd: tempDir,
      expectPush: true,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { checks: Array<{ name: string; status: string }> };
    expect(r.checks).toContainEqual(expect.objectContaining({ name: 'git_upstream', status: 'fail' }));
  });

  it('rejects invalid ranges', async () => {
    const result = await chapterPreflightCommand({ range: 'abc', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('Invalid range format');
  });
});
