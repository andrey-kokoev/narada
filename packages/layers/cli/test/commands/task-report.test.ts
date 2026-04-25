import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskReportCommand } from '../../src/commands/task-report.js';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import type { TaskAssignmentRecord } from '../../src/lib/task-governance.js';
import { openTaskLifecycleStore, type ReportRecordRow } from '../../src/lib/task-lifecycle-store.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'reports'), { recursive: true });
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
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
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

function listReportRecords(tempDir: string): ReportRecordRow[] {
  const store = openTaskLifecycleStore(tempDir);
  try {
    return store.listReportRecords('20260420-999-test-task');
  } finally {
    store.db.close();
  }
}

function getAssignmentRecord(tempDir: string): TaskAssignmentRecord {
  const store = openTaskLifecycleStore(tempDir);
  try {
    const record = store.getAssignmentRecord('20260420-999-test-task');
    if (!record) throw new Error('missing assignment record');
    return JSON.parse(record.record_json) as TaskAssignmentRecord;
  } finally {
    store.db.close();
  }
}

function saveAssignmentRecord(tempDir: string, record: TaskAssignmentRecord): void {
  const store = openTaskLifecycleStore(tempDir);
  try {
    store.upsertAssignmentRecord({
      task_id: record.task_id,
      record_json: JSON.stringify(record),
      updated_at: new Date().toISOString(),
    });
  } finally {
    store.db.close();
  }
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

    expect(result.result).not.toHaveProperty('guidance');

    // Task file updated to in_review
    const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: in_review');

    // Authoritative report record created
    const reportRecords = listReportRecords(tempDir);
    expect(reportRecords).toHaveLength(1);

    const report = JSON.parse(reportRecords[0]!.report_json);
    expect(report.task_id).toBe('20260420-999-test-task');
    expect(report.agent_id).toBe('test-agent');
    expect(report.summary).toBe('Implemented feature X');
    expect(report.changed_files).toEqual(['src/foo.ts', 'src/bar.ts']);
    expect(report.verification).toEqual([{ command: 'pnpm test', result: 'passed' }]);
    expect(report.known_residuals).toEqual(['Edge case not covered']);
    expect(report.report_status).toBe('submitted');

    // Assignment released
    const assignment = getAssignmentRecord(tempDir);
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

  it('includes guidance in JSON only when verbose is set', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Implemented feature X',
      cwd: tempDir,
      format: 'json',
      verbose: true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { guidance: unknown[] };
    expect(parsed.guidance.length).toBeGreaterThan(0);
    expect(parsed.guidance[0]).toMatchObject({
      artifact_id: '20260422-004',
    });
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

  it('is idempotent: repeated report on same assignment does not create duplicate', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    // First report
    const firstResult = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'First attempt',
      cwd: tempDir,
      format: 'json',
    });

    expect(firstResult.exitCode).toBe(ExitCode.SUCCESS);
    const firstReportId = (firstResult.result as { report_id: string }).report_id;

    const reportRecordsAfterFirst = listReportRecords(tempDir);
    expect(reportRecordsAfterFirst).toHaveLength(1);

    // Reset task to claimed and assignment to active (same claimed_at)
    // to simulate an accidental re-invocation before the first report finished
    const assignment = getAssignmentRecord(tempDir);
    assignment.assignments[0].released_at = null;
    assignment.assignments[0].release_reason = null;
    saveAssignmentRecord(tempDir, assignment);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: claimed\n---\n\n# Task 999: Test Task\n',
    );

    // Second report (same assignment) — should return existing without creating duplicate
    const secondResult = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Second attempt',
      cwd: tempDir,
      format: 'json',
    });

    expect(secondResult.exitCode).toBe(ExitCode.SUCCESS);
    const secondReportId = (secondResult.result as { report_id: string }).report_id;
    expect(secondReportId).toBe(firstReportId);

    const reportRecordsAfterSecond = listReportRecords(tempDir);
    expect(reportRecordsAfterSecond).toHaveLength(1);

    const note = (secondResult.result as { note?: string }).note;
    expect(note).toContain('already exists');
  });

  it('creates a new report after re-claim with a different assignment', async () => {
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
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: claimed\n---\n\n# Task 999: Test Task\n',
    );

    // Clear assignment released state for re-claim simulation with NEW claimed_at
    const newClaimedAt = new Date().toISOString();
    saveAssignmentRecord(tempDir, {
      task_id: '20260420-999-test-task',
      assignments: [{
        agent_id: 'test-agent',
        claimed_at: newClaimedAt,
        claim_context: null,
        released_at: null,
        release_reason: null,
      }],
    });

    // Second report — different assignment_id due to new claimed_at
    const secondResult = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Second attempt',
      cwd: tempDir,
      format: 'json',
    });

    expect(secondResult.exitCode).toBe(ExitCode.SUCCESS);
    const reportRecords = listReportRecords(tempDir);
    expect(reportRecords).toHaveLength(2);
  });

  it('scaffolds missing Execution Notes and Verification sections into task file', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Implemented feature X',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('## Execution Notes');
    expect(taskContent).toContain('<!-- Record what was done, decisions made, and files changed. -->');
    expect(taskContent).toContain('## Verification');
    expect(taskContent).toContain('<!-- Record commands run, results observed, and how correctness was checked. -->');
  });

  it('does not duplicate sections if they already exist', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Test Task\n\n## Execution Notes\nAlready present.\n\n## Verification\nAlready present.\n',
    );

    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Implemented feature X',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    const executionNotesCount = (taskContent.match(/## Execution Notes/g) || []).length;
    const verificationCount = (taskContent.match(/## Verification/g) || []).length;
    expect(executionNotesCount).toBe(1);
    expect(verificationCount).toBe(1);
  });

  it('human default output is terse and omits guidance', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => { logs.push(msg); });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Implemented feature X',
      cwd: tempDir,
      format: 'human',
    });

    spy.mockRestore();
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const hasGuidance = logs.some((l) => l.includes('Active guidance:'));
    expect(hasGuidance).toBe(false);
  });

  it('human verbose output includes guidance', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => { logs.push(msg); });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Implemented feature X',
      cwd: tempDir,
      format: 'human',
      verbose: true,
    });

    spy.mockRestore();
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const hasGuidance = logs.some((l) => l.includes('Active guidance:'));
    expect(hasGuidance).toBe(true);
  });
});
