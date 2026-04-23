import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskContinueCommand } from '../../src/commands/task-continue.js';
import { taskReportCommand } from '../../src/commands/task-report.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'reports'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'learning', 'accepted'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'alpha', role: 'implementer', capabilities: ['typescript'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z', status: 'working', task: 100 },
        { agent_id: 'beta', role: 'implementer', capabilities: ['testing'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z', status: 'done', task: null },
        { agent_id: 'gamma', role: 'reviewer', capabilities: ['architecture'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z', status: 'done', task: null },
      ],
    }, null, 2),
  );

  // Task 100: claimed by alpha
  writeFileSync(
    join(tempDir, '.ai', 'tasks', '20260420-100-claimed-task.md'),
    '---\ntask_id: 100\nstatus: claimed\n---\n\n# Task 100: Claimed Task\n\nSome implementation work.\n',
  );

  // Task 101: needs_continuation
  writeFileSync(
    join(tempDir, '.ai', 'tasks', '20260420-101-needs-continuation.md'),
    '---\ntask_id: 101\nstatus: needs_continuation\n---\n\n# Task 101: Needs Continuation\n\nPartial work done.\n',
  );

  // Task 102: opened
  writeFileSync(
    join(tempDir, '.ai', 'tasks', '20260420-102-opened-task.md'),
    '---\ntask_id: 102\nstatus: opened\n---\n\n# Task 102: Opened Task\n\nNew task.\n',
  );

  // Pre-seed assignment for task 100 (alpha claimed it)
  writeFileSync(
    join(tempDir, '.ai', 'tasks', 'assignments', '20260420-100-claimed-task.json'),
    JSON.stringify({
      task_id: '20260420-100-claimed-task',
      assignments: [
        {
          agent_id: 'alpha',
          claimed_at: '2026-04-20T10:00:00Z',
          claim_context: null,
          released_at: null,
          release_reason: null,
        },
      ],
    }, null, 2),
  );

  // Pre-seed assignment for task 101 (alpha completed first phase)
  writeFileSync(
    join(tempDir, '.ai', 'tasks', 'assignments', '20260420-101-needs-continuation.json'),
    JSON.stringify({
      task_id: '20260420-101-needs-continuation',
      assignments: [
        {
          agent_id: 'alpha',
          claimed_at: '2026-04-20T10:00:00Z',
          claim_context: null,
          released_at: '2026-04-20T12:00:00Z',
          release_reason: 'completed',
        },
      ],
    }, null, 2),
  );
}

