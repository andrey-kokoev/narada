import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { Database, SqliteInboxStore } from '@narada2/control-plane';
import { taskWorkboardCommand } from '../../src/commands/task-workboard.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { SqliteTaskLifecycleStore, type TaskStatus } from '../../src/lib/task-lifecycle-store.js';
import { registerTaskOperationsCommands } from '../../src/commands/task-operations-register.js';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai'), { recursive: true });
}

function seedTask(
  store: SqliteTaskLifecycleStore,
  taskNumber: number,
  status: TaskStatus,
  title: string,
  chapter: string,
  agent?: string,
  requiredWork = 'Work',
) {
  const taskId = `20260429-${taskNumber}-workboard`;
  store.upsertLifecycle({
    task_id: taskId,
    task_number: taskNumber,
    status,
    governed_by: null,
    closed_at: null,
    closed_by: null,
    reopened_at: null,
    reopened_by: null,
    continuation_packet_json: null,
    updated_at: new Date().toISOString(),
  });
  store.upsertTaskSpec({
    task_id: taskId,
    task_number: taskNumber,
    title,
    chapter_markdown: chapter,
    goal_markdown: 'Goal',
    context_markdown: 'Context',
    required_work_markdown: requiredWork,
    non_goals_markdown: null,
    acceptance_criteria_json: JSON.stringify(['Done']),
    dependencies_json: JSON.stringify([]),
    updated_at: new Date().toISOString(),
  });
  if (agent) {
    store.insertAssignment({
      assignment_id: `assign-${taskNumber}`,
      task_id: taskId,
      agent_id: agent,
      claimed_at: new Date().toISOString(),
      released_at: null,
      release_reason: null,
      intent: 'primary',
    });
  }
}

