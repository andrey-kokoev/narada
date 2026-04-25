import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskEvidenceAdmitCommand, taskEvidenceCommand, taskEvidenceProveCriteriaCommand } from '../../src/commands/task-evidence.js';
import { taskEvidenceAssertCompleteCommand } from '../../src/commands/task-evidence-list.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'reports'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'decisions'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'test-agent', role: 'implementer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );
}

function createTask(tempDir: string, num: number, status: string, bodyExtra = '') {
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', `20260420-${num}-test.md`),
    `---\ntask_id: ${num}\nstatus: ${status}\n---\n\n# Task ${num}: Test\n\n## Acceptance Criteria\n- [ ] Do thing A\n- [x] Do thing B\n\n${bodyExtra}`,
  );
  ensureLifecycle(tempDir, `20260420-${num}-test`);
}

function ensureLifecycle(tempDir: string, taskId: string) {
  const numberMatch = taskId.match(/-(\d+)-/);
  const taskNumber = numberMatch ? Number(numberMatch[1]) : 999;
  const path = join(tempDir, '.ai', 'do-not-open', 'tasks', `${taskId}.md`);
  const content = readFileSync(path, 'utf8');
  const status = content.match(/^status:\s*(\w+)/m)?.[1] ?? 'opened';
  const store = openTaskLifecycleStore(tempDir);
  try {
    store.upsertLifecycle({
      task_id: taskId,
      task_number: taskNumber,
      status: status as never,
      governed_by: content.match(/^governed_by:\s*(.+)$/m)?.[1] ?? null,
      closed_at: content.match(/^closed_at:\s*(.+)$/m)?.[1] ?? null,
      closed_by: content.match(/^closed_by:\s*(.+)$/m)?.[1] ?? null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: '2026-01-01T00:00:00Z',
    });
  } finally {
    store.db.close();
  }
}

function createReport(tempDir: string, taskId: string, agentId: string) {
  ensureLifecycle(tempDir, taskId);
  const reportId = `wrr_1234567890_${taskId}_${agentId}`;
  const report = {
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
  };
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'reports', `${reportId}.json`),
    JSON.stringify(report, null, 2),
  );
  const store = openTaskLifecycleStore(tempDir);
  try {
    store.insertReport({
      report_id: reportId,
      task_id: taskId,
      agent_id: agentId,
      summary: 'Done',
      changed_files_json: '[]',
      verification_json: '[]',
      submitted_at: '2026-01-01T00:00:00Z',
    });
    store.upsertReportRecord({
      report_id: reportId,
      task_id: taskId,
      assignment_id: `${taskId}-2026-01-01`,
      agent_id: agentId,
      reported_at: '2026-01-01T00:00:00Z',
      report_json: JSON.stringify(report),
    });
  } finally {
    store.db.close();
  }
  return reportId;
}

function createReview(tempDir: string, taskId: string, verdict: string) {
  ensureLifecycle(tempDir, taskId);
  const reviewId = `review-${taskId}-1234567890`;
  writeFileSync(
    join(tempDir, '.ai', 'reviews', `${reviewId}.json`),
    JSON.stringify({
      review_id: reviewId,
      reviewer_agent_id: 'reviewer',
      task_id: taskId,
      findings: [],
      verdict,
      reviewed_at: '2026-01-01T00:00:00Z',
    }, null, 2),
  );
  const store = openTaskLifecycleStore(tempDir);
  try {
    store.insertReview({
      review_id: reviewId,
      task_id: taskId,
      reviewer_agent_id: 'reviewer',
      verdict: verdict as never,
      findings_json: '[]',
      reviewed_at: '2026-01-01T00:00:00Z',
    });
  } finally {
    store.db.close();
  }
  return reviewId;
}

