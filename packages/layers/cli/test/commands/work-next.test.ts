import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inboxSubmitCommand } from '../../src/commands/inbox.js';
import { lawChangeAddCommand } from '../../src/commands/law.js';
import { workAvailableCommand, workNextCommand } from '../../src/commands/work-next.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';

function setupRepo(tempDir: string): void {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
  seedRosterEntry(tempDir, 'architect', 'architect', 'idle', null);
}

function gitBinary(): string {
  return process.env.NARADA_GIT_BINARY ?? (process.platform === 'win32' ? 'git' : '/usr/bin/git');
}

function seedRoster(tempDir: string, status: 'idle' | 'working', task: number | null): void {
  seedRosterEntry(tempDir, 'architect', 'architect', status, task);
}

function seedRosterEntry(
  tempDir: string,
  agentId: string,
  role: string,
  status: 'idle' | 'working' | 'done',
  task: number | null,
): void {
  const store = openTaskLifecycleStore(tempDir);
  try {
    store.upsertRosterEntry({
      agent_id: agentId,
      role,
      capabilities_json: JSON.stringify(['claim', 'execute', 'review']),
      first_seen_at: '2026-01-01T00:00:00Z',
      last_active_at: '2026-01-01T00:00:00Z',
      status,
      task_number: task,
      last_done: null,
      updated_at: '2026-01-01T00:00:00Z',
    });
  } finally {
    store.db.close();
  }
}

