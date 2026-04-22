import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskReportCommand } from '../../src/commands/task-report.js';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'reports'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'learning', 'accepted'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'test-agent', role: 'implementer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'other-agent', role: 'implementer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );

  writeFileSync(
    join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Test Task\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'learning', 'accepted', '20260422-004-report.json'),
    JSON.stringify({
      artifact_id: '20260422-004',
      state: 'accepted',
      title: 'Report completeness',
      content: {
        principle: 'Work result reports must include changed files and verification evidence.',
      },
      scopes: ['report', 'task-governance'],
    }, null, 2),
  );
}

describe('task report operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-report-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('submits report for claimed task and transitions to in_review', async () => {
    // Claim the task first
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Implemented feature X',
      changedFiles: 'src/foo.ts,src/bar.ts',
      verification: JSON.stringify([{ command: 'pnpm test', result: 'passed' }]),
      residuals: JSON.stringify(['Edge case not covered']),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      agent_id: 'test-agent',
      new_status: 'in_review',
    });

    const parsed = result.result as { guidance: unknown[] };
    expect(parsed.guidance.length).toBeGreaterThan(0);
    expect(parsed.guidance[0]).toMatchObject({
      artifact_id: '20260422-004',
    });

    // Task file updated to in_review
    const taskContent = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: in_review');

    // Report file created
    const reportsDir = join(tempDir, '.ai', 'tasks', 'reports');
    const reportFiles = readdirSync(reportsDir).filter((f) => f.endsWith('.json'));
    expect(reportFiles).toHaveLength(1);

    const reportRaw = readFileSync(join(reportsDir, reportFiles[0]!), 'utf8');
    const report = JSON.parse(reportRaw);
    expect(report.task_id).toBe('20260420-999-test-task');
    expect(report.agent_id).toBe('test-agent');
    expect(report.summary).toBe('Implemented feature X');
    expect(report.changed_files).toEqual(['src/foo.ts', 'src/bar.ts']);
    expect(report.verification).toEqual([{ command: 'pnpm test', result: 'passed' }]);
    expect(report.known_residuals).toEqual(['Edge case not covered']);
    expect(report.report_status).toBe('submitted');

    // Assignment released
    const assignmentRaw = readFileSync(join(tempDir, '.ai', 'tasks', 'assignments', '20260420-999-test-task.json'), 'utf8');
    const assignment = JSON.parse(assignmentRaw);
    expect(assignment.assignments[0].release_reason).toBe('completed');
    expect(assignment.assignments[0].released_at).not.toBeNull();

    // Roster updated
    const rosterRaw = readFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), 'utf8');
    const roster = JSON.parse(rosterRaw);
    const agent = roster.agents.find((a: { agent_id: string }) => a.agent_id === 'test-agent');
    expect(agent.status).toBe('done');
    expect(agent.task).toBeNull();
    expect(agent.last_done).toBe(999);
  });

  it('fails for unclaimed task', async () => {
    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Should fail',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('cannot be reported');
    expect((result.result as { error: string }).error).toContain('expected: claimed');
  });

  it('fails when a different agent reports', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'other-agent',
      summary: 'Should fail',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('claimed by test-agent');
  });

  it('fails without summary', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('--summary is required');
  });

  it('fails for nonexistent task', async () => {
    const result = await taskReportCommand({
      taskNumber: '000',
      agent: 'test-agent',
      summary: 'Should fail',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('Task not found');
  });

  it('fails with invalid verification JSON', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Test',
      verification: 'not-json',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('Failed to parse verification');
  });

  it('fails with invalid residuals JSON', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Test',
      residuals: 'not-json',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('Failed to parse residuals');
  });

  it('preserves multiple reports append-only', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    // First report
    await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'First attempt',
      cwd: tempDir,
      format: 'json',
    });

    // Reset task to claimed (simulate re-claim after review rejection)
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: claimed\n---\n\n# Task 999: Test Task\n',
    );

    // Clear assignment released state for re-claim simulation
    writeFileSync(
      join(tempDir, '.ai', 'tasks', 'assignments', '20260420-999-test-task.json'),
      JSON.stringify({
        task_id: '20260420-999-test-task',
        assignments: [{
          agent_id: 'test-agent',
          claimed_at: new Date().toISOString(),
          claim_context: null,
          released_at: null,
          release_reason: null,
        }],
      }, null, 2),
    );

    // Second report
    await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Second attempt',
      cwd: tempDir,
      format: 'json',
    });

    const reportsDir = join(tempDir, '.ai', 'tasks', 'reports');
    const reportFiles = readdirSync(reportsDir).filter((f) => f.endsWith('.json'));
    expect(reportFiles).toHaveLength(2);
  });
});