describe('task continue operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-continue-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('continues a claimed task for evidence_repair without releasing prior', async () => {
    const result = await taskContinueCommand({
      taskNumber: '100',
      agent: 'beta',
      reason: 'evidence_repair',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { supersedes: boolean; previous_agent_id: string };
    expect(rec.supersedes).toBe(false);
    expect(rec.previous_agent_id).toBe('alpha');

    // Assignment record should show alpha still active + beta as continuation
    const assignment = JSON.parse(readFileSync(join(tempDir, '.ai', 'tasks', 'assignments', '20260420-100-claimed-task.json'), 'utf8'));
    expect(assignment.assignments).toHaveLength(1);
    expect(assignment.assignments[0].agent_id).toBe('alpha');
    expect(assignment.assignments[0].released_at).toBeNull();
    expect(assignment.continuations).toHaveLength(1);
    expect(assignment.continuations[0].agent_id).toBe('beta');
    expect(assignment.continuations[0].reason).toBe('evidence_repair');
  });

  it('takeover (handoff) releases prior active assignment and creates new primary', async () => {
    const result = await taskContinueCommand({
      taskNumber: '100',
      agent: 'beta',
      reason: 'handoff',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { supersedes: boolean; previous_agent_id: string };
    expect(rec.supersedes).toBe(true);
    expect(rec.previous_agent_id).toBe('alpha');

    const assignment = JSON.parse(readFileSync(join(tempDir, '.ai', 'tasks', 'assignments', '20260420-100-claimed-task.json'), 'utf8'));
    expect(assignment.assignments).toHaveLength(2);
    expect(assignment.assignments[0].agent_id).toBe('alpha');
    expect(assignment.assignments[0].released_at).not.toBeNull();
    expect(assignment.assignments[0].release_reason).toBe('continued');
    expect(assignment.assignments[1].agent_id).toBe('beta');
    expect(assignment.assignments[1].released_at).toBeNull();
    expect(assignment.assignments[1].continuation_reason).toBe('handoff');
    expect(assignment.assignments[1].previous_agent_id).toBe('alpha');
  });

  it('transitions needs_continuation to claimed on takeover', async () => {
    // First claim task 101 for alpha (needs_continuation)
    writeFileSync(
      join(tempDir, '.ai', 'tasks', 'assignments', '20260420-101-needs-continuation.json'),
      JSON.stringify({
        task_id: '20260420-101-needs-continuation',
        assignments: [
          {
            agent_id: 'alpha',
            claimed_at: '2026-04-20T10:00:00Z',
            claim_context: null,
            released_at: null,
            release_reason: null,
          },
        ],
      }, null, 2),
    );

    const result = await taskContinueCommand({
      taskNumber: '101',
      agent: 'beta',
      reason: 'blocked_agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Task status should now be claimed
    const taskBody = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-101-needs-continuation.md'), 'utf8');
    expect(taskBody).toContain('status: claimed');
  });

  it('rejects invalid reasons', async () => {
    const result = await taskContinueCommand({
      taskNumber: '100',
      agent: 'beta',
      reason: 'invalid_reason' as 'handoff',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const rec = result.result as { error: string };
    expect(rec.error).toContain('Invalid reason');
  });

  it('rejects opened tasks with guidance to use claim instead', async () => {
    const result = await taskContinueCommand({
      taskNumber: '102',
      agent: 'beta',
      reason: 'evidence_repair',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const rec = result.result as { error: string };
    expect(rec.error).toContain('opened');
    expect(rec.error).toContain('task claim');
  });

  it('rejects when agent is already the active assignee', async () => {
    const result = await taskContinueCommand({
      taskNumber: '100',
      agent: 'alpha',
      reason: 'evidence_repair',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const rec = result.result as { error: string };
    expect(rec.error).toContain('already the active assignee');
  });

  it('preserves prior assignment history on takeover', async () => {
    await taskContinueCommand({
      taskNumber: '100',
      agent: 'beta',
      reason: 'operator_override',
      cwd: tempDir,
      format: 'json',
    });

    const assignment = JSON.parse(readFileSync(join(tempDir, '.ai', 'tasks', 'assignments', '20260420-100-claimed-task.json'), 'utf8'));
    expect(assignment.assignments).toHaveLength(2);
    expect(assignment.assignments[0].agent_id).toBe('alpha');
    expect(assignment.assignments[0].claimed_at).toBe('2026-04-20T10:00:00Z');
  });

  it('sets intent to takeover on handoff', async () => {
    const result = await taskContinueCommand({
      taskNumber: '100',
      agent: 'beta',
      reason: 'handoff',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const assignment = JSON.parse(readFileSync(join(tempDir, '.ai', 'tasks', 'assignments', '20260420-100-claimed-task.json'), 'utf8'));
    expect(assignment.assignments[1].intent).toBe('takeover');
  });

  it('sets intent to repair on evidence_repair', async () => {
    const result = await taskContinueCommand({
      taskNumber: '100',
      agent: 'beta',
      reason: 'evidence_repair',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const assignment = JSON.parse(readFileSync(join(tempDir, '.ai', 'tasks', 'assignments', '20260420-100-claimed-task.json'), 'utf8'));
    expect(assignment.continuations[0].intent).toBeUndefined();
    // Continuations do not carry intent; intent is assignment-level only
  });

  it('updates roster to show continuation agent as working', async () => {
    await taskContinueCommand({
      taskNumber: '100',
      agent: 'beta',
      reason: 'evidence_repair',
      cwd: tempDir,
      format: 'json',
    });

    const roster = JSON.parse(readFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), 'utf8'));
    const beta = roster.agents.find((a: { agent_id: string }) => a.agent_id === 'beta');
    expect(beta.status).toBe('working');
    expect(beta.task).toBe(100);
  });

  it('allows task report from continuation agent', async () => {
    // First continue task 100 as beta for evidence_repair
    await taskContinueCommand({
      taskNumber: '100',
      agent: 'beta',
      reason: 'evidence_repair',
      cwd: tempDir,
      format: 'json',
    });

    // Then beta reports
    const reportResult = await taskReportCommand({
      taskNumber: '100',
      agent: 'beta',
      summary: 'Fixed the evidence',
      cwd: tempDir,
      format: 'json',
    });

    expect(reportResult.exitCode).toBe(ExitCode.SUCCESS);
    const rec = reportResult.result as { report_id: string };
    expect(rec.report_id).toBeDefined();

    // Primary assignment (alpha) should still be active
    const assignment = JSON.parse(readFileSync(join(tempDir, '.ai', 'tasks', 'assignments', '20260420-100-claimed-task.json'), 'utf8'));
    expect(assignment.assignments[0].agent_id).toBe('alpha');
    expect(assignment.assignments[0].released_at).toBeNull();

    // Continuation should be marked completed
    expect(assignment.continuations[0].completed_at).toBeDefined();

    // Task status should still be claimed (not in_review)
    const taskBody = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-100-claimed-task.md'), 'utf8');
    expect(taskBody).toContain('status: claimed');
  });

  it('allows task report from primary agent after continuation', async () => {
    // Continue task 100 as beta for evidence_repair
    await taskContinueCommand({
      taskNumber: '100',
      agent: 'beta',
      reason: 'evidence_repair',
      cwd: tempDir,
      format: 'json',
    });

    // Alpha (primary) still reports normally
    const reportResult = await taskReportCommand({
      taskNumber: '100',
      agent: 'alpha',
      summary: 'Done with main work',
      cwd: tempDir,
      format: 'json',
    });

    expect(reportResult.exitCode).toBe(ExitCode.SUCCESS);

    // Task should be in_review
    const taskBody = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-100-claimed-task.md'), 'utf8');
    expect(taskBody).toContain('status: in_review');
  });
});