describe('task workboard command', () => {
  let tempDir: string;
  let originalAgentId: string | undefined;

  beforeEach(() => {
    originalAgentId = process.env.NARADA_AGENT_ID;
    delete process.env.NARADA_AGENT_ID;
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-workboard-'));
    setupRepo(tempDir);
    const db = new Database(join(tempDir, '.ai', 'task-lifecycle.db'));
    const store = new SqliteTaskLifecycleStore({ db });
    store.initSchema();
    seedTask(store, 401, 'claimed', 'Build feature', 'Operator Surface', 'builder');
    seedTask(store, 402, 'in_review', 'Review feature', 'Operator Surface', 'builder');
    seedTask(store, 403, 'opened', 'Follow up', 'Operator Surface');
    seedTask(store, 404, 'claimed', 'Roster-only active work', 'Operator Surface', undefined, '1. TBD');
    store.upsertRosterEntry({
      agent_id: 'observer',
      role: 'observer',
      capabilities_json: '[]',
      first_seen_at: '2026-01-01T00:00:00Z',
      last_active_at: '2026-01-01T00:00:00Z',
      status: 'working',
      task_number: 404,
      last_done: null,
      updated_at: '2026-01-01T00:00:00Z',
    });
    store.upsertRepoPublication({
      publication_id: 'rpi_test',
      repo_root: tempDir,
      branch: 'main',
      remote: 'origin',
      commit_hash: 'abc',
      base_ref: 'origin/main',
      bundle_path: '.ai/publications/rpi_test/rpi_test.bundle',
      patch_path: '.ai/publications/rpi_test/rpi_test.patch',
      task_number: 402,
      requester_id: 'architect',
      requested_at: new Date().toISOString(),
      status: 'prepared',
      pushed_at: null,
      confirmed_by: null,
      confirmation_json: '{}',
      failure_reason: null,
      updated_at: new Date().toISOString(),
    });
    db.close();

    const inbox = new SqliteInboxStore(join(tempDir, '.ai', 'inbox.db'));
    inbox.insert({
      envelope_id: 'env_workboard',
      received_at: new Date().toISOString(),
      source: { kind: 'user_chat', ref: 'operator:workboard' },
      target_locus: 'narada-proper.builder',
      kind: 'observation',
      authority: { level: 'operator_confirmed', principal: 'operator' },
      payload: { title: 'payload should not be surfaced' },
    });
    inbox.close();
  });

  afterEach(() => {
    if (originalAgentId === undefined) {
      delete process.env.NARADA_AGENT_ID;
    } else {
      process.env.NARADA_AGENT_ID = originalAgentId;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns bounded current work and review posture', async () => {
    const result = await taskWorkboardCommand({ cwd: tempDir, format: 'json', limit: 10 });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const workboard = result.result as {
      pending_reviews: Array<{ task_number: number }>;
      in_progress: Array<{ task_number: number; assigned_agent: string; handoff_actionability: { status: string } }>;
      local_followups: Array<{ task_number: number }>;
      active_chapters: Array<{ chapter: string; pending_reviews: number; in_progress: number }>;
      source_envelopes: Array<{ envelope_id: string; source_ref: string; target_locus: string | null }>;
      upstream_publications: Array<{ publication_id: string }>;
      review_handoff_requirements: string[];
      closure_semantics: string[];
      followup_task_path: string[];
      concurrency_boundaries: string[];
    };

    expect(workboard.pending_reviews.map((task) => task.task_number)).toEqual([402]);
    expect(workboard.in_progress).toContainEqual(expect.objectContaining({ task_number: 401, assigned_agent: 'builder' }));
    expect(workboard.in_progress).toContainEqual(expect.objectContaining({
      task_number: 404,
      assigned_agent: 'observer',
      handoff_actionability: expect.objectContaining({ status: 'underspecified' }),
    }));
    expect(workboard.local_followups.map((task) => task.task_number)).toContain(403);
    expect(workboard.active_chapters[0]).toMatchObject({ chapter: 'Operator Surface', pending_reviews: 1, in_progress: 2 });
    expect(workboard.source_envelopes).toEqual([expect.objectContaining({
      envelope_id: 'env_workboard',
      source_ref: 'operator:workboard',
      target_locus: 'narada-proper.builder',
    })]);
    expect(JSON.stringify(workboard.source_envelopes)).not.toContain('payload should not be surfaced');
    expect(workboard.upstream_publications).toEqual([expect.objectContaining({ publication_id: 'rpi_test' })]);
    expect(workboard.review_handoff_requirements.join(' ')).toContain('changed files');
    expect(workboard.closure_semantics.join(' ')).toContain('fully_integrated');
    expect(workboard.followup_task_path.join(' ')).toContain('narada task handoff');
    expect(workboard.concurrency_boundaries.join(' ')).toContain('Builder source files are dirty');
  });

  it('renders bounded human output', async () => {
    const result = await taskWorkboardCommand({ cwd: tempDir, format: 'human', limit: 10 });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const human = String((result.result as { _formatted: string })._formatted);
    expect(human).toContain('Current Workboard');
    expect(human).toContain('Pending Reviews:');
    expect(human).not.toContain('payload should not be surfaced');
  });

  it('returns compact architect-loop output without stable guidance by default', async () => {
    const result = await taskWorkboardCommand({ cwd: tempDir, format: 'json', limit: 10, view: 'compact' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const compact = result.result as {
      view: string;
      counts: Record<string, number>;
      pending_reviews: Array<{ task_number: number }>;
      in_progress: Array<{ task_number: number }>;
      high_priority_diagnostics: string[];
      recommended_command: string;
      review_handoff_requirements?: string[];
      closure_semantics?: string[];
      concurrency_boundaries?: string[];
      source_envelopes: Array<{ envelope_id: string; target_locus: string | null }>;
    };

    expect(compact.view).toBe('compact');
    expect(compact.counts).toMatchObject({
      pending_reviews: 1,
      in_progress: 2,
      local_followups: 1,
      deferred: 0,
      prepared_publications: 1,
    });
    expect(compact.pending_reviews.map((task) => task.task_number)).toEqual([402]);
    expect(compact.in_progress.map((task) => task.task_number)).toEqual([404, 401]);
    expect(compact.high_priority_diagnostics).toEqual(expect.arrayContaining([
      'underspecified_handoffs:404',
      'pending_reviews:402',
      'prepared_publications:rpi_test',
    ]));
    expect(compact.recommended_command).toBe('narada task workboard --view compact --format json');
    expect(compact.source_envelopes).toEqual([expect.objectContaining({
      envelope_id: 'env_workboard',
      target_locus: 'narada-proper.builder',
    })]);
    expect(compact.review_handoff_requirements).toBeUndefined();
    expect(compact.closure_semantics).toBeUndefined();
    expect(compact.concurrency_boundaries).toBeUndefined();
    expect(JSON.stringify(compact)).not.toContain('Reviewer must not infer completion');
  });

  it('does not surface open review obligations for terminal tasks', async () => {
    const db = new Database(join(tempDir, '.ai', 'task-lifecycle.db'));
    const store = new SqliteTaskLifecycleStore({ db });
    store.initSchema();
    try {
      seedTask(store, 405, 'confirmed', 'Already confirmed', 'Operator Surface');
      store.upsertDirectedObligation({
        obligation_id: 'obl_review_405_architect_stale',
        source_kind: 'task_report',
        source_ref: 'wrr_405',
        source_agent_id: 'builder',
        target_agent_id: 'architect',
        target_role: 'architect',
        target_ref: null,
        kind: 'review_request',
        status: 'open',
        task_id: '20260429-405-workboard',
        task_number: 405,
        evidence_json: JSON.stringify({ report_id: 'wrr_405' }),
        consumption_rule_json: JSON.stringify({
          review_command: 'narada task review 405 --agent architect --verdict accepted --report wrr_405',
        }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        consumed_at: null,
        consumed_by: null,
        consumption_ref: null,
      });
    } finally {
      db.close();
    }

    const result = await taskWorkboardCommand({ cwd: tempDir, format: 'json', limit: 10, view: 'compact', agent: 'architect' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const compact = result.result as {
      counts: { my_review_obligations: number };
      my_review_obligations: Array<{ obligation_id: string }>;
      high_priority_diagnostics: string[];
    };

    expect(compact.counts.my_review_obligations).toBe(0);
    expect(compact.my_review_obligations).toEqual([]);
    expect(compact.high_priority_diagnostics).not.toContain('my_review_obligations:405');
  });

  it('surfaces source identity refs on my review obligations', async () => {
    const db = new Database(join(tempDir, '.ai', 'task-lifecycle.db'));
    const store = new SqliteTaskLifecycleStore({ db });
    store.initSchema();
    try {
      seedTask(store, 406, 'in_review', 'Active review', 'Operator Surface');
      store.upsertDirectedObligation({
        obligation_id: 'obl_review_406_architect',
        source_kind: 'task_report',
        source_ref: 'wrr_406',
        source_agent_id: 'builder',
        target_agent_id: 'architect',
        target_role: 'architect',
        target_ref: null,
        kind: 'review_request',
        status: 'open',
        task_id: '20260429-406-workboard',
        task_number: 406,
        evidence_json: JSON.stringify({ report_id: 'wrr_406' }),
        consumption_rule_json: JSON.stringify({
          review_command: 'narada task review 406 --agent architect --verdict accepted --report wrr_406',
        }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        consumed_at: null,
        consumed_by: null,
        consumption_ref: null,
      });
    } finally {
      db.close();
    }

    const result = await taskWorkboardCommand({ cwd: tempDir, format: 'json', limit: 10, view: 'compact', agent: 'architect' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const compact = result.result as {
      counts: { my_review_obligations: number };
      my_review_obligations: Array<{ obligation_id: string; source_agent_identity_ref: { schema: string; identity_scope: { kind: string }; local_agent_id: string; role: string; canonical_agent_id: string; display: string; legacy_agent_id: string } }>;
    };

    expect(compact.counts.my_review_obligations).toBe(1);
    expect(compact.my_review_obligations[0]).toMatchObject({
      obligation_id: 'obl_review_406_architect',
      source_agent_identity_ref: {
        schema: 'narada.agent_identity_ref.v2',
        identity_scope: { kind: 'unscoped' },
        local_agent_id: 'builder',
        role: 'builder',
        canonical_agent_id: 'builder',
        display: 'builder',
        legacy_agent_id: 'builder',
      },
    });
  });

  it('accepts the remembered compact workboard CLI shape at the commander boundary', async () => {
    const originalArgv = process.argv;
    const output: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      output.push(String(line));
    });
    const program = new Command();
    program.exitOverride();
    const task = program.command('task');
    registerTaskOperationsCommands(task);

    const argv = [
      'node',
      'narada',
      'task',
      'workboard',
      '--cwd',
      tempDir,
      '--view',
      'compact',
      '--format',
      'json',
    ];
    try {
      process.argv = argv;
      await program.parseAsync(argv);
    } finally {
      process.argv = originalArgv;
      log.mockRestore();
    }

    const compact = JSON.parse(output.join('\n')) as {
      view: string;
      recommended_command: string;
      counts: Record<string, number>;
    };
    expect(compact.view).toBe('compact');
    expect(compact.recommended_command).toBe('narada task workboard --view compact --format json');
    expect(compact.counts.pending_reviews).toBe(1);
  });

  it('can include stable guidance in compact output explicitly', async () => {
    const result = await taskWorkboardCommand({
      cwd: tempDir,
      format: 'json',
      limit: 10,
      view: 'compact',
      includeGuidance: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const compact = result.result as {
      review_handoff_requirements?: string[];
      closure_semantics?: string[];
      concurrency_boundaries?: string[];
    };

    expect(compact.review_handoff_requirements?.join(' ')).toContain('changed files');
    expect(compact.closure_semantics?.join(' ')).toContain('fully_integrated');
    expect(compact.concurrency_boundaries?.join(' ')).toContain('Builder source files are dirty');
  });
});
