import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');
vi.unmock('node:child_process');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { taskStageCommand } from '../../src/commands/task-stage.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

function git(cwd: string, args: string[]): string {
  return execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

describe('task stage operator', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'narada-task-stage-test-'));
    git(repo, ['init', '-b', 'main']);
    git(repo, ['config', 'user.email', 'test@example.invalid']);
    git(repo, ['config', 'user.name', 'Test Agent']);
    mkdirSync(join(repo, '.ai', 'do-not-open', 'tasks'), { recursive: true });
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999\n');
    writeFileSync(join(repo, 'src', 'owned.ts'), 'export const owned = 1;\n');
    writeFileSync(join(repo, 'src', 'unrelated.ts'), 'export const unrelated = 1;\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'base']);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('stages only declared files and reports excluded dirty work', async () => {
    writeFileSync(join(repo, 'src', 'owned.ts'), 'export const owned = 2;\n');
    writeFileSync(join(repo, 'src', 'unrelated.ts'), 'export const unrelated = 2;\n');

    const result = await taskStageCommand({
      taskNumber: '999',
      agent: 'builder',
      include: ['src/owned.ts'],
      cwd: repo,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action: 'staged',
      staged_files: ['src/owned.ts'],
      excluded_dirty_files: ['src/unrelated.ts'],
    });
    expect(git(repo, ['diff', '--cached', '--name-only'])).toBe('src/owned.ts');
  });

  it('can dry-run staging from report changed_files without mutating the index', async () => {
    writeFileSync(join(repo, 'src', 'owned.ts'), 'export const owned = 3;\n');
    writeFileSync(join(repo, 'src', 'unrelated.ts'), 'export const unrelated = 3;\n');
    const store = openTaskLifecycleStore(repo);
    try {
      store.upsertLifecycle({
        task_id: '20260420-999-test-task',
        task_number: 999,
        status: 'in_review',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-01-01T00:00:00Z',
      });
      store.upsertReportRecord({
        report_id: 'wrr_stage_test',
        task_id: '20260420-999-test-task',
        assignment_id: 'assignment-1',
        agent_id: 'builder',
        reported_at: '2026-01-01T00:00:00Z',
        report_json: JSON.stringify({
          report_id: 'wrr_stage_test',
          task_number: 999,
          task_id: '20260420-999-test-task',
          agent_id: 'builder',
          assignment_id: 'assignment-1',
          reported_at: '2026-01-01T00:00:00Z',
          summary: 'Stage from report',
          changed_files: ['src/owned.ts'],
          verification: [{ command: 'test', result: 'passed' }],
          known_residuals: [],
          ready_for_review: true,
          report_status: 'submitted',
        }),
      });
    } finally {
      store.db.close();
    }

    const result = await taskStageCommand({
      taskNumber: '999',
      fromReport: true,
      dryRun: true,
      cwd: repo,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      action: 'dry_run',
      report_id: 'wrr_stage_test',
      staged_files: ['src/owned.ts'],
      excluded_dirty_files: ['src/unrelated.ts'],
    });
    expect(git(repo, ['diff', '--cached', '--name-only'])).toBe('');
  });
});
