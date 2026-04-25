import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { taskReconcileInspectCommand, taskReconcileRecordCommand, taskReconcileRepairCommand } from '../../src/commands/task-reconcile.js';
import { taskCreateCommand } from '../../src/commands/task-create.js';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { taskReportCommand } from '../../src/commands/task-report.js';
import { taskEvidenceAdmitCommand, taskEvidenceProveCriteriaCommand } from '../../src/commands/task-evidence.js';
import { taskCloseCommand } from '../../src/commands/task-close.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('task reconcile operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-reconcile-'));
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
    writeFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), JSON.stringify({
      version: 1,
      updated_at: 'now',
      agents: [
        {
          agent_id: 'a1',
          role: 'implementer',
          capabilities: ['claim'],
          first_seen_at: '2026-04-25T00:00:00Z',
          last_active_at: '2026-04-25T00:00:00Z',
          status: 'idle',
          task: null,
        },
      ],
    }));
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260425-655-drift.md'),
      '---\nstatus: opened\n---\n\n# Task 655\n\n## Acceptance Criteria\n\n- [ ] x\n',
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260425-655-drift',
        task_number: 655,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-25T12:00:00.000Z',
      });
    } finally {
      store.db.close();
    }
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects and repairs SQLite/front-matter lifecycle drift', async () => {
    const inspect = await taskReconcileInspectCommand({ cwd: tempDir, format: 'json' });
    expect(inspect.exitCode).toBe(ExitCode.SUCCESS);
    const previewFinding = (inspect.result as { persisted: boolean; findings: Array<{ finding_id: string; expected_authority: string }> }).findings
      .find((f) => f.expected_authority === 'task_lifecycle');
    expect(previewFinding?.finding_id).toBeDefined();
    expect((inspect.result as { persisted: boolean }).persisted).toBe(false);

    const secondInspect = await taskReconcileInspectCommand({ cwd: tempDir, format: 'json' });
    const secondPreviewFinding = (secondInspect.result as { findings: Array<{ finding_id: string; expected_authority: string }> }).findings
      .find((f) => f.expected_authority === 'task_lifecycle');
    expect(secondPreviewFinding?.finding_id).toBe(previewFinding?.finding_id);

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getReconciliationFinding(previewFinding!.finding_id)).toBeUndefined();
    } finally {
      store.db.close();
    }

    const record = await taskReconcileRecordCommand({ cwd: tempDir, format: 'json' });
    expect(record.exitCode).toBe(ExitCode.SUCCESS);
    const finding = (record.result as { persisted: boolean; findings: Array<{ finding_id: string; expected_authority: string }> }).findings
      .find((f) => f.expected_authority === 'task_lifecycle');
    expect((record.result as { persisted: boolean }).persisted).toBe(true);

    const repair = await taskReconcileRepairCommand({
      cwd: tempDir,
      finding: finding!.finding_id,
      by: 'a2',
      format: 'json',
    });
    expect(repair.exitCode).toBe(ExitCode.SUCCESS);
    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260425-655-drift.md'), 'utf8');
    expect(content).toContain('status: claimed');
  });

  it('repairs roster assignment lifecycle drift by clearing stale roster work', async () => {
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertRosterEntry({
        agent_id: 'a1',
        role: 'implementer',
        capabilities_json: JSON.stringify(['claim']),
        first_seen_at: '2026-04-25T00:00:00Z',
        last_active_at: '2026-04-25T00:00:00Z',
        status: 'working',
        task_number: 655,
        last_done: null,
        updated_at: '2026-04-25T00:00:00Z',
      });
      store.upsertReconciliationFinding({
        finding_id: 'rf-roster',
        task_id: '20260425-655-drift',
        task_number: 655,
        surfaces_json: JSON.stringify(['agent_roster', 'task_assignment_record', 'task_lifecycle']),
        expected_authority: 'task_lifecycle + assignment_intent',
        observed_mismatch_json: JSON.stringify({ roster_agent: 'a1', roster_task: 655, lifecycle_status: 'opened', active_assignment_agent: null }),
        severity: 'warning',
        proposed_repair_json: JSON.stringify({ action: 'clear_or_reassign_roster' }),
        status: 'open',
        detected_at: '2026-04-25T00:00:00Z',
      });
    } finally {
      store.db.close();
    }

    const repair = await taskReconcileRepairCommand({ cwd: tempDir, finding: 'rf-roster', by: 'a2', format: 'json' });
    expect(repair.exitCode).toBe(ExitCode.SUCCESS);
    const verify = openTaskLifecycleStore(tempDir);
    try {
      const entry = verify.getRosterEntry('a1');
      expect(entry?.status).toBe('idle');
      expect(entry?.task_number).toBeNull();
    } finally {
      verify.db.close();
    }
  });

  it('records and repairs missing task spec authority by backfilling from projection', async () => {
    const record = await taskReconcileRecordCommand({ cwd: tempDir, range: '655-655', by: 'a2', format: 'json' });
    expect(record.exitCode).toBe(ExitCode.SUCCESS);
    const finding = (record.result as { findings: Array<{ finding_id: string; expected_authority: string }> }).findings
      .find((f) => f.expected_authority === 'task_specs');
    expect(finding?.finding_id).toBeDefined();

    const repair = await taskReconcileRepairCommand({ cwd: tempDir, finding: finding!.finding_id, by: 'a2', format: 'json' });
    expect(repair.exitCode).toBe(ExitCode.SUCCESS);
    const store = openTaskLifecycleStore(tempDir);
    try {
      const spec = store.getTaskSpec('20260425-655-drift');
      expect(spec?.task_number).toBe(655);
      expect(spec?.title).toBe('Task 655');
    } finally {
      store.db.close();
    }
  });

  it('records and repairs missing closure mode on terminal lifecycle rows', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260425-657-closed.md'),
      '---\nstatus: closed\ngoverned_by: task_review:reviewer\nclosed_by: reviewer\nclosed_at: 2026-04-25T00:00:00Z\n---\n\n# Task 657\n\n## Acceptance Criteria\n\n- [x] x\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n',
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260425-657-closed',
        task_number: 657,
        status: 'closed',
        governed_by: 'task_review:reviewer',
        closed_at: '2026-04-25T00:00:00Z',
        closed_by: 'reviewer',
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-25T00:00:00Z',
      });
    } finally {
      store.db.close();
    }

    const record = await taskReconcileRecordCommand({ cwd: tempDir, range: '657-657', by: 'a2', format: 'json' });
    expect(record.exitCode).toBe(ExitCode.SUCCESS);
    const finding = (record.result as { findings: Array<{ finding_id: string; proposed_repair_json: string }> }).findings
      .find((f) => f.proposed_repair_json.includes('backfill_closure_mode'));
    expect(finding?.finding_id).toBeDefined();

    const repair = await taskReconcileRepairCommand({ cwd: tempDir, finding: finding!.finding_id, by: 'a2', format: 'json' });
    expect(repair.exitCode).toBe(ExitCode.SUCCESS);
    const verify = openTaskLifecycleStore(tempDir);
    try {
      expect(verify.getLifecycle('20260425-657-closed')?.closure_mode).toBe('peer_reviewed');
    } finally {
      verify.db.close();
    }
  });


  it('repairs terminal evidence mismatch by requesting continuation', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260425-656-terminal.md'),
      '---\nstatus: closed\n---\n\n# Task 656\n\n## Acceptance Criteria\n\n- [ ] x\n',
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260425-656-terminal',
        task_number: 656,
        status: 'closed',
        governed_by: null,
        closed_at: '2026-04-25T00:00:00Z',
        closed_by: 'seed',
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-25T00:00:00Z',
      });
      store.upsertReconciliationFinding({
        finding_id: 'rf-terminal',
        task_id: '20260425-656-terminal',
        task_number: 656,
        surfaces_json: JSON.stringify(['task_lifecycle.status', 'task_evidence']),
        expected_authority: 'evidence_admission',
        observed_mismatch_json: JSON.stringify({ status: 'closed', evidence_verdict: 'needs_closure' }),
        severity: 'error',
        proposed_repair_json: JSON.stringify({ action: 'reopen_or_repair_evidence' }),
        status: 'open',
        detected_at: '2026-04-25T00:00:00Z',
      });
    } finally {
      store.db.close();
    }

    const repair = await taskReconcileRepairCommand({ cwd: tempDir, finding: 'rf-terminal', by: 'a2', format: 'json' });
    expect(repair.exitCode).toBe(ExitCode.SUCCESS);
    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260425-656-terminal.md'), 'utf8');
    expect(content).toContain('status: needs_continuation');
  });

  it('classifies duplicate ownership repair as non-auto-repairable', async () => {
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertReconciliationFinding({
        finding_id: 'rf-duplicate',
        task_id: null,
        task_number: 655,
        surfaces_json: JSON.stringify(['task_files', 'task_number_ownership']),
        expected_authority: 'task_number_registry',
        observed_mismatch_json: JSON.stringify({ conflicted_task_number: 655 }),
        severity: 'error',
        proposed_repair_json: JSON.stringify({ action: 'choose_single_executable_owner' }),
        status: 'open',
        detected_at: '2026-04-25T00:00:00Z',
      });
    } finally {
      store.db.close();
    }

    const repair = await taskReconcileRepairCommand({ cwd: tempDir, finding: 'rf-duplicate', by: 'a2', format: 'json' });
    expect(repair.exitCode).toBe(ExitCode.SUCCESS);
    const r = repair.result as { status: string; repair: { applied: number } };
    expect(r.status).toBe('deferred');
    expect(r.repair.applied).toBe(0);
  });

  it('normal create claim report prove close flow leaves no reconciliation finding for that task', async () => {
    const create = await taskCreateCommand({
      cwd: tempDir,
      title: 'Clean normal flow',
      number: 656,
      criteria: ['Normal flow is admissible'],
      format: 'json',
    });
    expect(create.exitCode).toBe(ExitCode.SUCCESS);

    expect((await taskClaimCommand({ cwd: tempDir, taskNumber: '656', agent: 'a1', format: 'json' })).exitCode)
      .toBe(ExitCode.SUCCESS);
    expect((await taskReportCommand({
      cwd: tempDir,
      taskNumber: '656',
      agent: 'a1',
      summary: 'Normal flow completed.',
      verification: JSON.stringify([{ command: 'pnpm test:focused', result: 'passed' }]),
      format: 'json',
    })).exitCode).toBe(ExitCode.SUCCESS);
    expect((await taskEvidenceProveCriteriaCommand({ cwd: tempDir, taskNumber: '656', by: 'a1', noRunRationale: 'Focused reconcile test proof.', format: 'json' })).exitCode)
      .toBe(ExitCode.SUCCESS);
    expect((await taskEvidenceAdmitCommand({ cwd: tempDir, taskNumber: '656', by: 'a1', format: 'json' })).exitCode)
      .toBe(ExitCode.SUCCESS);
    expect((await taskCloseCommand({ cwd: tempDir, taskNumber: '656', by: 'a1', mode: 'operator_direct', format: 'json' })).exitCode)
      .toBe(ExitCode.SUCCESS);

    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertRosterEntry({
        agent_id: 'out-of-range',
        role: 'implementer',
        capabilities_json: JSON.stringify(['claim']),
        first_seen_at: '2026-04-25T00:00:00Z',
        last_active_at: '2026-04-25T00:00:00Z',
        status: 'working',
        task_number: 655,
        last_done: null,
        updated_at: '2026-04-25T00:00:00Z',
      });
    } finally {
      store.db.close();
    }

    const inspect = await taskReconcileInspectCommand({ cwd: tempDir, range: '656-656', format: 'json' });
    expect(inspect.exitCode).toBe(ExitCode.SUCCESS);
    const result = inspect.result as { count: number; findings: Array<{ task_number: number | null }> };
    expect(result.count).toBe(0);
    expect(result.findings.filter((finding) => finding.task_number === 656)).toEqual([]);
  });
});
