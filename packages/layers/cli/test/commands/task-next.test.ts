import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  taskPeekNextCommand,
  taskPullNextCommand,
  taskWorkNextCommand,
} from '../../src/commands/task-next.js';
import { taskReportCommand } from '../../src/commands/task-report.js';
import { taskReviewCommand } from '../../src/commands/task-review.js';
import { taskRosterDoneCommand } from '../../src/commands/task-roster.js';
import { loadRoster } from '../../src/lib/task-governance.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 2,
      schema: 'https://narada.dev/schemas/agent-roster/v2',
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        {
          agent_id: 'a1',
          role: 'implementer',
          capabilities: ['claim', 'execute'],
          first_seen_at: '2026-01-01T00:00:00Z',
          last_active_at: '2026-01-01T00:00:00Z',
          status: 'idle',
          task: null,
          last_done: null,
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          agent_id: 'a2',
          role: 'reviewer',
          capabilities: ['review'],
          first_seen_at: '2026-01-01T00:00:00Z',
          last_active_at: '2026-01-01T00:00:00Z',
          status: 'idle',
          task: null,
          last_done: null,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    }, null, 2),
  );
}

describe('task-next surfaces', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-next-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('peek-next (612)', () => {
    it('returns structured agent_not_found for unknown agents', async () => {
      const result = await taskPeekNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(result.result).toMatchObject({
        status: 'error',
        reason: 'agent_not_found',
        agent: 'architect',
        agent_id: 'architect',
        action: 'peek_next',
        primary: null,
      });
    });

    it('returns empty when no runnable tasks exist', async () => {
      const result = await taskPeekNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({
        status: 'empty',
        reason: 'no_admissible_task',
        agent: 'a1',
        agent_id: 'a1',
        action: 'peek_next',
        primary: null,
        task: null,
      });
    });

    it('returns the next opened task without claiming it', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'),
        '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n\n## Goal\nDo something.\n',
      );

      const result = await taskPeekNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { status: string; task: { task_number: number } };
      expect(data.status).toBe('ok');
      expect(data.task.task_number).toBe(100);
      expect(result.result).toMatchObject({
        agent_id: 'a1',
        action: 'peek_next',
        primary: { task_number: 100 },
      });

      // Roster unchanged
      const roster = await loadRoster(tempDir);
      expect(roster.agents.find((a) => a.agent_id === 'a1')?.status).toBe('idle');

      // Task file unchanged
      const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'), 'utf8');
      expect(taskContent).toContain('status: opened');

      // No assignment record created
      expect(() => readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments', '20260420-100-test.json'), 'utf8')).toThrow();
    });

    it('respects dependency gating', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-dep.md'),
        '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100 (dependency)\n',
      );
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-200-test.md'),
        '---\ntask_id: 200\nstatus: opened\ndepends_on:\n  - 100\n---\n\n# Task 200\n',
      );

      const result = await taskPeekNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      // Task 100 is runnable (no deps), task 200 is blocked by 100
      const data = result.result as { status: string; task: { task_number: number } };
      expect(data.status).toBe('ok');
      expect(data.task.task_number).toBe(100);
    });

    it('skips tasks already claimed by another agent', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'),
        '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n',
      );
      const claim = await taskPullNextCommand({ agent: 'a2', cwd: tempDir, format: 'json' });
      expect(claim.exitCode).toBe(ExitCode.SUCCESS);

      const result = await taskPeekNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({ status: 'empty' });
    });
  });

  describe('pull-next (613)', () => {
    it('returns structured agent_not_found for unknown agents', async () => {
      const result = await taskPullNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(result.result).toMatchObject({
        status: 'error',
        reason: 'agent_not_found',
        agent: 'architect',
        agent_id: 'architect',
        action: 'pull_next',
        primary: null,
      });
    });

    it('claims the next admissible task', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'),
        '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n\n## Goal\nDo something.\n',
      );

      const result = await taskPullNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { status: string; pulled: boolean; task_number: number };
      expect(data.status).toBe('ok');
      expect(data.pulled).toBe(true);
      expect(data.task_number).toBe(100);

      // Task file updated
      const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'), 'utf8');
      expect(taskContent).toContain('status: claimed');

      // Roster updated
      const roster = await loadRoster(tempDir);
      expect(roster.agents.find((a) => a.agent_id === 'a1')?.status).toBe('working');
      expect(roster.agents.find((a) => a.agent_id === 'a1')?.task).toBe(100);
    });

    it('does not double-claim the same task', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'),
        '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n',
      );

      const r1 = await taskPullNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
      expect(r1.exitCode).toBe(ExitCode.SUCCESS);
      expect((r1.result as { pulled: boolean }).pulled).toBe(true);

      // After pull, task is claimed and no longer admissible for pull-next
      const r2 = await taskPullNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
      expect(r2.exitCode).toBe(ExitCode.SUCCESS);
      expect(r2.result).toMatchObject({ status: 'empty', task: null });
    });

    it('returns empty when no admissible tasks exist', async () => {
      const result = await taskPullNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({ status: 'empty', task: null });
      expect(result.result).toMatchObject({
        reason: 'no_admissible_task',
        agent_id: 'a1',
        action: 'pull_next',
        primary: null,
      });
    });
  });

  describe('work-next (614)', () => {
    it('returns structured agent_not_found for unknown agents', async () => {
      const result = await taskWorkNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(result.result).toMatchObject({
        status: 'error',
        reason: 'agent_not_found',
        agent: 'architect',
        agent_id: 'architect',
        action: 'work_next',
        primary: null,
      });
    });

    it('returns packet for already-assigned task', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'),
        '---\ntask_id: 100\nstatus: claimed\n---\n\n# Task 100\n\n## Goal\nDo something.\n\n## Required Work\n1. Step one.\n',
      );
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments', '20260420-100-test.json'),
        JSON.stringify({
          task_id: '20260420-100-test',
          assignments: [{ agent_id: 'a1', claimed_at: '2026-01-01T00:00:00Z', claim_context: null, released_at: null, release_reason: null, intent: 'primary' }],
        }),
      );

      // Pre-set roster to working on 100
      const roster = JSON.parse(readFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), 'utf8'));
      roster.agents[0].status = 'working';
      roster.agents[0].task = 100;
      writeFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), JSON.stringify(roster, null, 2));

      const result = await taskWorkNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { status: string; packet: { task_number: number; pulled: boolean } };
      expect(data.status).toBe('ok');
      expect(data.packet.task_number).toBe(100);
      expect(data.packet.pulled).toBe(false);
    });

    it('pulls next and returns packet when no current task', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'),
        '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n\n## Goal\nDo something.\n',
      );

      const result = await taskWorkNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { status: string; packet: { task_number: number; pulled: boolean } };
      expect(data.status).toBe('ok');
      expect(data.packet.task_number).toBe(100);
      expect(data.packet.pulled).toBe(true);
    });

    it('returns empty when no work available', async () => {
      const result = await taskWorkNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({ status: 'empty', packet: null });
      expect(result.result).toMatchObject({
        reason: 'no_admissible_task',
        agent_id: 'a1',
        action: 'work_next',
        primary: null,
      });
    });

    it('does not auto-close or conflate execution with completion', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'),
        '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n',
      );

      const result = await taskWorkNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as { status: string; packet: { status: string } };
      expect(data.packet.status).toBe('claimed'); // pulled, not closed
    });
  });

  it('smoke-proves admitted agent self-cycle through done roster state', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'),
      [
        '---',
        'task_id: 100',
        'status: opened',
        '---',
        '',
        '# Task 100: Agent Self Cycle Smoke',
        '',
        '## Goal',
        'Prove the agent cycle.',
        '',
        '## Acceptance Criteria',
        '',
        '- [x] Cycle proved.',
        '',
        '## Execution Notes',
        '',
        'Smoke proof fixture.',
        '',
        '## Verification',
        '',
        'Smoke proof fixture.',
        '',
      ].join('\n'),
    );

    const peek = await taskPeekNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
    expect(peek.exitCode).toBe(ExitCode.SUCCESS);
    expect(peek.result).toMatchObject({
      status: 'ok',
      agent_id: 'a1',
      action: 'peek_next',
      primary: { task_number: 100 },
    });

    const pull = await taskPullNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
    expect(pull.exitCode).toBe(ExitCode.SUCCESS);
    expect(pull.result).toMatchObject({
      status: 'ok',
      agent_id: 'a1',
      action: 'pull_next',
      primary: { task_number: 100 },
      pulled: true,
    });
    let roster = await loadRoster(tempDir);
    expect(roster.agents.find((a) => a.agent_id === 'a1')).toMatchObject({
      status: 'working',
      task: 100,
    });

    const work = await taskWorkNextCommand({ agent: 'a1', cwd: tempDir, format: 'json' });
    expect(work.exitCode).toBe(ExitCode.SUCCESS);
    expect(work.result).toMatchObject({
      status: 'ok',
      agent_id: 'a1',
      action: 'work_next',
      primary: { task_number: 100 },
      packet: { task_number: 100 },
    });

    const report = await taskReportCommand({
      taskNumber: '100',
      agent: 'a1',
      summary: 'Smoke proof complete.',
      verification: '[{"command":"smoke","result":"pass"}]',
      cwd: tempDir,
      format: 'json',
    });
    expect(report.exitCode).toBe(ExitCode.SUCCESS);
    const reportId = (report.result as { report_id: string }).report_id;

    const review = await taskReviewCommand({
      taskNumber: '100',
      agent: 'a2',
      verdict: 'accepted',
      report: reportId,
      findings: '[]',
      cwd: tempDir,
      format: 'json',
    });
    expect(review.exitCode).toBe(ExitCode.SUCCESS);

    const done = await taskRosterDoneCommand({
      taskNumber: '100',
      agent: 'a1',
      cwd: tempDir,
      format: 'json',
    });
    expect(done.exitCode).toBe(ExitCode.SUCCESS);
    roster = await loadRoster(tempDir);
    expect(roster.agents.find((a) => a.agent_id === 'a1')).toMatchObject({
      status: 'done',
      task: null,
      last_done: 100,
    });
  });
});