describe('work-next unified next action', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-work-next-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns task work before inbox work', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-test.md'),
      '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n\n## Goal\nDo task work.\n\n## Acceptance Criteria\n- [ ] Do task work.\n',
    );
    const inbox = await inboxSubmitCommand({
      cwd: tempDir,
      sourceKind: 'user_chat',
      sourceRef: 'chat:1',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      principal: 'operator',
      payload: '{"title":"Inbox work","goal":"Handle inbox."}',
      format: 'json',
    });
    expect(inbox.exitCode).toBe(ExitCode.SUCCESS);

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'task_work',
      agent_id: 'architect',
      primary: { task_number: 100 },
      checked: [
        { zone: 'directed_obligation', status: 'empty', reason: 'no_open_addressed_obligation' },
        { zone: 'task_work', status: 'selected', selected_ref: 'task:100' },
      ],
    });
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-test.md'), 'utf8')).toContain('status: claimed');
  });

  it('peeks task work without claiming it', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-test.md'),
      '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n\n## Goal\nDo task work.\n\n## Acceptance Criteria\n- [ ] Do task work.\n',
    );

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json', peek: true });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'task_work',
      agent_id: 'architect',
      primary: { task_number: 100 },
      task_result: { action: 'peek_next' },
      next_step: 'Inspect only; rerun without --peek to claim or execute the selected work.',
    });
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-test.md'), 'utf8')).toContain('status: opened');
  });

  it('exposes work-available as a read-only availability surface', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-test.md'),
      '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n\n## Goal\nDo task work.\n\n## Acceptance Criteria\n- [ ] Do task work.\n',
    );

    const result = await workAvailableCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      surface: 'work_available',
      mutates: false,
      action_kind: 'task_work',
      agent_id: 'architect',
      primary: { task_number: 100 },
      task_result: { action: 'peek_next' },
      equivalent_command: 'narada work-next --agent architect --peek --format json',
    });
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-test.md'), 'utf8')).toContain('status: opened');
  });

  it('reports qualification blockers before governed task claim while preserving safe inspection', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'site-qualification.json'),
      JSON.stringify({
        policies: [{ role_id: 'architect', work_class: 'task_construction' }],
        records: [{
          principal_id: 'architect',
          role_id: 'architect',
          work_classes: ['task_construction'],
          status: 'qualified',
          expires_at: '2026-01-01T00:00:00.000Z',
        }],
      }, null, 2),
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-test.md'),
      '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n\n## Goal\nDo task work.\n\n## Acceptance Criteria\n- [ ] Do task work.\n',
    );

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'blocked',
      action_kind: 'qualification_block',
      reason: 'qualification_required_for_task_construction',
      qualification: {
        state: 'expired',
        blocked_work_classes: ['task_construction'],
        allowed_safe_actions: expect.arrayContaining(['narada work-next --agent architect --peek --format json']),
      },
      checked: [{ zone: 'task_work', status: 'blocked', reason: 'expired' }],
    });
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-test.md'), 'utf8')).toContain('status: opened');
  });

  it('does not turn unread law receipts into work admission blockers', async () => {
    const added = await lawChangeAddCommand({
      cwd: tempDir,
      issuer: 'operator',
      summary: 'Architect advisory law',
      requiredRoles: 'architect',
      changeId: 'law_work_next_advisory_fixture',
      format: 'json',
    });
    expect(added.exitCode).toBe(ExitCode.SUCCESS);
    const changePath = join(tempDir, '.ai', 'law', 'changes', 'law_work_next_advisory_fixture.json');
    const change = JSON.parse(readFileSync(changePath, 'utf8')) as Record<string, unknown>;
    change.issued_at = '2026-01-01T00:00:00.000Z';
    writeFileSync(changePath, `${JSON.stringify(change, null, 2)}\n`);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-101-law-advisory.md'),
      '---\ntask_id: 101\nstatus: opened\n---\n\n# Task 101\n\n## Goal\nDo task work.\n\n## Acceptance Criteria\n- [ ] Do task work.\n',
    );

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'task_work',
      primary: { task_number: 101 },
    });
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-101-law-advisory.md'), 'utf8')).toContain('status: claimed');
  });

  it('peeks current task before claimable future work', async () => {
    seedRoster(tempDir, 'working', 100);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-current.md'),
      '---\ntask_id: 100\nstatus: claimed\n---\n\n# Task 100 Current\n\n## Acceptance Criteria\n- [ ] Do current work.\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-101-future.md'),
      '---\ntask_id: 101\nstatus: opened\n---\n\n# Task 101 Future\n\n## Acceptance Criteria\n- [ ] Do future work.\n',
    );

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json', peek: true });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'task_work',
      primary: { task_number: 100, current: true },
      task_result: { action: 'peek_current' },
      next_step: 'Inspect only; this agent already has current task work.',
    });
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-101-future.md'), 'utf8')).toContain('status: opened');
  });

  it('continues current task before claiming future work', async () => {
    seedRoster(tempDir, 'working', 100);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-current.md'),
      '---\ntask_id: 100\nstatus: claimed\n---\n\n# Task 100 Current\n\n## Acceptance Criteria\n- [ ] Do current work.\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-101-future.md'),
      '---\ntask_id: 101\nstatus: opened\n---\n\n# Task 101 Future\n\n## Acceptance Criteria\n- [ ] Do future work.\n',
    );

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'task_work',
      primary: { task_number: 100, current: true },
      task_result: { action: 'continue_current' },
      next_step: 'Continue the current claimed task before requesting new work.',
    });
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-101-future.md'), 'utf8')).toContain('status: opened');
  });

  it('blocks current claimed task when Required Work is placeholder', async () => {
    seedRoster(tempDir, 'working', 1133);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-1133-placeholder.md'),
      '---\ntask_id: 1133\nstatus: claimed\n---\n\n# Task 1133 Placeholder\n\n## Required Work\n1. TBD\n\n## Acceptance Criteria\n- [ ] Do current work.\n',
    );

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'blocked',
      reason: 'task_handoff_underspecified',
      primary: {
        task_number: 1133,
        handoff_actionability: {
          status: 'underspecified',
          repair_command: 'narada task amend 1133 --required-work <actionable-work-plan>',
        },
      },
      next_step: 'narada task amend 1133 --required-work <actionable-work-plan>',
    });
  });

  it('claims task work when SQLite says opened and markdown has no status', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-102-sqlite-opened.md'),
      '---\ntask_id: 20260427-102-sqlite-opened\n---\n\n# Task 102\n\n## Goal\nDo task work.\n\n## Acceptance Criteria\n- [ ] Do task work.\n',
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260427-102-sqlite-opened',
        task_number: 102,
        status: 'opened',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      });
    } finally {
      store.db.close();
    }

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'task_work',
      agent_id: 'architect',
      primary: { task_number: 102 },
    });
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-102-sqlite-opened.md'), 'utf8')).toContain('status: claimed');
  });

  it('skips opened lifecycle rows whose task artifact has no acceptance criteria', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-102-legacy-plan.md'),
      '---\ntask_id: 20260427-102-legacy-plan\n---\n\n# Legacy Plan\n\nThis is not an executable task artifact.\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-103-executable.md'),
      '---\ntask_id: 20260427-103-executable\nstatus: opened\n---\n\n# Task 103\n\n## Acceptance Criteria\n- [ ] Do executable work.\n',
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260427-102-legacy-plan',
        task_number: 102,
        status: 'opened',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      });
      store.upsertLifecycle({
        task_id: '20260427-103-executable',
        task_number: 103,
        status: 'opened',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      });
    } finally {
      store.db.close();
    }

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'task_work',
      agent_id: 'architect',
      primary: { task_number: 103 },
    });
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-102-legacy-plan.md'), 'utf8')).not.toContain('status: claimed');
  });

  it('starts dispatch context for task work when requested', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-test.md'),
      '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100: Dispatch Start\n\n## Goal\nDo task work.\n\n## Acceptance Criteria\n- [ ] Do task work.\n',
    );

    const result = await workNextCommand({
      agent: 'architect',
      cwd: tempDir,
      format: 'json',
      startTask: true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'task_work',
      agent_id: 'architect',
      primary: { task_number: 100 },
      dispatch_result: {
        pickup: { status: 'success', task_number: '100' },
        start: { status: 'success', action: 'ready', recommended_command: expect.stringContaining('kimi') },
      },
    });
  });

  it('claims inbox work when no task work is available', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      sourceKind: 'user_chat',
      sourceRef: 'chat:2',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      principal: 'operator',
      payload: '{"title":"Inbox work","goal":"Handle inbox."}',
      format: 'json',
    });
    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'inbox_work',
      agent_id: 'architect',
      checked: [
        { zone: 'directed_obligation', status: 'empty', reason: 'no_open_addressed_obligation' },
        { zone: 'task_work', status: 'empty', reason: 'no_admissible_task' },
        { zone: 'review_work', status: 'empty', reason: 'no_reviewable_task' },
        { zone: 'inbox_work', status: 'selected' },
      ],
      primary: {
        status: 'handling',
        handling: { handled_by: 'architect' },
      },
    });
  });

  it('peeks inbox work without claiming it', async () => {
    await inboxSubmitCommand({
      cwd: tempDir,
      sourceKind: 'user_chat',
      sourceRef: 'chat:peek',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      principal: 'operator',
      payload: '{"title":"Inbox work","goal":"Handle inbox."}',
      format: 'json',
    });

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json', peek: true });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'inbox_work',
      agent_id: 'architect',
      primary: {
        status: 'received',
        handling: undefined,
      },
      next_step: 'Inspect only; rerun inbox claim or work-next without --peek to take the work.',
    });
  });

  it('rejects peek with task execution options', async () => {
    const result = await workNextCommand({
      agent: 'architect',
      cwd: tempDir,
      format: 'json',
      peek: true,
      startTask: true,
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: '--peek cannot be combined with --start-task or --exec-task',
    });
  });

  it('returns review work before inbox fallback', async () => {
    seedRosterEntry(tempDir, 'builder', 'builder', 'idle', null);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-101-review.md'),
      '---\ntask_id: 101\nstatus: in_review\n---\n\n# Task 101\n\n## Goal\nReview me.\n',
    );
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      sourceKind: 'user_chat',
      sourceRef: 'chat:review-fallback',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      principal: 'operator',
      payload: '{"title":"Inbox work","goal":"Handle inbox."}',
      format: 'json',
    });
    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);

    const result = await workNextCommand({ agent: 'builder', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'review_work',
      agent_id: 'builder',
      checked: [
        { zone: 'directed_obligation', status: 'empty', reason: 'no_open_addressed_obligation' },
        { zone: 'task_work', status: 'empty', reason: 'no_admissible_task' },
        { zone: 'review_work', status: 'selected', selected_ref: 'task:101' },
      ],
      primary: {
        task_number: 101,
        status: 'in_review',
        command_args: ['task', 'review', '101', '--agent', 'builder', '--verdict', 'accepted'],
      },
    });
  });

  it('lets a fresh active collaborator review blocker outrank ordinary pending review ordering', async () => {
    seedRosterEntry(tempDir, 'builder', 'builder', 'idle', null);
    seedRosterEntry(tempDir, 'bob', 'builder', 'done', 202);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-101-generic-review.md'),
      '---\ntask_id: 101\nstatus: in_review\n---\n\n# Task 101 Generic Review\n\n## Goal\nReview generic work.\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-202-bob-awaiting-review.md'),
      '---\ntask_id: 202\nstatus: in_review\n---\n\n# Task 202 Bob Awaiting Review\n\n## Goal\nReview Bob work.\n',
    );

    const result = await workNextCommand({ agent: 'builder', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'review_work',
      primary: {
        task_number: 202,
        recommendation_reason: 'active_collaborator_blocked',
        selection_reason: 'active_collaborator_blocked',
        projection_admission: {
          admitted: true,
          authority: 'projection_only_joined_to_authoritative_facts',
          projection_source: 'operator_surface_activity_projection',
          projection_state: 'awaiting_review',
          freshness: 'current',
          ambiguity: 'non_ambiguous',
          collaborator_agent_id: 'bob',
          authoritative_fallback: {
            lifecycle_authority: 'sqlite_task_lifecycle',
            task_number: 202,
            lifecycle_status: 'in_review',
          },
        },
        source_facts: {
          lifecycle: {
            authority: 'sqlite_task_lifecycle',
            task_number: 202,
            status: 'in_review',
          },
        },
        skip_policy: {
          required: true,
          reason_required: 'active_collaborator_blocked',
        },
      },
    });
  });

  it('keeps authority ahead of projection when active collaborator facts disagree', async () => {
    seedRosterEntry(tempDir, 'builder', 'builder', 'idle', null);
    seedRosterEntry(tempDir, 'bob', 'builder', 'done', 202);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-101-generic-review.md'),
      '---\ntask_id: 101\nstatus: in_review\n---\n\n# Task 101 Generic Review\n\n## Goal\nReview generic work.\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-202-bob-closed.md'),
      '---\ntask_id: 202\nstatus: closed\n---\n\n# Task 202 Bob Closed\n\n## Goal\nAlready closed.\n',
    );

    const result = await workNextCommand({ agent: 'builder', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'review_work',
      primary: {
        task_number: 101,
        recommendation_reason: 'ordinary_pending_review',
        selection_reason: 'ordinary_pending_review',
      },
    });
  });

  it('returns addressed directed obligations before generic task discovery', async () => {
    seedRosterEntry(tempDir, 'kevin', 'architect', 'idle', null);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-generic.md'),
      '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100 Generic\n\n## Goal\nGeneric task.\n\n## Acceptance Criteria\n- [ ] Do task work.\n',
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260427-76-review',
        task_number: 76,
        status: 'in_review',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        closure_mode: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-01-01T00:00:00Z',
      });
      store.upsertDirectedObligation({
        obligation_id: 'obl_review_76_kevin',
        source_kind: 'task_report',
        source_ref: 'wrr_76',
        source_agent_id: 'bob',
        target_agent_id: 'kevin',
        target_role: 'architect',
        target_ref: 'kevin',
        kind: 'review_request',
        status: 'open',
        task_id: '20260427-76-review',
        task_number: 76,
        evidence_json: JSON.stringify({ report_id: 'wrr_76' }),
        consumption_rule_json: JSON.stringify({ review_command: 'narada task review 76 --agent kevin --verdict accepted --report wrr_76' }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        consumed_at: null,
        consumed_by: null,
        consumption_ref: null,
      });
    } finally {
      store.db.close();
    }

    const result = await workNextCommand({ agent: 'kevin', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'directed_obligation',
      agent_id: 'kevin',
      checked: [
        { zone: 'directed_obligation', status: 'selected', selected_ref: 'obligation:obl_review_76_kevin' },
      ],
      primary: {
        obligation_id: 'obl_review_76_kevin',
        kind: 'review_request',
        task_number: 76,
        source_agent_id: 'bob',
        source_agent_identity_ref: {
          schema: 'narada.agent_identity_ref.v2',
          identity_scope: { kind: 'unscoped' },
          local_agent_id: 'bob',
          role: 'bob',
          canonical_agent_id: 'bob',
          display: 'bob',
          legacy_agent_id: 'bob',
        },
        target_agent_id: 'kevin',
        selection_reason: 'open_directed_obligation_addressed_to_agent',
        outranks: 'generic_task_queue',
        command: 'narada task review 76 --agent kevin --verdict accepted --report wrr_76',
      },
    });
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-generic.md'), 'utf8')).toContain('status: opened');
  });

  it('skips stale review obligations for tasks that are no longer in review', async () => {
    seedRosterEntry(tempDir, 'kevin', 'architect', 'idle', null);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-101-generic-review.md'),
      '---\ntask_id: 20260427-101-generic-review\nstatus: in_review\n---\n\n# Task 101 Generic Review\n\n## Goal\nReview generic work.\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-generic.md'),
      '---\ntask_id: 20260427-100-generic\nstatus: opened\n---\n\n# Task 100 Generic\n\n## Goal\nGeneric task.\n\n## Acceptance Criteria\n- [ ] Do task work.\n',
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260427-76-review',
        task_number: 76,
        status: 'closed',
        governed_by: 'task_close:architect',
        closed_at: '2026-01-01T00:00:00Z',
        closed_by: 'architect',
        closure_mode: 'agent_finish',
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-01-01T00:00:00Z',
      });
      store.upsertDirectedObligation({
        obligation_id: 'obl_review_76_kevin_stale',
        source_kind: 'task_report',
        source_ref: 'wrr_76',
        source_agent_id: 'bob',
        target_agent_id: 'kevin',
        target_role: 'architect',
        target_ref: 'kevin',
        kind: 'review_request',
        status: 'open',
        task_id: '20260427-76-review',
        task_number: 76,
        evidence_json: JSON.stringify({ report_id: 'wrr_76' }),
        consumption_rule_json: JSON.stringify({ review_command: 'narada task review 76 --agent kevin --verdict accepted --report wrr_76' }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        consumed_at: null,
        consumed_by: null,
        consumption_ref: null,
      });
      store.upsertLifecycle({
        task_id: '20260427-101-generic-review',
        task_number: 101,
        status: 'in_review',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        closure_mode: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-01-01T00:00:00Z',
      });
      store.upsertTaskSpec({
        task_id: '20260427-101-generic-review',
        task_number: 101,
        title: 'Task 101 Generic Review',
        chapter_markdown: null,
        goal_markdown: 'Review generic work.',
        context_markdown: null,
        required_work_markdown: '1. Review generic work.',
        non_goals_markdown: null,
        acceptance_criteria_json: JSON.stringify(['Reviewed.']),
        dependencies_json: JSON.stringify([]),
        updated_at: '2026-01-01T00:00:00Z',
      });
      store.upsertReportRecord({
        report_id: 'wrr_101',
        task_id: '20260427-101-generic-review',
        assignment_id: 'assign-101',
        agent_id: 'builder',
        reported_at: '2026-01-01T00:00:00Z',
        report_json: JSON.stringify({
          report_id: 'wrr_101',
          task_number: 101,
          task_id: '20260427-101-generic-review',
          agent_id: 'builder',
          assignment_id: 'assign-101',
          reported_at: '2026-01-01T00:00:00Z',
          summary: 'Ready for review.',
          changed_files: [],
          verification: [],
          known_residuals: [],
          ready_for_review: true,
          report_status: 'submitted',
        }),
      });
      store.upsertLifecycle({
        task_id: '20260427-100-generic',
        task_number: 100,
        status: 'opened',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        closure_mode: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-01-01T00:00:00Z',
      });
      store.upsertTaskSpec({
        task_id: '20260427-100-generic',
        task_number: 100,
        title: 'Task 100 Generic',
        chapter_markdown: null,
        goal_markdown: 'Generic task.',
        context_markdown: null,
        required_work_markdown: '1. Do task work.',
        non_goals_markdown: null,
        acceptance_criteria_json: JSON.stringify(['Do task work.']),
        dependencies_json: JSON.stringify([]),
        updated_at: '2026-01-01T00:00:00Z',
      });
    } finally {
      store.db.close();
    }

    const result = await workNextCommand({ agent: 'kevin', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'task_work',
      primary: {
        task_number: 100,
      },
    });
  });

  it('skips review obligations with no referenced lifecycle task', async () => {
    seedRosterEntry(tempDir, 'kevin', 'architect', 'idle', null);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-generic.md'),
      '---\ntask_id: 20260427-100-generic\nstatus: opened\n---\n\n# Task 100 Generic\n\n## Goal\nGeneric task.\n\n## Acceptance Criteria\n- [ ] Do task work.\n',
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertDirectedObligation({
        obligation_id: 'obl_review_unrouted_kevin_stale',
        source_kind: 'task_report',
        source_ref: 'wrr_unrouted',
        source_agent_id: 'bob',
        target_agent_id: 'kevin',
        target_role: 'architect',
        target_ref: 'kevin',
        kind: 'review_request',
        status: 'open',
        task_id: null,
        task_number: null,
        evidence_json: JSON.stringify({ report_id: 'wrr_unrouted' }),
        consumption_rule_json: JSON.stringify({ review_command: 'narada task review <task> --agent kevin --verdict accepted --report wrr_unrouted' }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        consumed_at: null,
        consumed_by: null,
        consumption_ref: null,
      });
      store.upsertLifecycle({
        task_id: '20260427-100-generic',
        task_number: 100,
        status: 'opened',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        closure_mode: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-01-01T00:00:00Z',
      });
      store.upsertTaskSpec({
        task_id: '20260427-100-generic',
        task_number: 100,
        title: 'Task 100 Generic',
        chapter_markdown: null,
        goal_markdown: 'Generic task.',
        context_markdown: null,
        required_work_markdown: '1. Do task work.',
        non_goals_markdown: null,
        acceptance_criteria_json: JSON.stringify(['Do task work.']),
        dependencies_json: JSON.stringify([]),
        updated_at: '2026-01-01T00:00:00Z',
      });
    } finally {
      store.db.close();
    }

    const result = await workNextCommand({ agent: 'kevin', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'task_work',
      primary: {
        task_number: 100,
      },
    });
  });

  it('returns idle when no task or inbox work exists', async () => {
    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'empty',
      action_kind: 'idle',
      agent_id: 'architect',
      primary: null,
      reason: 'no_task_or_inbox_work',
      checked: [
        { zone: 'directed_obligation', status: 'empty', reason: 'no_open_addressed_obligation' },
        { zone: 'task_work', status: 'empty', reason: 'no_admissible_task' },
        { zone: 'review_work', status: 'empty', reason: 'no_reviewable_task' },
        { zone: 'inbox_work', status: 'empty' },
      ],
    });
  });

  it('explains open task work hidden by active review posture instead of returning opaque emptiness', async () => {
    seedRosterEntry(tempDir, 'narada-cpy.builder', 'builder', 'idle', null);
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260430-1-current-review',
        task_number: 1,
        status: 'in_review',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-30T22:00:00.000Z',
      });
      store.upsertTaskSpec({
        task_id: '20260430-1-current-review',
        task_number: 1,
        title: 'Current review',
        chapter_markdown: null,
        goal_markdown: 'Review pending.',
        context_markdown: null,
        required_work_markdown: '1. Wait for review.',
        non_goals_markdown: null,
        acceptance_criteria_json: JSON.stringify(['Reviewed.']),
        dependencies_json: JSON.stringify([]),
        updated_at: '2026-04-30T22:00:00.000Z',
      });
      store.upsertLifecycle({
        task_id: '20260430-2-open-hidden',
        task_number: 2,
        status: 'opened',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-30T22:00:00.000Z',
      });
      store.upsertTaskSpec({
        task_id: '20260430-2-open-hidden',
        task_number: 2,
        title: 'Open but suppressed',
        chapter_markdown: null,
        goal_markdown: 'Should be explained.',
        context_markdown: null,
        required_work_markdown: '1. Do hidden work.',
        non_goals_markdown: null,
        acceptance_criteria_json: JSON.stringify(['Explained.']),
        dependencies_json: JSON.stringify([]),
        updated_at: '2026-04-30T22:00:00.000Z',
      });
      store.insertAssignment({
        assignment_id: 'assign-review',
        task_id: '20260430-1-current-review',
        agent_id: 'narada-cpy.builder',
        claimed_at: '2026-04-30T22:00:00.000Z',
        released_at: null,
        release_reason: null,
        intent: 'primary',
      });
    } finally {
      store.db.close();
    }
    const result = await workNextCommand({ agent: 'narada-cpy.builder', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      blocked_or_hidden_work: {
        status: 'open_work_suppressed_or_hidden',
        items: [{
          task_number: 2,
          title: 'Open but suppressed',
          reason: 'agent_has_active_or_review_pending_work',
          blocking_owner: 'narada-cpy.builder',
          blocking_tasks: [{
            task_number: 1,
            title: 'Current review',
            status: 'in_review',
            owner: 'narada-cpy.builder',
          }],
        }],
      },
    });
  });

  it('surfaces Architect review duty when Builder has no task work because review is pending', async () => {
    seedRosterEntry(tempDir, 'builder', 'builder', 'idle', null);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260430-77-pending-review.md'),
      '---\ntask_id: 20260430-77-pending-review\nstatus: in_review\n---\n\n# Pending review\n\n## Goal\nAwait review.\n',
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260430-77-pending-review',
        task_number: 77,
        status: 'in_review',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-30T22:00:00.000Z',
      });
      store.upsertTaskSpec({
        task_id: '20260430-77-pending-review',
        task_number: 77,
        title: 'Pending review',
        chapter_markdown: null,
        goal_markdown: 'Await review.',
        context_markdown: null,
        required_work_markdown: '1. Review it.',
        non_goals_markdown: null,
        acceptance_criteria_json: JSON.stringify(['Reviewed.']),
        dependencies_json: JSON.stringify([]),
        updated_at: '2026-04-30T22:00:00.000Z',
      });
      store.upsertReportRecord({
        report_id: 'wrr_pending_review_builder',
        task_id: '20260430-77-pending-review',
        assignment_id: 'assign-77',
        agent_id: 'builder',
        reported_at: '2026-04-30T22:00:00.000Z',
        report_json: JSON.stringify({
          report_id: 'wrr_pending_review_builder',
          task_number: 77,
          task_id: '20260430-77-pending-review',
          agent_id: 'builder',
          assignment_id: 'assign-77',
          reported_at: '2026-04-30T22:00:00.000Z',
          summary: 'Ready for review.',
          changed_files: [],
          verification: [],
          known_residuals: [],
          ready_for_review: true,
          report_status: 'submitted',
        }),
      });
    } finally {
      store.db.close();
    }

    const result = await workNextCommand({ agent: 'builder', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'empty',
      action_kind: 'idle',
      next_step: 'Builder no-work is not system idle; Architect/reviewer must clear pending review or closure work.',
      architect_duty_loop: {
        status: 'review_or_closure_pending',
        pending_reviews: [{
          task_number: 77,
          title: 'Pending review',
          report_id: 'wrr_pending_review_builder',
          reported_by: 'builder',
          suggested_owner: 'builder',
          suggested_command: 'narada task review 77 --agent <builder-agent> --verdict accepted',
        }],
      },
    });
  });

  it('surfaces doctrine guard warnings before recommending mutation work', async () => {
    mkdirSync(join(tempDir, 'docs', 'concepts'), { recursive: true });
    mkdirSync(join(tempDir, 'packages', 'layers', 'cli', 'src', 'commands'), { recursive: true });
    writeFileSync(
      join(tempDir, 'docs', 'concepts', 'authority-inversion-inventory.json'),
      JSON.stringify({
        findings: [{
          finding_id: 'resume-tool-process-authority',
          surface: 'resume_work_next',
          visible_artifact: 'work-next command',
          hidden_authority_structure: 'work selection and task claim authority',
          current_guard: 'work-next doctrine guard',
          gap: 'work-next can mutate by claiming work',
          severity: 'warning',
          recommended_follow_up: 'narada coherence scan --module authority_inversion --submit',
        }],
      }, null, 2),
    );
    writeFileSync(join(tempDir, 'packages', 'layers', 'cli', 'src', 'commands', 'work-next.ts'), 'base\n');
    execFileSync(gitBinary(), ['init', '-b', 'main'], { cwd: tempDir });
    execFileSync(gitBinary(), ['config', 'user.email', 'test@example.invalid'], { cwd: tempDir });
    execFileSync(gitBinary(), ['config', 'user.name', 'Test Agent'], { cwd: tempDir });
    execFileSync(gitBinary(), ['add', '.'], { cwd: tempDir });
    execFileSync(gitBinary(), ['commit', '-m', 'base'], { cwd: tempDir });
    writeFileSync(join(tempDir, 'packages', 'layers', 'cli', 'src', 'commands', 'work-next.ts'), 'changed\n');

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'empty',
      doctrine_guard: {
        status: 'warning',
        blockers: [],
        next_commands: ['narada coherence scan --module authority_inversion --submit'],
        mutation_authority_preflight: {
          mutation_family: 'task_lifecycle',
          locus_state: 'authority_locus',
          mutation_safety: 'allowed_with_command',
        },
        publication_authority_preflight: {
          mutation_family: 'publication',
          locus_state: 'authority_locus',
          mutation_safety: 'allowed_with_command',
        },
        warnings: [{
          finding_id: 'resume-tool-process-authority',
          surface: 'resume_work_next',
          changed_file: 'packages/layers/cli/src/commands/work-next.ts',
        }],
      },
    });
  });

  it('returns agent_not_in_roster with repair command before inbox work for non-roster agents', async () => {
    await inboxSubmitCommand({
      cwd: tempDir,
      sourceKind: 'user_chat',
      sourceRef: 'chat:3',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      principal: 'operator',
      payload: '{"title":"Inbox work","goal":"Handle inbox."}',
      format: 'json',
    });

    const result = await workNextCommand({ agent: 'ghost', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'agent_not_in_roster',
      agent_id: 'ghost',
      repair_command: 'narada task roster add <agent-id> --role ghost',
    });
  });

  it('returns operator-surface task-authority repair for admitted identity missing from roster', async () => {
    mkdirSync(join(tempDir, 'operator-surfaces'), { recursive: true });
    writeFileSync(
      join(tempDir, 'operator-surfaces', 'identities.json'),
      JSON.stringify({
        schema: 'https://narada.dev/schemas/operator-surface-identities/v1',
        updated_at: '2026-01-01T00:00:00Z',
        identities: [{
          identity_id: 'narada-andrey.Kevin',
          site_id: 'narada-andrey',
          role: 'architect',
          agent_kind: 'codex_cli',
          label: 'Kevin',
          admitted_by: 'operator',
          admitted_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          authority_limits: [],
        }],
      }, null, 2),
    );

    const result = await workNextCommand({ agent: 'narada-andrey.Kevin', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'agent_not_in_roster',
      repair_command: 'narada operator-surface identity admit-task-authority narada-andrey.Kevin --by <principal>',
      operator_surface_task_authority: {
        status: 'missing_from_task_authority',
        identity_id: 'narada-andrey.Kevin',
        role: 'architect',
      },
    });
  });

  it('resolves site-qualified role address to the exact-one active roster agent before claiming work', async () => {
    seedRosterEntry(tempDir, 'narada-andrey.Bob', 'builder', 'idle', null);
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260430-1100-builder.md'),
      '---\ntask_id: 1100\nstatus: opened\n---\n\n# Task 1100\n\n## Acceptance Criteria\n- [ ] Do builder work.\n',
    );

    const result = await workNextCommand({ agent: 'narada-andrey.builder', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'task_work',
      agent_id: 'narada-andrey.Bob',
      requested_agent: 'narada-andrey.builder',
      resolved_agent: 'narada-andrey.Bob',
      agent_address_resolution: {
        status: 'role_exact_one',
        role: 'builder',
        site_prefix: 'narada-andrey',
        candidates: ['narada-andrey.Bob'],
      },
      primary: { task_number: 1100 },
      task_result: {
        agent_id: 'narada-andrey.Bob',
        requested_agent: 'narada-andrey.Bob',
        resolved_agent: 'narada-andrey.Bob',
      },
    });
    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getRosterEntry('narada-andrey.Bob')?.task_number).toBe(1100);
    } finally {
      store.db.close();
    }
  });

  it('keeps concrete agent ids authoritative when a same-role roster agent exists', async () => {
    seedRosterEntry(tempDir, 'narada-andrey.Bob', 'builder', 'idle', null);
    seedRosterEntry(tempDir, 'narada-andrey.builder', 'builder', 'idle', null);

    const result = await workNextCommand({ agent: 'narada-andrey.builder', cwd: tempDir, format: 'json', peek: true });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      agent_id: 'narada-andrey.builder',
      requested_agent: 'narada-andrey.builder',
      resolved_agent: 'narada-andrey.builder',
      agent_address_resolution: {
        status: 'exact',
        candidates: ['narada-andrey.builder'],
      },
    });
  });

  it('fails closed when a site-qualified role address has no active roster match', async () => {
    const result = await workNextCommand({ agent: 'narada-andrey.builder', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'agent_not_in_roster',
      requested_agent: 'narada-andrey.builder',
      resolved_agent: null,
      agent_address_resolution: {
        status: 'zero_match',
        role: 'builder',
        site_prefix: 'narada-andrey',
        candidates: [],
      },
      repair_command: 'narada task roster add <agent-id> --role builder',
    });
  });

  it('fails closed with competing ids when a role-shaped address is ambiguous', async () => {
    seedRosterEntry(tempDir, 'narada-andrey.Bob', 'builder', 'idle', null);
    seedRosterEntry(tempDir, 'narada-andrey.Alice', 'builder', 'idle', null);

    const result = await workNextCommand({ agent: 'narada-andrey.builder', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'agent_address_ambiguous',
      requested_agent: 'narada-andrey.builder',
      resolved_agent: null,
      agent_address_resolution: {
        status: 'multi_match',
        candidates: ['narada-andrey.Alice', 'narada-andrey.Bob'],
      },
      repair_command: 'Use one concrete agent id: narada-andrey.Alice, narada-andrey.Bob',
    });
  });

  it('treats unqualified role addresses as cross-Site ambiguous while site-qualified addresses resolve locally', async () => {
    seedRosterEntry(tempDir, 'site-a.Bob', 'builder', 'idle', null);
    seedRosterEntry(tempDir, 'site-b.Alice', 'builder', 'idle', null);

    const ambiguous = await workNextCommand({ agent: 'builder', cwd: tempDir, format: 'json' });
    expect(ambiguous.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(ambiguous.result).toMatchObject({
      reason: 'agent_address_ambiguous',
      agent_address_resolution: {
        status: 'multi_match',
        candidates: ['site-a.Bob', 'site-b.Alice'],
      },
    });

    const qualified = await workNextCommand({ agent: 'site-a.builder', cwd: tempDir, format: 'json', peek: true });
    expect(qualified.exitCode).toBe(ExitCode.SUCCESS);
    expect(qualified.result).toMatchObject({
      agent_id: 'site-a.Bob',
      requested_agent: 'site-a.builder',
      resolved_agent: 'site-a.Bob',
      agent_address_resolution: {
        status: 'role_exact_one',
        candidates: ['site-a.Bob'],
      },
    });
  });
});
