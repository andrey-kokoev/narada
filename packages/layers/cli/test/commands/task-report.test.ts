import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimTaskService, continueTaskService, releaseTaskService } from '@narada2/task-governance-core/task-assignment-lifecycle-service';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { taskReportCommand } from '../../src/commands/task-report.js';
import { taskReviewRequestCommand } from '../../src/commands/task-review-request.js';
import { taskReviewCommand } from '../../src/commands/task-review.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

process.env.NARADA_TASK_LIFECYCLE_FAST_SQLITE = '1';

function setupRepo(tempDir: string): void {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'worker', role: 'implementer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'reviewer', role: 'reviewer', capabilities: ['review'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'implementer-reviewer', role: 'implementer', capabilities: ['claim', 'review'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );
  const store = openTaskLifecycleStore(tempDir);
  try {
    for (const agent of ['worker', 'reviewer', 'implementer-reviewer', 'architect-reviewer', 'architect-unadmitted']) {
      store.upsertRosterEntry({
        agent_id: agent,
        role: agent === 'reviewer'
          ? 'reviewer'
          : agent.startsWith('architect-')
            ? 'architect'
            : 'implementer',
        capabilities_json: JSON.stringify(
          agent === 'reviewer' || agent === 'implementer-reviewer' || agent === 'architect-reviewer'
            ? ['review']
            : ['claim'],
        ),
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
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Test Task\n\n## Acceptance Criteria\n\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nTests passed.\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1000-evidence-repair-task.md'),
    '---\ntask_id: 1000\nstatus: opened\n---\n\n# Task 1000: Evidence Repair Task\n\n## Acceptance Criteria\n\n- [x] Done\n\n## Execution Notes\nCompleted.\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1001-capa-review-task.md'),
    '---\ntask_id: 1001\nstatus: opened\n---\n\n# Task 1001: CAPA Review Task\n\n## Acceptance Criteria\n\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nFocused test passed.\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1002-architect-review-task.md'),
    '---\ntask_id: 1002\nstatus: opened\n---\n\n# Task 1002: Architect Review Task\n\n## Acceptance Criteria\n\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nFocused test passed.\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1003-unauthorized-review-task.md'),
    '---\ntask_id: 1003\nstatus: opened\n---\n\n# Task 1003: Unauthorized Review Task\n\n## Acceptance Criteria\n\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nFocused test passed.\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1004-facade-review-task.md'),
    '---\ntask_id: 1004\nstatus: opened\n---\n\n# Task 1004: Facade Review Task\n\n## Context\nThis is an MCP facade prototype.\n\n## Acceptance Criteria\n\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nFocused test passed.\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1005-roster-projection-noise-task.md'),
    '---\ntask_id: 1005\nstatus: opened\n---\n\n# Task 1005: Roster Projection Noise Task\n\n## Acceptance Criteria\n\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nFocused test passed.\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1006-accepted-authority-defect-task.md'),
    '---\ntask_id: 1006\nstatus: opened\n---\n\n# Task 1006: Accepted Authority Defect Task\n\n## Acceptance Criteria\n\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nFocused test passed.\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1007-benign-authority-note-task.md'),
    '---\ntask_id: 1007\nstatus: opened\n---\n\n# Task 1007: Benign Authority Note Task\n\n## Acceptance Criteria\n\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nFocused test passed.\n',
  );
}

function listDirectedObligations(tempDir: string, targetAgent: string | null, targetRole?: string) {
  const store = openTaskLifecycleStore(tempDir);
  try {
    return store.listDirectedObligationsForTarget(targetAgent, targetRole ?? null, 'open');
  } finally {
    store.db.close();
  }
}

