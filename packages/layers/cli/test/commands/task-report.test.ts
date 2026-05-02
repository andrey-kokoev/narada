import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskReportCommand } from '../../src/commands/task-report.js';
import { taskReviewRequestCommand } from '../../src/commands/task-review-request.js';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { taskEvidenceCommand } from '../../src/commands/task-evidence.js';
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
        { agent_id: 'builder', role: 'builder', capabilities: ['claim', 'execute'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'architect', role: 'architect', capabilities: ['propose', 'review'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'reviewer-1', role: 'reviewer', capabilities: ['review'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );
  const store = openTaskLifecycleStore(tempDir);
  try {
    for (const agent of [
      { agent_id: 'test-agent', role: 'implementer', capabilities: ['claim'] },
      { agent_id: 'other-agent', role: 'implementer', capabilities: ['claim'] },
      { agent_id: 'builder', role: 'builder', capabilities: ['claim', 'execute'] },
      { agent_id: 'architect', role: 'architect', capabilities: ['propose', 'review'] },
      { agent_id: 'reviewer-1', role: 'reviewer', capabilities: ['review'] },
    ]) {
      store.upsertRosterEntry({
        agent_id: agent.agent_id,
        role: agent.role,
        capabilities_json: JSON.stringify(agent.capabilities),
        first_seen_at: '2026-01-01T00:00:00Z',
        last_active_at: '2026-01-01T00:00:00Z',
        status: 'idle',
        task_number: null,
        last_done: null,
        updated_at: '2026-01-01T00:00:00Z',
      });
    }
  } finally {
    store.db.close();
  }

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

function listDirectedObligations(tempDir: string, targetAgent: string, targetRole?: string) {
  const store = openTaskLifecycleStore(tempDir);
  try {
    return store.listDirectedObligationsForTarget(targetAgent, targetRole ?? null, 'open');
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
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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

    // Roster authority updated
    const store = openTaskLifecycleStore(tempDir);
    try {
      const agent = store.getRosterEntry('test-agent');
      expect(agent?.status).toBe('done');
      expect(agent?.task_number).toBeNull();
      expect(agent?.last_done).toBe(999);
    } finally {
      store.db.close();
    }
  });

  it('creates a directed review obligation for an exact reviewer identity', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      reviewer: 'architect',
      summary: 'Ready for architecture review',
      verification: JSON.stringify([{ command: 'pnpm test', result: 'passed' }]),
      residuals: JSON.stringify([]),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      review_target: {
        requested: 'architect',
        target_agent_id: 'architect',
        target_role: 'architect',
        resolution: 'agent_id',
        review_authority: {
          authority_kind: 'typed_composition',
        },
      },
    });
    expect((result.result as { obligation_id?: string }).obligation_id).toMatch(/^obl_review_/);

    const obligations = listDirectedObligations(tempDir, 'architect', 'architect');
    expect(obligations).toHaveLength(1);
    expect(obligations[0]).toMatchObject({
      source_kind: 'task_report',
      source_agent_id: 'test-agent',
      target_agent_id: 'architect',
      target_role: 'architect',
      kind: 'review_request',
      status: 'open',
      task_number: 999,
    });
    expect(JSON.parse(obligations[0]!.consumption_rule_json)).toMatchObject({
      consume_on: expect.arrayContaining(['task_review', 'task_defer', 'delegation', 'rejection', 'completion']),
    });
  });

  it('submits a report from a JSON report file', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    const reportFile = join(tempDir, 'task-999-report.json');
    writeFileSync(reportFile, JSON.stringify({
      summary: 'Implemented from report file',
      changed_files: ['src/file-backed.ts'],
      verification: [{ command: 'pnpm test -- task-report', result: 'passed' }],
      residuals: ['none'],
    }));

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      reportFile,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const report = JSON.parse(listReportRecords(tempDir)[0]!.report_json);
    expect(report.summary).toBe('Implemented from report file');
    expect(report.changed_files).toEqual(['src/file-backed.ts']);
    expect(report.verification).toEqual([{ command: 'pnpm test -- task-report', result: 'passed' }]);
    expect(report.known_residuals).toEqual(['none']);
  });

  it('creates a post-hoc review request from existing report evidence', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    const reported = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Ready for post-hoc review request',
      changedFiles: 'src/foo.ts',
      verification: JSON.stringify([{ command: 'pnpm test', result: 'passed' }]),
      cwd: tempDir,
      format: 'json',
    });

    const requested = await taskReviewRequestCommand({
      taskNumber: '999',
      agent: 'test-agent',
      reviewer: 'architect',
      cwd: tempDir,
      format: 'json',
    });

    expect(requested.exitCode).toBe(ExitCode.SUCCESS);
    expect(requested.result).toMatchObject({
      status: 'success',
      action: 'created',
      report_id: (reported.result as { report_id: string }).report_id,
      review_target: {
        target_agent_id: 'architect',
      },
    });
    const obligations = listDirectedObligations(tempDir, 'architect', 'architect');
    expect(obligations).toHaveLength(1);
    const evidence = JSON.parse(obligations[0]!.evidence_json);
    expect(evidence.changed_files).toEqual(['src/foo.ts']);
    expect(evidence.verification).toEqual([{ command: 'pnpm test', result: 'passed' }]);
  });

  it('creates a directed review obligation for a unique reviewer role alias', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      reviewer: 'reviewer',
      summary: 'Ready for role-addressed review',
      verification: JSON.stringify([{ command: 'pnpm test', result: 'passed' }]),
      residuals: JSON.stringify([]),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      review_target: {
        requested: 'reviewer',
        target_agent_id: 'reviewer-1',
        target_role: 'reviewer',
        resolution: 'unique_role_alias',
      },
    });
    expect(listDirectedObligations(tempDir, 'reviewer-1', 'reviewer')).toHaveLength(1);
  });

  it('does not create a report-time review obligation for a target task review would refuse', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      reviewer: 'other-agent',
      summary: 'Ready for invalid review target',
      verification: JSON.stringify([{ command: 'pnpm test', result: 'passed' }]),
      residuals: JSON.stringify([]),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      review_authority_repair: {
        reason: 'review_authority_not_admitted',
      },
    });
    expect((result.result as { error: string }).error).toContain('task review would refuse');
    expect(listDirectedObligations(tempDir, 'other-agent', 'implementer')).toHaveLength(0);
  });

  it('does not create a post-hoc review request for a target task review would refuse', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Ready for post-hoc invalid review request',
      changedFiles: 'src/foo.ts',
      verification: JSON.stringify([{ command: 'pnpm test', result: 'passed' }]),
      cwd: tempDir,
      format: 'json',
    });

    const requested = await taskReviewRequestCommand({
      taskNumber: '999',
      agent: 'test-agent',
      reviewer: 'other-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(requested.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(requested.result).toMatchObject({
      status: 'error',
      review_authority_repair: {
        reason: 'review_authority_not_admitted',
      },
    });
    expect((requested.result as { error: string }).error).toContain('task review would refuse');
    expect(listDirectedObligations(tempDir, 'other-agent', 'implementer')).toHaveLength(0);
  });

  it('blocks Architect report on Builder-owned task unless durable override rationale is supplied', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'builder', cwd: tempDir, format: 'json' });

    const blocked = await taskReportCommand({
      taskNumber: '999',
      agent: 'architect',
      summary: 'Architect should not execute Builder work',
      cwd: tempDir,
      format: 'json',
    });

    expect(blocked.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((blocked.result as { error: string }).error).toContain('Role guard');

    const overridden = await taskReportCommand({
      taskNumber: '999',
      agent: 'architect',
      summary: 'Emergency evidence repair',
      changedFiles: 'src/foo.ts',
      verification: JSON.stringify([{ command: 'manual inspection', result: 'passed' }]),
      residuals: JSON.stringify([]),
      cwd: tempDir,
      format: 'json',
      overrideRationale: 'Builder unavailable; Operator directed emergency report repair.',
    });

    expect(overridden.exitCode).toBe(ExitCode.SUCCESS);
    expect(overridden.result).toMatchObject({
      status: 'success',
      role_guard_override: {
        actor: 'architect',
        owner_agent_id: 'builder',
        rationale: 'Builder unavailable; Operator directed emergency report repair.',
      },
    });

    const evidence = await taskEvidenceCommand({ cwd: tempDir, taskNumber: '999', format: 'json' });
    const parsed = evidence.result as { role_guard_overrides: Array<{ actor: string; owner_agent_id: string; rationale: string }> };
    expect(parsed.role_guard_overrides).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actor: 'architect',
        owner_agent_id: 'builder',
        rationale: 'Builder unavailable; Operator directed emergency report repair.',
      }),
    ]));
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
    const error = (result.result as { error: string }).error;
    expect(error).toContain('Failed to parse verification');
    expect(error).toContain('Expected --verification to be a JSON array');
    expect(error).toContain('Example: --verification');
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