describe('task evidence operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-evidence-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns unknown when task file is missing', async () => {
    const result = await taskEvidenceCommand({ taskNumber: '999', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { evidence: { verdict: string } };
    expect(parsed.evidence.verdict).toBe('unknown');
  });

  it('classifies incomplete task with no evidence', async () => {
    createTask(tempDir, 100, 'opened');
    const result = await taskEvidenceCommand({ taskNumber: '100', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { evidence: { verdict: string; has_report: boolean; unchecked_count: number } };
    expect(parsed.evidence.verdict).toBe('incomplete');
    expect(parsed.evidence.has_report).toBe(false);
    expect(parsed.evidence.unchecked_count).toBe(1);
  });

  it('inspects evidence without creating an admission row', async () => {
    createTask(tempDir, 112, 'opened');
    const result = await taskEvidenceCommand({ taskNumber: '112', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLatestEvidenceAdmissionResult('20260420-112-test')).toBeUndefined();
    } finally {
      store.db.close();
    }
  });

  it('admits complete evidence explicitly for lifecycle close consumption', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-113-test.md'),
      `---\ntask_id: 113\nstatus: in_review\n---\n\n# Task 113: Test\n\n## Acceptance Criteria\n- [x] Do thing A\n\n## Execution Notes\nDone.\n\n## Verification\nTests passed.\n`,
    );

    const result = await taskEvidenceAdmitCommand({ taskNumber: '113', cwd: tempDir, by: 'test-agent', format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { admission_result: { verdict: string; lifecycle_eligible_status: string } };
    expect(parsed.admission_result.verdict).toBe('admitted');
    expect(parsed.admission_result.lifecycle_eligible_status).toBe('closed');
  });

  it('records criteria proof verification binding in output and projection', async () => {
    createTask(tempDir, 114, 'claimed', '## Execution Notes\nDone.\n\n## Verification\nTests passed.\n');

    const result = await taskEvidenceProveCriteriaCommand({
      taskNumber: '114',
      cwd: tempDir,
      by: 'test-agent',
      verificationRunId: 'vr_114',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { criteria_proof_verification: { state: string; verification_run_id?: string } };
    expect(parsed.criteria_proof_verification.state).toBe('bound');
    expect(parsed.criteria_proof_verification.verification_run_id).toBe('vr_114');
    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-114-test.md'), 'utf8');
    expect(content).toContain('criteria_proof_verification:');
    expect(content).toContain('verification_run_id: vr_114');
  });

  it('rejects criteria proof without verification posture', async () => {
    createTask(tempDir, 115, 'claimed', '## Execution Notes\nDone.\n\n## Verification\nTests passed.\n');

    const result = await taskEvidenceProveCriteriaCommand({
      taskNumber: '115',
      cwd: tempDir,
      by: 'test-agent',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('--verification-run or --no-run-rationale');
  });

  it('classifies attempt-complete task with report but open status', async () => {
    createTask(tempDir, 101, 'claimed', '## Execution Notes\nDid the work.\n');
    createReport(tempDir, '20260420-101-test', 'test-agent');
    const result = await taskEvidenceCommand({ taskNumber: '101', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { evidence: { verdict: string; has_report: boolean; has_execution_notes: boolean } };
    expect(parsed.evidence.verdict).toBe('attempt_complete');
    expect(parsed.evidence.has_report).toBe(true);
    expect(parsed.evidence.has_execution_notes).toBe(true);
  });

  it('classifies complete closed task with evidence and review', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-102-test.md'),
      `---\ntask_id: 102\nstatus: closed\n---\n\n# Task 102: Test\n\n## Acceptance Criteria\n- [x] Do thing A\n- [x] Do thing B\n\n## Execution Notes\nDone.\n\n## Verification\nTests passed.\n`,
    );
    createReport(tempDir, '20260420-102-test', 'test-agent');
    createReview(tempDir, '20260420-102-test', 'accepted');
    const result = await taskEvidenceCommand({ taskNumber: '102', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { evidence: { verdict: string; has_review: boolean; has_closure: boolean } };
    expect(parsed.evidence.verdict).toBe('complete');
    expect(parsed.evidence.has_review).toBe(true);
  });

  it('classifies direct closed task with execution notes and verification as complete', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-108-test.md'),
      `---\ntask_id: 108\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 108: Test\n\n## Acceptance Criteria\n- [x] Do thing A\n- [x] Do thing B\n\n## Execution Notes\nDone directly by operator.\n\n## Verification\nFocused check passed.\n`,
    );
    const result = await taskEvidenceCommand({ taskNumber: '108', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { evidence: { verdict: string; has_review: boolean; has_closure: boolean } };
    expect(parsed.evidence.verdict).toBe('complete');
    expect(parsed.evidence.has_review).toBe(false);
    expect(parsed.evidence.has_closure).toBe(false);
  });

  it('asserts a complete task range with bounded output', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-120-test.md'),
      `---\ntask_id: 120\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 120: Test\n\n## Acceptance Criteria\n- [x] Do thing A\n\n## Execution Notes\nDone.\n\n## Verification\nPassed.\n`,
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-121-test.md'),
      `---\ntask_id: 121\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 121: Test\n\n## Acceptance Criteria\n- [x] Do thing A\n\n## Execution Notes\nDone.\n\n## Verification\nPassed.\n`,
    );
    ensureLifecycle(tempDir, '20260420-120-test');
    ensureLifecycle(tempDir, '20260420-121-test');

    const result = await taskEvidenceAssertCompleteCommand({ range: '120-121', cwd: tempDir, format: 'human' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      checked_count: 2,
      incomplete_count: 0,
      tasks: [],
      _formatted: 'Range 120-121 complete (2 tasks checked)',
    });
  });

  it('fails a task range with concise incomplete task rows', async () => {
    createTask(tempDir, 122, 'claimed', '## Execution Notes\nDone.\n');
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-123-test.md'),
      `---\ntask_id: 123\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 123: Test\n\n## Acceptance Criteria\n- [x] Do thing A\n\n## Execution Notes\nDone.\n\n## Verification\nPassed.\n`,
    );
    ensureLifecycle(tempDir, '20260420-123-test');

    const result = await taskEvidenceAssertCompleteCommand({ range: '122-123', cwd: tempDir, format: 'human' });
    const parsed = result.result as {
      status: string;
      incomplete_count: number;
      tasks: Array<{ task_number: number; verdict: string; warnings: string[] }>;
    };

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(parsed.status).toBe('error');
    expect(parsed.incomplete_count).toBe(1);
    expect(parsed.tasks).toEqual([
      expect.objectContaining({
        task_number: 122,
        verdict: 'attempt_complete',
      }),
    ]);
    expect(JSON.stringify(parsed.tasks)).not.toContain('Execution Notes');
    expect((result.result as { _formatted?: string })._formatted).toContain('Range 122-123 has 1 incomplete task(s)');
  });

  it('classifies direct closed task without verification as needs_closure', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-109-test.md'),
      `---\ntask_id: 109\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 109: Test\n\n## Acceptance Criteria\n- [x] Do thing A\n- [x] Do thing B\n\n## Execution Notes\nDone directly by operator.\n`,
    );
    const result = await taskEvidenceCommand({ taskNumber: '109', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { evidence: { verdict: string; warnings: string[] } };
    expect(parsed.evidence.verdict).toBe('needs_closure');
    expect(parsed.evidence.warnings.some((w) => w.includes('direct closure requires execution notes and verification'))).toBe(true);
  });

  it('classifies needs-review task in_review without review', async () => {
    createTask(tempDir, 103, 'in_review', '## Execution Notes\nDone.\n');
    createReport(tempDir, '20260420-103-test', 'test-agent');
    const result = await taskEvidenceCommand({ taskNumber: '103', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { evidence: { verdict: string; has_review: boolean } };
    expect(parsed.evidence.verdict).toBe('needs_review');
    expect(parsed.evidence.has_review).toBe(false);
  });

  it('detects raw terminal mutation without governed provenance', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-110-test.md'),
      `---\ntask_id: 110\nstatus: closed\n---\n\n# Task 110: Test\n\n## Acceptance Criteria\n- [x] Do thing A\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );
    const result = await taskEvidenceCommand({ taskNumber: '110', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { evidence: { verdict: string; violations: string[]; has_governed_provenance: boolean } };
    expect(parsed.evidence.verdict).toBe('needs_closure');
    expect(parsed.evidence.has_governed_provenance).toBe(false);
    expect(parsed.evidence.violations).toContain('terminal_without_governed_provenance');
  });

  it('returns human-readable output', async () => {
    createTask(tempDir, 104, 'opened');
    const result = await taskEvidenceCommand({ taskNumber: '104', cwd: tempDir, format: 'human' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const text = result.result as string;
    expect(text).toContain('verdict:');
    expect(text).toContain('incomplete');
  });

  it('detects verification section', async () => {
    createTask(tempDir, 105, 'opened', '## Verification\nRan tests.\n');
    const result = await taskEvidenceCommand({ taskNumber: '105', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { evidence: { has_verification: boolean } };
    expect(parsed.evidence.has_verification).toBe(true);
  });

  it('detects governed verification runs from SQLite as verification', async () => {
    // Create task WITHOUT markdown verification section
    createTask(tempDir, 111, 'claimed', '## Execution Notes\nDid the work.\n');
    createReport(tempDir, '20260420-111-test', 'test-agent');

    // Seed the task in SQLite lifecycle store
    const store = openTaskLifecycleStore(tempDir);
    store.upsertLifecycle({
      task_id: '20260420-111-test',
      task_number: 111,
      status: 'claimed',
      governed_by: null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: new Date().toISOString(),
    });

    // Insert a verification run for this task
    store.insertVerificationRun({
      run_id: 'run_111',
      request_id: 'req_111',
      task_id: '20260420-111-test',
      target_command: 'echo test',
      scope: 'focused',
      timeout_seconds: 60,
      requester_identity: 'a3',
      requested_at: new Date().toISOString(),
      status: 'passed',
      exit_code: 0,
      duration_ms: 42,
      metrics_json: null,
      stdout_digest: null,
      stderr_digest: null,
      stdout_excerpt: null,
      stderr_excerpt: null,
      completed_at: new Date().toISOString(),
    });
    store.db.close();

    const result = await taskEvidenceCommand({ taskNumber: '111', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { evidence: { has_verification: boolean; verdict: string } };
    expect(parsed.evidence.has_verification).toBe(true);
    // With execution notes + verification + report, should be attempt_complete
    expect(parsed.evidence.verdict).toBe('attempt_complete');
  });

  it('classifies in_review with accepted review as needs_closure', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-106-test.md'),
      `---\ntask_id: 106\nstatus: in_review\n---\n\n# Task 106: Test\n\n## Acceptance Criteria\n- [x] Do thing A\n- [x] Do thing B\n\n## Execution Notes\nDone.\n`,
    );
    createReport(tempDir, '20260420-106-test', 'test-agent');
    createReview(tempDir, '20260420-106-test', 'accepted');
    const result = await taskEvidenceCommand({ taskNumber: '106', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { evidence: { verdict: string; has_review: boolean; has_closure: boolean } };
    expect(parsed.evidence.verdict).toBe('needs_closure');
    expect(parsed.evidence.has_review).toBe(true);
    expect(parsed.evidence.has_closure).toBe(false);
  });

  it('classifies in_review with rejected review as incomplete', async () => {
    createTask(tempDir, 107, 'in_review', '## Execution Notes\nDone.\n');
    createReport(tempDir, '20260420-107-test', 'test-agent');
    createReview(tempDir, '20260420-107-test', 'rejected');
    const result = await taskEvidenceCommand({ taskNumber: '107', cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { evidence: { verdict: string; warnings: string[] } };
    expect(parsed.evidence.verdict).toBe('incomplete');
    expect(parsed.evidence.warnings.some((w) => w.includes('rejected'))).toBe(true);
  });
});
