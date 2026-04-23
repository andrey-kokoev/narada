import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskEvidenceListCommand } from '../../src/commands/task-evidence-list.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'reports'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'decisions'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'a1', role: 'implementer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z', status: 'working', task: 101 },
        { agent_id: 'a2', role: 'reviewer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z', status: 'idle', task: null },
      ],
    }, null, 2),
  );
}

function createTask(tempDir: string, num: number, status: string, bodyExtra = '') {
  writeFileSync(
    join(tempDir, '.ai', 'tasks', `20260420-${num}-test.md`),
    `---\ntask_id: ${num}\nstatus: ${status}\n---\n\n# Task ${num}: Test\n\n## Acceptance Criteria\n- [ ] Do thing A\n- [x] Do thing B\n\n${bodyExtra}`,
  );
}

function createReport(tempDir: string, taskId: string, agentId: string) {
  const reportId = `wrr_1234567890_${taskId}_${agentId}`;
  writeFileSync(
    join(tempDir, '.ai', 'tasks', 'reports', `${reportId}.json`),
    JSON.stringify({
      report_id: reportId,
      task_number: 999,
      task_id: taskId,
      agent_id: agentId,
      assignment_id: `${taskId}-2026-01-01`,
      reported_at: '2026-01-01T00:00:00Z',
      summary: 'Done',
      changed_files: [],
      verification: [],
      known_residuals: [],
      ready_for_review: true,
      report_status: 'submitted',
    }, null, 2),
  );
  return reportId;
}

function createReview(tempDir: string, taskId: string, verdict: string) {
  const reviewId = `review-${taskId}-1234567890`;
  writeFileSync(
    join(tempDir, '.ai', 'reviews', `${reviewId}.json`),
    JSON.stringify({
      review_id: reviewId,
      reviewer_agent_id: 'a2',
      task_id: taskId,
      findings: [],
      verdict,
      reviewed_at: '2026-01-01T00:00:00Z',
    }, null, 2),
  );
  return reviewId;
}

