import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteInboxStore } from '@narada2/control-plane';
import { claimTaskService, continueTaskService, releaseTaskService } from '@narada2/task-governance/task-assignment-lifecycle-service';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { taskCloseCommand } from '../../src/commands/task-close.js';
import { taskEvidenceAdmitCommand } from '../../src/commands/task-evidence.js';
import {
  operatorSurfaceIdentityAddCommand,
  operatorSurfaceIdentityAdmitTaskAuthorityCommand,
} from '../../src/commands/operator-surface.js';
import { taskReviewCommand } from '../../src/commands/task-review.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

process.env.NARADA_TASK_LIFECYCLE_FAST_SQLITE = '1';

function createMockContext(): CommandContext {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
  return {
    configPath: '/test/config.json',
    logger: logger as unknown as CommandContext['logger'],
    verbose: false,
  };
}

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
      ],
    }, null, 2),
  );
  const store = openTaskLifecycleStore(tempDir);
  try {
    for (const agent of ['worker', 'reviewer', 'architect-reviewer', 'architect-unadmitted']) {
      store.upsertRosterEntry({
        agent_id: agent,
        role: agent === 'reviewer'
          ? 'reviewer'
          : agent.startsWith('architect-')
            ? 'architect'
            : 'implementer',
        capabilities_json: JSON.stringify(
          agent === 'reviewer' || agent === 'architect-reviewer'
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
}

function insertReviewRequestEnvelope(tempDir: string, taskNumber: number, requester = 'worker'): string {
  const store = new SqliteInboxStore(join(tempDir, '.ai', 'inbox.db'));
  try {
    const envelope = store.insert({
      envelope_id: `env_review_request_${taskNumber}`,
      received_at: '2026-01-01T00:00:00Z',
      source: { kind: 'agent_report', ref: `${requester}:review-request` },
      target_locus: 'reviewer',
      kind: 'observation',
      authority: { level: 'agent_reported', principal: requester },
      payload: {
        message_kind: 'review_request',
        requester_identity: requester,
        task_number: taskNumber,
      },
    });
    store.promote(envelope.envelope_id, {
      target_kind: 'task',
      target_ref: `task:${taskNumber}`,
      promoted_at: '2026-01-01T00:00:01Z',
      promoted_by: 'architect',
      enactment_status: 'recorded',
    });
    return envelope.envelope_id;
  } finally {
    store.close();
  }
}

function admitBoundOperatorSurface(tempDir: string, identity = 'worker'): void {
  mkdirSync(join(tempDir, 'operator-surfaces'), { recursive: true });
  writeFileSync(
    join(tempDir, 'operator-surfaces', 'identities.json'),
    JSON.stringify({
      schema: 'https://narada.dev/schemas/operator-surface-identities/v1',
      updated_at: '2026-01-01T00:00:00Z',
      identities: [
        {
          identity_id: identity,
          site_id: 'narada',
          role: 'builder',
          agent_kind: 'codex_cli',
          label: identity,
          input_capabilities: ['type_text'],
          submit_strategy: 'type_only',
          admitted_by: 'operator',
          admitted_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          authority_limits: [],
        },
      ],
    }, null, 2),
  );
  writeFileSync(
    join(tempDir, 'operator-surfaces', 'runtime-bindings.json'),
    JSON.stringify({
      bindings: [
        {
          binding_id: `binding-${identity}`,
          identity_id: identity,
          runtime_locus: 'narada',
          handle: 'process:test',
          transport: 'process_session',
          status: 'active',
          stale_after: '2099-01-01T00:00:00Z',
        },
      ],
    }, null, 2),
  );
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
    });

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycle('20260420-999-test-task')?.status).toBe('closed');
      expect(store.listReviews('20260420-999-test-task')).toHaveLength(1);
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
    });
    expect(continued.exitCode).toBe(ExitCode.SUCCESS);
    expect(continued.result).toMatchObject({
      status: 'success',
      task_status: 'claimed',
    });
    expect((continued.result as { previous_agent_id?: string }).previous_agent_id).toBeUndefined();

    const taskPath = join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-1000-evidence-repair-task.md');
    writeFileSync(
      taskPath,
      readFileSync(taskPath, 'utf8') + '\n## Verification\nFocused evidence repair test passed.\n',
    );
    await releaseTaskService({ taskNumber: '1000', reason: 'completed', cwd: tempDir });

    const admitted = await taskEvidenceAdmitCommand({
      taskNumber: '1000',
      by: 'worker',
      cwd: tempDir,
      format: 'json',
    });
    expect(admitted.exitCode).toBe(ExitCode.SUCCESS);

    const closed = await taskCloseCommand({
      taskNumber: '1000',
      by: 'worker',
      cwd: tempDir,
      format: 'json',
    });
    expect(closed.exitCode).toBe(ExitCode.SUCCESS);
    expect(closed.result).toMatchObject({
      status: 'success',
      new_status: 'closed',
    });

    store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycle('20260420-1000-evidence-repair-task')?.status).toBe('closed');
    } finally {
      store.db.close();
    }
  });

  it('surfaces CAPA guidance for rejected reviews with blocking recurrence-risk findings', async () => {
    await claimTaskService({ taskNumber: '1001', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '1001', reason: 'completed', cwd: tempDir });

    const result = await taskReviewCommand({
      taskNumber: '1001',
      agent: 'reviewer',
      verdict: 'rejected',
      findings: JSON.stringify([
        {
          severity: 'blocking',
          description: 'Lifecycle authority boundary mismatch will recur across Sites unless CAPA guardrails are added.',
          location: 'task review',
        },
      ]),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      verdict: 'rejected',
      new_status: 'opened',
      capa_recommendation: {
        recommended: true,
      },
    });
    const review = result.result as {
      capa_recommendation: { triggers: string[]; next_command: string };
    };
    expect(review.capa_recommendation.triggers).toEqual(expect.arrayContaining([
      'blocking_rejected_review',
      'lifecycle_or_roster_authority_mismatch',
      'authority_boundary_bug',
      'cross_site_recurrence_risk',
    ]));
    expect(review.capa_recommendation.next_command).toContain('CAPA for task 1001 review rejection');

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycle('20260420-1001-capa-review-task')?.status).toBe('opened');
    } finally {
      store.db.close();
    }
  });

  it('does not emit rejection CAPA guidance for accepted legacy roster projection noise', async () => {
    await claimTaskService({ taskNumber: '1005', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '1005', reason: 'completed', cwd: tempDir });

    const findings = JSON.stringify([
      {
        severity: 'minor',
        description: 'Legacy roster projection last_done moved from a newer task to an older task after accepted review; compatibility projection noise only, not a lifecycle authority defect.',
        location: '.ai/agents/roster.json projection',
      },
    ]);
    const result = await taskReviewCommand({
      taskNumber: '1005',
      agent: 'reviewer',
      verdict: 'accepted_with_notes',
      findings,
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      verdict: 'accepted_with_notes',
      new_status: 'closed',
      review_diagnostics: {
        findings: [
          {
            posture: 'projection_only',
            authority_class: 'compatibility_projection_noise',
            blocking: false,
            compatibility_only: true,
            projection_only: true,
            lifecycle_authority_defect: false,
            capa_relevant: false,
          },
        ],
        compatibility_projection_only: true,
      },
    });
    const review = result.result as {
      capa_recommendation?: { recommended: boolean; rationale?: string; next_command?: string };
      review_diagnostics?: { findings: Array<{ triggers: string[] }> };
    };
    expect(review.capa_recommendation).toBeUndefined();
    expect(JSON.stringify(result.result)).not.toContain('review rejection');
  });

  it('prints bounded human diagnostics for accepted legacy roster projection noise', async () => {
    await claimTaskService({ taskNumber: '1005', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '1005', reason: 'completed', cwd: tempDir });
    insertReviewRequestEnvelope(tempDir, 1005, 'worker');

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const result = await taskReviewCommand({
        taskNumber: '1005',
        agent: 'reviewer',
        verdict: 'accepted_with_notes',
        findings: JSON.stringify([
          {
            severity: 'note',
            description: 'Legacy roster projection last_done points at an older task; projection-only compatibility noise.',
            location: 'roster projection',
          },
        ]),
        cwd: tempDir,
        format: 'human',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('Review diagnostics: #1 projection_only compatibility_projection_noise');
      expect(output).toContain('non-blocking/compatibility-only/projection-only');
      expect(output).toContain('Review reply: inbox to worker');
      expect(output).not.toContain('CAPA recommended');
      expect(output).not.toContain('review rejection');
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('keeps actual lifecycle authority defects CAPA-relevant without rejection wording on accepted reviews', async () => {
    await claimTaskService({ taskNumber: '1006', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '1006', reason: 'completed', cwd: tempDir });

    const result = await taskReviewCommand({
      taskNumber: '1006',
      agent: 'reviewer',
      verdict: 'accepted_with_notes',
      findings: JSON.stringify([
        {
          severity: 'major',
          description: 'Lifecycle authority defect: closure artifact and admission evidence disagree even though the review can accept current scope.',
          location: 'task lifecycle row',
        },
      ]),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      verdict: 'accepted_with_notes',
      new_status: 'closed',
      review_diagnostics: {
        findings: [
          {
            posture: 'non_blocking',
            authority_class: 'lifecycle_authority_defect',
            lifecycle_authority_defect: true,
            compatibility_only: false,
            projection_only: false,
            capa_relevant: true,
          },
        ],
      },
      capa_recommendation: {
        recommended: true,
      },
    });
    const review = result.result as {
      capa_recommendation: { rationale: string; next_command: string; triggers: string[] };
    };
    expect(review.capa_recommendation.next_command).toContain('CAPA for task 1006 review findings');
    expect(review.capa_recommendation.next_command).not.toContain('review rejection');
    expect(review.capa_recommendation.rationale).not.toContain('Rejected review findings');
    expect(review.capa_recommendation.triggers).toEqual(expect.arrayContaining([
      'authority_boundary_bug',
      'lifecycle_or_roster_authority_mismatch',
    ]));
  });

  it('routes review result replies to canonical inbox when requester has no reachable operator surface', async () => {
    await claimTaskService({ taskNumber: '1005', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '1005', reason: 'completed', cwd: tempDir });
    const sourceEnvelopeId = insertReviewRequestEnvelope(tempDir, 1005, 'worker');

    const result = await taskReviewCommand({
      taskNumber: '1005',
      agent: 'reviewer',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      review_reply_obligation: {
        status: 'inbox',
        requester_identity: 'worker',
        source_envelope_id: sourceEnvelopeId,
        delivery_channel: 'canonical_inbox',
        delivery_status: 'inbox',
        reason: 'operator_surface_not_reachable',
        next_expected_action: 'no further action required for this task',
      },
    });
    const reply = (result.result as {
      review_reply_obligation: { inbox_envelope_id: string; mutation_evidence_path: string };
    }).review_reply_obligation;
    const store = new SqliteInboxStore(join(tempDir, '.ai', 'inbox.db'));
    try {
      const envelope = store.get(reply.inbox_envelope_id);
      expect(envelope).toMatchObject({
        target_locus: 'worker',
        kind: 'observation',
        payload: {
          message_type: 'review_result',
          source_envelope_id: sourceEnvelopeId,
          task_number: 1005,
          verdict: 'accepted',
          next_expected_action: 'no further action required for this task',
        },
      });
    } finally {
      store.close();
    }
    expect(existsSync(join(tempDir, reply.mutation_evidence_path))).toBe(true);
  });

  it('queues review result replies to a reachable admitted operator surface', async () => {
    await claimTaskService({ taskNumber: '1005', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '1005', reason: 'completed', cwd: tempDir });
    const sourceEnvelopeId = insertReviewRequestEnvelope(tempDir, 1005, 'worker');
    admitBoundOperatorSurface(tempDir, 'worker');

    const result = await taskReviewCommand({
      taskNumber: '1005',
      agent: 'reviewer',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      review_reply_obligation: {
        status: 'queued',
        requester_identity: 'worker',
        source_envelope_id: sourceEnvelopeId,
        delivery_channel: 'operator_surface',
        delivery_status: 'queued',
      },
    });
    const reply = (result.result as {
      review_reply_obligation: { queue_artifact: string };
    }).review_reply_obligation;
    const queued = JSON.parse(readFileSync(join(tempDir, reply.queue_artifact), 'utf8')) as {
      status: string;
      payload: { message_type: string; task_number: number; source_envelope_id: string };
    };
    expect(queued).toMatchObject({
      status: 'promised',
      payload: {
        message_type: 'review_result',
        task_number: 1005,
        source_envelope_id: sourceEnvelopeId,
      },
    });
  });

  it('reports repair guidance and CAPA classification for missing reviewer identity', async () => {
    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'missing-reviewer',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      review_authority_repair: {
        reason: 'missing_reviewer_identity',
        commands: [
          'narada task roster add missing-reviewer --role reviewer --capability review',
          'narada task review 999 --agent missing-reviewer --verdict <accepted|accepted_with_notes|rejected>',
        ],
      },
      capa_recommendation: {
        recommended: true,
        triggers: ['authority_boundary_bug', 'reviewer_identity_mismatch'],
      },
    });
  });

  it('identifies missing task authority for an admitted operator-surface reviewer identity', async () => {
    await operatorSurfaceIdentityAddCommand({
      cwd: tempDir,
      identityName: 'narada-andrey.Kevin',
      role: 'architect',
      agentKind: 'codex_cli',
      site: 'narada-andrey',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'narada-andrey.Kevin',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      review_authority_repair: {
        reason: 'missing_reviewer_identity',
        commands: [
          'narada operator-surface identity admit-task-authority narada-andrey.Kevin --by <principal>',
          'narada task review 999 --agent narada-andrey.Kevin --verdict <accepted|accepted_with_notes|rejected>',
        ],
      },
      operator_surface_task_authority: {
        status: 'missing_from_task_authority',
        identity_id: 'narada-andrey.Kevin',
        role: 'architect',
        repair_command: 'narada operator-surface identity admit-task-authority narada-andrey.Kevin --by <principal>',
      },
    });
  });

  it('allows an admitted renamed operator-surface architect identity to review without roster surgery', async () => {
    await operatorSurfaceIdentityAddCommand({
      cwd: tempDir,
      identityName: 'narada-andrey.Kevin',
      role: 'architect',
      agentKind: 'codex_cli',
      site: 'narada-andrey',
      by: 'operator',
      format: 'json',
    }, createMockContext());
    const admitted = await operatorSurfaceIdentityAdmitTaskAuthorityCommand({
      cwd: tempDir,
      identityName: 'narada-andrey.Kevin',
      by: 'operator',
      format: 'json',
    }, createMockContext());
    expect(admitted.exitCode).toBe(ExitCode.SUCCESS);
    await claimTaskService({ taskNumber: '1002', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '1002', reason: 'completed', cwd: tempDir });

    const result = await taskReviewCommand({
      taskNumber: '1002',
      agent: 'narada-andrey.Kevin',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      verdict: 'accepted',
      new_status: 'closed',
    });
  });

  it('reports repair guidance when reviewer role lacks admitted review authority', async () => {
    await claimTaskService({ taskNumber: '1003', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '1003', reason: 'completed', cwd: tempDir });

    const result = await taskReviewCommand({
      taskNumber: '1003',
      agent: 'architect-unadmitted',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      review_authority_repair: {
        reason: 'review_authority_not_admitted',
        commands: [
          'narada task roster add architect-unadmitted --role architect --capability review',
          'narada task review 1003 --agent architect-unadmitted --verdict <accepted|accepted_with_notes|rejected>',
        ],
      },
      capa_recommendation: {
        recommended: true,
        triggers: ['authority_boundary_bug', 'reviewer_identity_mismatch'],
      },
    });
  });

  it('admits declared architect-as-reviewer authority without operator substitution', async () => {
    await claimTaskService({ taskNumber: '1002', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '1002', reason: 'completed', cwd: tempDir });

    const result = await taskReviewCommand({
      taskNumber: '1002',
      agent: 'architect-reviewer',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      verdict: 'accepted',
      new_status: 'closed',
    });
    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.listReviews('20260420-1002-architect-review-task')[0]?.reviewer_agent_id).toBe('architect-reviewer');
    } finally {
      store.db.close();
    }
  });

  it('distinguishes scope-complete from capability-complete for facade review output', async () => {
    await claimTaskService({ taskNumber: '1004', agent: 'worker', cwd: tempDir });
    await releaseTaskService({ taskNumber: '1004', reason: 'completed', cwd: tempDir });

    const result = await taskReviewCommand({
      taskNumber: '1004',
      agent: 'reviewer',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      verdict: 'accepted',
      close_action: 'blocked',
      closure_claim: {
        applies: true,
        closure_posture: 'scope_complete_with_continuation',
        scope_complete: true,
        capability_complete: false,
        residual_crossing: 'continuation_task',
        transition_complete: false,
      },
    });
  });
});
