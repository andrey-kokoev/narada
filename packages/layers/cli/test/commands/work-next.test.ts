import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inboxSubmitCommand } from '../../src/commands/inbox.js';
import { workNextCommand } from '../../src/commands/work-next.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';

function setupRepo(tempDir: string): void {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
  seedRosterEntry(tempDir, 'architect', 'architect', 'idle', null);
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
      checked: [{ zone: 'task_work', status: 'selected', selected_ref: 'task:100' }],
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

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'review_work',
      agent_id: 'architect',
      checked: [
        { zone: 'task_work', status: 'empty', reason: 'no_admissible_task' },
        { zone: 'review_work', status: 'selected', selected_ref: 'task:101' },
      ],
      primary: {
        task_number: 101,
        status: 'in_review',
        command_args: ['task', 'review', '101', '--agent', 'architect', '--verdict', 'accepted'],
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
        { zone: 'task_work', status: 'empty', reason: 'no_admissible_task' },
        { zone: 'review_work', status: 'empty', reason: 'no_reviewable_task' },
        { zone: 'inbox_work', status: 'empty' },
      ],
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
    execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['init', '-b', 'main'], { cwd: tempDir });
    execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['config', 'user.email', 'test@example.invalid'], { cwd: tempDir });
    execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['config', 'user.name', 'Test Agent'], { cwd: tempDir });
    execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['add', '.'], { cwd: tempDir });
    execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['commit', '-m', 'base'], { cwd: tempDir });
    writeFileSync(join(tempDir, 'packages', 'layers', 'cli', 'src', 'commands', 'work-next.ts'), 'changed\n');

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'empty',
      doctrine_guard: {
        status: 'warning',
        blockers: [],
        next_commands: ['narada coherence scan --module authority_inversion --submit'],
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