describe('task evidence list operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-evidence-list-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty when no tasks match default not-complete filter', async () => {
    // Create only a complete closed task
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-100-test.md'),
      `---\ntask_id: 100\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 100: Test\n\n## Acceptance Criteria\n- [x] Do thing A\n\n## Execution Notes\nDone.\n\n## Verification\nTests passed.\n`,
    );
    const result = await taskEvidenceListCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { count: number; tasks: unknown[] };
    expect(r.count).toBe(0);
  });

  it('lists opened incomplete tasks by default', async () => {
    createTask(tempDir, 100, 'opened');
    createTask(tempDir, 101, 'claimed');
    const result = await taskEvidenceListCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { count: number; tasks: Array<{ task_number: number; verdict: string }> };
    expect(r.count).toBe(2);
    expect(r.tasks.map((t) => t.task_number)).toEqual([100, 101]);
    expect(r.tasks.every((t) => t.verdict === 'incomplete')).toBe(true);
  });

  it('lists attempt-complete tasks', async () => {
    createTask(tempDir, 102, 'claimed', '## Execution Notes\nDid the work.\n');
    createReport(tempDir, '20260420-102-test', 'a1');
    const result = await taskEvidenceListCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { count: number; tasks: Array<{ task_number: number; verdict: string }> };
    const task102 = r.tasks.find((t) => t.task_number === 102);
    expect(task102?.verdict).toBe('attempt_complete');
  });

  it('lists closed-but-invalid tasks', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-103-test.md'),
      `---\ntask_id: 103\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 103: Test\n\n## Acceptance Criteria\n- [x] Do thing A\n\n## Execution Notes\nDone.\n`,
    );
    const result = await taskEvidenceListCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { count: number; tasks: Array<{ task_number: number; verdict: string; violations: string[] }> };
    const task103 = r.tasks.find((t) => t.task_number === 103);
    expect(task103?.verdict).toBe('needs_closure');
    expect(task103?.violations.some((v) => v.includes('terminal_without_verification'))).toBe(true);
  });

  it('includes needs-review tasks', async () => {
    createTask(tempDir, 104, 'in_review', '## Execution Notes\nDone.\n');
    createReport(tempDir, '20260420-104-test', 'a1');
    const result = await taskEvidenceListCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { count: number; tasks: Array<{ task_number: number; verdict: string }> };
    const task104 = r.tasks.find((t) => t.task_number === 104);
    expect(task104?.verdict).toBe('needs_review');
  });

  it('filters by verdict', async () => {
    createTask(tempDir, 105, 'opened');
    createTask(tempDir, 106, 'claimed', '## Execution Notes\nDone.\n');
    createReport(tempDir, '20260420-106-test', 'a1');
    const result = await taskEvidenceListCommand({
      cwd: tempDir,
      format: 'json',
      verdict: 'incomplete',
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { count: number; tasks: Array<{ task_number: number }> };
    expect(r.count).toBe(1);
    expect(r.tasks[0].task_number).toBe(105);
  });

  it('filters by status', async () => {
    createTask(tempDir, 107, 'opened');
    createTask(tempDir, 108, 'claimed');
    const result = await taskEvidenceListCommand({
      cwd: tempDir,
      format: 'json',
      status: 'claimed',
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { count: number; tasks: Array<{ task_number: number }> };
    expect(r.count).toBe(1);
    expect(r.tasks[0].task_number).toBe(108);
  });

  it('filters by range', async () => {
    createTask(tempDir, 109, 'opened');
    createTask(tempDir, 110, 'opened');
    createTask(tempDir, 111, 'opened');
    const result = await taskEvidenceListCommand({
      cwd: tempDir,
      format: 'json',
      range: '109-110',
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { count: number; tasks: Array<{ task_number: number }> };
    expect(r.count).toBe(2);
    expect(r.tasks.map((t) => t.task_number)).toEqual([109, 110]);
  });

  it('shows complete tasks when verdict filter includes complete', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-112-test.md'),
      `---\ntask_id: 112\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 112: Test\n\n## Acceptance Criteria\n- [x] Do thing A\n\n## Execution Notes\nDone.\n\n## Verification\nTests passed.\n`,
    );
    const result = await taskEvidenceListCommand({
      cwd: tempDir,
      format: 'json',
      verdict: 'complete',
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { count: number; tasks: Array<{ task_number: number; verdict: string }> };
    expect(r.count).toBe(1);
    expect(r.tasks[0].task_number).toBe(112);
    expect(r.tasks[0].verdict).toBe('complete');
  });

  it('includes assigned agent when available', async () => {
    createTask(tempDir, 101, 'claimed');
    const result = await taskEvidenceListCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { count: number; tasks: Array<{ task_number: number; assigned_agent: string | null }> };
    const task101 = r.tasks.find((t) => t.task_number === 101);
    expect(task101?.assigned_agent).toBe('a1');
  });

  it('returns stable JSON shape', async () => {
    createTask(tempDir, 113, 'opened');
    const result = await taskEvidenceListCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as {
      status: string;
      count: number;
      filter: { verdict: string[]; status: null; range: null };
      tasks: Array<{
        task_number: number;
        task_id: string;
        title: string;
        status: string;
        verdict: string;
        missing: {
          unchecked_criteria: number;
          execution_notes: boolean;
          verification: boolean;
          report: boolean;
          review: boolean;
          closure: boolean;
        };
        warnings: string[];
        violations: string[];
        assigned_agent: string | null;
      }>;
    };
    expect(r.status).toBe('success');
    expect(typeof r.count).toBe('number');
    expect(Array.isArray(r.filter.verdict)).toBe(true);
    expect(r.tasks[0]).toHaveProperty('task_number');
    expect(r.tasks[0]).toHaveProperty('missing');
    expect(r.tasks[0]).toHaveProperty('violations');
    expect(r.tasks[0]).toHaveProperty('assigned_agent');
  });

  it('is read-only and does not mutate task files', async () => {
    createTask(tempDir, 114, 'opened');
    const before = writeFileSync;
    let writeCount = 0;
    // We verify no writes happen by checking the task file mtime is unchanged
    const path = join(tempDir, '.ai', 'tasks', '20260420-114-test.md');
    const { mtimeMs: beforeMtime } = await import('node:fs/promises').then((m) => m.stat(path));

    await taskEvidenceListCommand({ cwd: tempDir, format: 'json' });

    const { mtimeMs: afterMtime } = await import('node:fs/promises').then((m) => m.stat(path));
    expect(afterMtime).toBe(beforeMtime);
  });

  it('returns human-readable output', async () => {
    createTask(tempDir, 115, 'opened');
    const result = await taskEvidenceListCommand({ cwd: tempDir, format: 'human' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const text = result.result as { status: string };
    expect(text.status).toBe('success');
  });
});