describe('task review command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-review-command-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('delegates accepted reviews and writes mutation evidence', async () => {
    await claimTaskService({ taskNumber: '999', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '999', reason: 'completed', cwd: tempDir });
    const obligationStore = openTaskLifecycleStore(tempDir);
    try {
      obligationStore.upsertDirectedObligation({
        obligation_id: 'obl_review_999_reviewer',
        source_kind: 'task_report',
        source_ref: 'wrr_999',
        source_agent_id: 'worker',
        target_agent_id: 'reviewer',
        target_role: 'reviewer',
        target_ref: 'reviewer',
        kind: 'review_request',
        status: 'open',
        task_id: '20260420-999-test-task',
        task_number: 999,
        evidence_json: JSON.stringify({ report_id: 'wrr_999' }),
        consumption_rule_json: JSON.stringify({ consume_on: ['task_review'] }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        consumed_at: null,
        consumed_by: null,
        consumption_ref: null,
      });
    } finally {
      obligationStore.db.close();
    }

    const request = await taskReviewRequestCommand({
      taskNumber: '999',
      agent: 'worker',
      reviewer: 'architect',
      cwd: tempDir,
      format: 'json',
    });

    expect(request.exitCode).toBe(ExitCode.SUCCESS);
    expect(request.result).toMatchObject({
      status: 'success',
      source_agent_identity_ref: {
        schema: 'narada.agent_identity_ref.v2',
        identity_scope: { kind: 'unscoped' },
        local_agent_id: 'worker',
        role: 'worker',
        canonical_agent_id: 'worker',
        display: 'worker',
        legacy_agent_id: 'worker',
      },
    });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      verdict: 'accepted',
      new_status: 'closed',
      close_action: 'closed',
      generated_artifact_authority_note: {
        posture: 'not_self_authorizing',
        message: 'Generated review/report artifacts are not self-authorizing; authority requires lifecycle admission, reviewer identity, task evidence verdict, and closure status.',
        authority_requires: [
          'lifecycle_admission_rule',
          'reviewer_identity',
          'task_evidence_verdict',
          'closure_status',
        ],
      },
    });

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycle('20260420-999-test-task')?.status).toBe('closed');
      expect(store.listReviews('20260420-999-test-task')).toHaveLength(1);
      expect(store.listDirectedObligationsForTask('20260420-999-test-task')[0]).toMatchObject({
        obligation_id: 'obl_review_999_reviewer',
        status: 'completed',
        consumed_by: 'reviewer',
      });
    } finally {
      store.db.close();
    }
  });

  it('rejects invalid findings through the command wrapper without mutation', async () => {
    await claimTaskService({ taskNumber: '999', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '999', reason: 'completed', cwd: tempDir });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer',
      verdict: 'accepted',
      findings: JSON.stringify([{ severity: 'invalid', description: 'bad' }]),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('severity');
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8')).toContain('status: in_review');
  });

  it('routes accepted reviews with rejected evidence admission into evidence repair continuation', async () => {
    await claimTaskService({ taskNumber: '1000', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '1000', reason: 'completed', cwd: tempDir });

    const review = await taskReviewCommand({
      taskNumber: '1000',
      agent: 'reviewer',
      verdict: 'accepted_with_notes',
      findings: JSON.stringify([{ severity: 'minor', description: 'Add durable verification evidence.' }]),
      cwd: tempDir,
      format: 'json',
    });

    expect(review.exitCode).toBe(ExitCode.SUCCESS);
    expect(review.result).toMatchObject({
      status: 'success',
      verdict: 'accepted_with_notes',
      review_verdict_status: 'accepted',
      new_status: 'needs_continuation',
      close_action: 'skipped',
      evidence_blocked: true,
      closure_posture: {
        closure_posture: 'repair_required',
        residual_crossing: 'evidence_repair_continuation',
        next_command: 'narada task continue 1000 --agent reviewer --reason evidence_repair',
      },
    });

    let store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycle('20260420-1000-evidence-repair-task')?.status).toBe('needs_continuation');
      expect(store.getLatestEvidenceAdmissionResult('20260420-1000-evidence-repair-task')?.verdict).toBe('rejected');
    } finally {
      store.db.close();
    }

    const continued = await continueTaskService({
      taskNumber: '1000',
      agent: 'worker',
      reason: 'evidence_repair',
      cwd: tempDir,
      format: 'json',
    });
    expect(continued.exitCode).toBe(ExitCode.SUCCESS);
    const continuedStore = openTaskLifecycleStore(tempDir);
    try {
      expect(continuedStore.getLifecycle('20260420-1000-evidence-repair-task')?.status).toBe('continued');
    } finally {
      continuedStore.db.close();
    }
  });

  it('does not create a post-hoc review request for a target task review would refuse', async () => {
    await claimTaskService({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
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
  });
});