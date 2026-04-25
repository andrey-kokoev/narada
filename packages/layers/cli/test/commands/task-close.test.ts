import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskCloseCommand } from '../../src/commands/task-close.js';
import { taskEvidenceProveCriteriaCommand } from '../../src/commands/task-evidence.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '@narada2/control-plane';
import { openTaskLifecycleStore, SqliteTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { loadAssignment } from '../../src/lib/task-governance.js';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
}

function writeTask(tempDir: string, num: number, status: string, bodyExtra = '') {
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', `20260420-${num}-test.md`),
    `---\ntask_id: ${num}\nstatus: ${status}\n---\n\n# Task ${num}: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n- [x] Criterion B\n\n${bodyExtra}`,
  );
}

describe('task close operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-close-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('closes a task with complete evidence', async () => {
    writeTask(
      tempDir,
      100,
      'in_review',
      '## Execution Notes\nDid the work.\n\n## Verification\nTests pass.\n',
    );

    const result = await taskCloseCommand({
      taskNumber: '100',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; new_status: string; closed_by: string; closure_mode: string };
    expect(r.status).toBe('success');
    expect(r.new_status).toBe('closed');
    expect(r.closed_by).toBe('operator-1');
    expect(r.closure_mode).toBe('operator_direct');

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'), 'utf8');
    expect(content).toContain('status: closed');
    expect(content).toContain('closed_by: operator-1');
    expect(content).toContain('closure_mode: operator_direct');
    expect(content).toContain('closed_at:');
  });

  it('allows direct close from opened when closure gates are satisfied', async () => {
    writeTask(
      tempDir,
      108,
      'opened',
      '## Execution Notes\nDid the work.\n\n## Verification\nTests pass.\n',
    );

    const result = await taskCloseCommand({
      taskNumber: '108',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; new_status: string; closed_by: string };
    expect(r.status).toBe('success');
    expect(r.new_status).toBe('closed');
    expect(r.closed_by).toBe('operator-1');

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-108-test.md'), 'utf8');
    expect(content).toContain('status: closed');
  });

  it('fails with unchecked criteria', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-101-test.md'),
      `---\ntask_id: 101\nstatus: in_review\n---\n\n# Task 101: Test\n\n## Acceptance Criteria\n- [ ] Unchecked A\n- [x] Checked B\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '101',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; gate_failures: string[]; violations: string[] };
    expect(r.status).toBe('error');
    expect(r.gate_failures.some((f) => f.includes('acceptance criteria'))).toBe(true);
    // Violations are only computed for terminal tasks; this task is in_review
    expect(r.violations).toEqual([]);

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-101-test.md'), 'utf8');
    expect(content).toContain('status: in_review');
  });

  it('closes after criteria are proved through Evidence Admission', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-109-test.md'),
      `---\ntask_id: 109\nstatus: in_review\n---\n\n# Task 109: Test\n\n## Acceptance Criteria\n- [ ] Unchecked A\n- [ ] Unchecked B\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    const proof = await taskEvidenceProveCriteriaCommand({
      taskNumber: '109',
      by: 'operator-1',
      cwd: tempDir,
      noRunRationale: 'Focused close test proof.',
      format: 'json',
    });
    expect(proof.exitCode).toBe(ExitCode.SUCCESS);
    const proofResult = proof.result as { status: string; checked_criteria: number; admission_result: { verdict: string } };
    expect(proofResult.status).toBe('success');
    expect(proofResult.checked_criteria).toBe(2);
    expect(proofResult.admission_result.verdict).toBe('admitted');

    const close = await taskCloseCommand({
      taskNumber: '109',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });
    expect(close.exitCode).toBe(ExitCode.SUCCESS);
    expect((close.result as { new_status: string }).new_status).toBe('closed');
  });

  it('uses durable criteria proof rows over unchecked markdown projection', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1091-test.md'),
      `---\ntask_id: 1091\nstatus: in_review\n---\n\n# Task 1091: Test\n\n## Acceptance Criteria\n- [ ] Markdown remains unchecked\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );
    const store = openTaskLifecycleStore(tempDir);
    store.upsertLifecycle({
      task_id: '20260420-1091-test',
      task_number: 1091,
      status: 'in_review',
      governed_by: null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: '2026-04-25T00:00:00Z',
    });
    store.upsertEvidenceBundle({
      bundle_id: 'evb-criteria-1091',
      task_id: '20260420-1091-test',
      task_number: 1091,
      report_ids_json: '[]',
      verification_run_ids_json: '[]',
      acceptance_criteria_json: JSON.stringify({ all_checked: true, unchecked_count: 0 }),
      review_ids_json: '[]',
      changed_files_json: '[]',
      residuals_json: '[]',
      assembled_at: '2026-04-25T00:00:00Z',
      assembled_by: 'operator-1',
    });
    store.upsertEvidenceAdmissionResult({
      admission_id: 'ear-criteria-1091',
      bundle_id: 'evb-criteria-1091',
      task_id: '20260420-1091-test',
      task_number: 1091,
      verdict: 'admitted',
      methods_json: JSON.stringify(['criteria_proof']),
      blockers_json: '[]',
      lifecycle_eligible_status: null,
      admitted_at: '2026-04-25T00:00:01Z',
      admitted_by: 'operator-1',
      confirmation_json: '{}',
    });
    store.db.close();

    const result = await taskCloseCommand({
      taskNumber: '1091',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.result as { new_status: string }).new_status).toBe('closed');
  });

  it('fails without execution notes', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-102-test.md'),
      `---\ntask_id: 102\nstatus: in_review\n---\n\n# Task 102: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Verification\nOK.\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '102',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; gate_failures: string[] };
    expect(r.status).toBe('error');
    expect(r.gate_failures.some((f) => f.includes('execution notes'))).toBe(true);

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-102-test.md'), 'utf8');
    expect(content).toContain('status: in_review');
  });

  it('fails without verification notes', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-103-test.md'),
      `---\ntask_id: 103\nstatus: in_review\n---\n\n# Task 103: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '103',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; gate_failures: string[] };
    expect(r.status).toBe('error');
    expect(r.gate_failures.some((f) => f.includes('verification'))).toBe(true);

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-103-test.md'), 'utf8');
    expect(content).toContain('status: in_review');
  });

  it('fails with derivative files', async () => {
    writeTask(
      tempDir,
      104,
      'in_review',
      '## Execution Notes\nDone.\n\n## Verification\nOK.\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-104-test-EXECUTED.md'),
      '# Derivative\n',
    );

    const result = await taskCloseCommand({
      taskNumber: '104',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; gate_failures: string[]; violations: string[] };
    expect(r.status).toBe('error');
    expect(r.gate_failures.some((f) => f.includes('Derivative'))).toBe(true);
    // Violations are only computed for terminal tasks; this task is in_review
    expect(r.violations).toEqual([]);

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-104-test.md'), 'utf8');
    expect(content).toContain('status: in_review');
  });

  it('reports valid for already-closed task with good evidence', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-105-test.md'),
      `---\ntask_id: 105\nstatus: closed\nclosed_by: operator-1\nclosed_at: 2026-04-23T17:35:00Z\n---\n\n# Task 105: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n- [x] Criterion B\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '105',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; valid: boolean; current_status: string };
    expect(r.status).toBe('ok');
    expect(r.valid).toBe(true);
    expect(r.current_status).toBe('closed');
  });

  it('reports invalid for already-closed task with unchecked criteria', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-106-test.md'),
      `---\ntask_id: 106\nstatus: closed\n---\n\n# Task 106: Test\n\n## Acceptance Criteria\n- [ ] Unchecked A\n- [x] Checked B\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '106',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; valid: boolean; violations: string[] };
    expect(r.status).toBe('error');
    expect(r.valid).toBe(false);
    expect(r.violations).toContain('terminal_with_unchecked_criteria');
  });

  it('returns human-readable output on success', async () => {
    writeTask(
      tempDir,
      107,
      'in_review',
      '## Execution Notes\nDone.\n\n## Verification\nOK.\n',
    );

    const result = await taskCloseCommand({
      taskNumber: '107',
      by: 'operator-1',
      cwd: tempDir,
      format: 'human',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const text = result.result as { status: string; new_status: string };
    expect(text.status).toBe('success');
    expect(text.new_status).toBe('closed');
  });

  it('includes remediation guidance in gate failure response', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-112-test.md'),
      `---\ntask_id: 112\nstatus: in_review\n---\n\n# Task 112: Test\n\n## Acceptance Criteria\n- [ ] Unchecked A\n- [x] Checked B\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '112',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; remediation: string[]; gate_failures: string[] };
    expect(r.status).toBe('error');
    expect(r.remediation).toBeDefined();
    expect(r.remediation.length).toBeGreaterThanOrEqual(2);
    expect(r.remediation.some((m) => m.includes('Check all acceptance criteria'))).toBe(true);
    expect(r.remediation.some((m) => m.includes('Execution Notes'))).toBe(true);
    expect(r.remediation.some((m) => m.includes('Verification'))).toBe(true);
  });

  it('fails for invalid task number', async () => {
    const result = await taskCloseCommand({
      taskNumber: 'not-a-number',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('Invalid');
  });

  it('fails when task file is missing', async () => {
    const result = await taskCloseCommand({
      taskNumber: '999',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('not found');
  });

  it('sets governed_by on closure', async () => {
    writeTask(
      tempDir,
      110,
      'in_review',
      '## Execution Notes\nDone.\n\n## Verification\nOK.\n',
    );

    const result = await taskCloseCommand({
      taskNumber: '110',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-110-test.md'), 'utf8');
    expect(content).toContain('governed_by: task_close:operator-1');
  });

  it('reports invalid for already-closed task without governed provenance (raw mutation)', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-111-test.md'),
      `---\ntask_id: 111\nstatus: closed\n---\n\n# Task 111: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '111',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; valid: boolean; violations: string[] };
    expect(r.status).toBe('error');
    expect(r.valid).toBe(false);
    expect(r.violations).toContain('terminal_without_governed_provenance');
  });

  describe('with SQLite store (Task 564)', () => {
    let store: SqliteTaskLifecycleStore;

    beforeEach(() => {
      const db = new Database(':memory:');
      store = new SqliteTaskLifecycleStore({ db });
      store.initSchema();
    });

    afterEach(() => {
      store.db.close();
    });

    it('writes authoritative lifecycle state to SQLite on close', async () => {
      writeTask(
        tempDir,
        200,
        'in_review',
        '## Execution Notes\nDid the work.\n\n## Verification\nTests pass.\n',
      );

      const result = await taskCloseCommand({
        taskNumber: '200',
        by: 'operator-sqlite',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      // SQLite is authoritative
      const lifecycle = store.getLifecycle('20260420-200-test');
      expect(lifecycle).toBeDefined();
      expect(lifecycle!.status).toBe('closed');
      expect(lifecycle!.closed_by).toBe('operator-sqlite');
      expect(lifecycle!.governed_by).toBe('task_close:operator-sqlite');
      expect(lifecycle!.closed_at).toBeTruthy();

      // Markdown is preserved as compatibility projection
      const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-200-test.md'), 'utf8');
      expect(content).toContain('status: closed');
      expect(content).toContain('closed_by: operator-sqlite');
    });

    it('backfills markdown-only task into SQLite before closing', async () => {
      writeTask(
        tempDir,
        201,
        'opened',
        '## Execution Notes\nDone.\n\n## Verification\nOK.\n',
      );

      // No lifecycle row exists yet
      expect(store.getLifecycle('20260420-201-test')).toBeUndefined();

      const result = await taskCloseCommand({
        taskNumber: '201',
        by: 'operator-backfill',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      // SQLite backfilled and then closed
      const lifecycle = store.getLifecycle('20260420-201-test');
      expect(lifecycle).toBeDefined();
      expect(lifecycle!.status).toBe('closed');
      expect(lifecycle!.task_number).toBe(201);
    });

    it('uses SQLite status over markdown status when both exist', async () => {
      // Markdown says opened, SQLite says in_review
      writeTask(
        tempDir,
        202,
        'opened',
        '## Execution Notes\nDone.\n\n## Verification\nOK.\n',
      );
      store.upsertLifecycle({
        task_id: '20260420-202-test',
        task_number: 202,
        status: 'in_review',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });

      const result = await taskCloseCommand({
        taskNumber: '202',
        by: 'operator-sqlite',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      // SQLite status (in_review → closed) was used, not markdown (opened → closed)
      const lifecycle = store.getLifecycle('20260420-202-test');
      expect(lifecycle!.status).toBe('closed');
    });

    it('blocks close when SQLite status is already terminal', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-203-test.md'),
        `---\ntask_id: 203\nstatus: closed\ngoverned_by: task_close:prior\nclosed_by: prior-operator\nclosed_at: 2026-04-24T10:00:00.000Z\n---\n\n# Task 203: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
      );
      store.upsertLifecycle({
        task_id: '20260420-203-test',
        task_number: 203,
        status: 'closed',
        governed_by: 'task_close:prior',
        closed_at: '2026-04-24T10:00:00.000Z',
        closed_by: 'prior-operator',
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });

      const result = await taskCloseCommand({
        taskNumber: '203',
        by: 'operator-2',
        cwd: tempDir,
        format: 'json',
        store,
      });

      // Should validate the already-closed task, not attempt re-close
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as { status: string; valid: boolean };
      expect(r.status).toBe('ok');
      expect(r.valid).toBe(true);

      // Original provenance preserved in SQLite
      const lifecycle = store.getLifecycle('20260420-203-test');
      expect(lifecycle!.closed_by).toBe('prior-operator');
      expect(lifecycle!.governed_by).toBe('task_close:prior');
    });

    it('preserves governed provenance in SQLite on closure', async () => {
      writeTask(
        tempDir,
        204,
        'in_review',
        '## Execution Notes\nDone.\n\n## Verification\nOK.\n',
      );

      const result = await taskCloseCommand({
        taskNumber: '204',
        by: 'provenance-test',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const lifecycle = store.getLifecycle('20260420-204-test');
      expect(lifecycle!.governed_by).toBe('task_close:provenance-test');
      expect(lifecycle!.closed_by).toBe('provenance-test');
      expect(lifecycle!.closed_at).toMatch(/^\d{4}-/);
    });
  });

  it('reconciles roster: clears active assignment on close', async () => {
    writeTask(
      tempDir,
      300,
      'in_review',
      '## Execution Notes\nDone.\n\n## Verification\nOK.\n',
    );

    // Create roster with agent assigned to task 300
    mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
    writeFileSync(
      join(tempDir, '.ai', 'agents', 'roster.json'),
      JSON.stringify({
        version: 1,
        updated_at: '2026-01-01T00:00:00Z',
        agents: [
          { agent_id: 'agent-a', role: 'implementer', capabilities: [], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z', status: 'working', task: 300 },
        ],
      }, null, 2),
    );

    const result = await taskCloseCommand({
      taskNumber: '300',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { roster_reconciled: boolean; reconciled_agent_id?: string };
    expect(r.roster_reconciled).toBe(true);
    expect(r.reconciled_agent_id).toBe('agent-a');

    const rosterRaw = readFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), 'utf8');
    const roster = JSON.parse(rosterRaw) as { agents: Array<{ agent_id: string; status: string; task: number | null; last_done: number | null }> };
    const agent = roster.agents.find((a) => a.agent_id === 'agent-a');
    expect(agent).toBeDefined();
    expect(agent!.status).toBe('done');
    expect(agent!.task).toBeNull();
    expect(agent!.last_done).toBe(300);
  });

  it('closes task without roster when no active assignment exists', async () => {
    writeTask(
      tempDir,
      301,
      'in_review',
      '## Execution Notes\nDone.\n\n## Verification\nOK.\n',
    );

    const result = await taskCloseCommand({
      taskNumber: '301',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { roster_reconciled: boolean; reconciled_agent_id?: string };
    expect(r.roster_reconciled).toBe(false);
    expect(r.reconciled_agent_id).toBeUndefined();
  });

  it('releases active assignment on close', async () => {
    writeTask(
      tempDir,
      302,
      'in_review',
      '## Execution Notes\nDone.\n\n## Verification\nOK.\n',
    );

    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260420-302-test',
        task_number: 302,
        status: 'in_review',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      });
      store.upsertAssignmentRecord({
        task_id: '20260420-302-test',
        record_json: JSON.stringify({
          task_id: '20260420-302-test',
          assignments: [
            {
              agent_id: 'agent-a',
              claimed_at: '2026-01-01T00:00:00Z',
              claim_context: null,
              released_at: null,
              release_reason: null,
              intent: 'primary',
            },
          ],
        }),
        updated_at: '2026-01-01T00:00:00.000Z',
      });
    } finally {
      store.db.close();
    }

    const result = await taskCloseCommand({
      taskNumber: '302',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { assignment_released: boolean };
    expect(r.assignment_released).toBe(true);

    const assignment = await loadAssignment(tempDir, '20260420-302-test');
    expect(assignment?.assignments[0].released_at).not.toBeNull();
    expect(assignment?.assignments[0].release_reason).toBe('completed');
  });
});
