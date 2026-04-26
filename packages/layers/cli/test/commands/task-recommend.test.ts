import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { taskRecommendCommand } from '../../src/commands/task-recommend.js';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { taskReportCommand } from '../../src/commands/task-report.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { openTaskLifecycleStore, type TaskStatus } from '../../src/lib/task-lifecycle-store.js';
import { saveReport } from '../../src/lib/task-governance.js';
import * as taskRecommender from '../../src/lib/task-recommender.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'reports'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'learning', 'accepted'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'agent-alpha', role: 'implementer', capabilities: ['typescript', 'testing', 'cli'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'agent-beta', role: 'implementer', capabilities: ['database', 'architecture'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'agent-gamma', role: 'reviewer', capabilities: ['typescript', 'testing'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );

  // Task 998: opened, TypeScript/CLI task
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-typescript-task.md'),
    '---\ntask_id: 998\nstatus: opened\n---\n\n# Task 998: TypeScript CLI Feature\n\nImplement a new CLI command in TypeScript.\n',
  );

  // Task 999: opened, database task
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-database-task.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Database Schema Update\n\nUpdate the SQLite schema for new tables.\n',
  );

  // Task 997: opened, blocked by dependency
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-997-blocked-task.md'),
    '---\ntask_id: 997\nstatus: opened\ndepends_on:\n  - 998\n---\n\n# Task 997: Blocked Task\n\nDepends on task 998.\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'learning', 'accepted', '20260422-005-recommend.json'),
    JSON.stringify({
      artifact_id: '20260422-005',
      state: 'accepted',
      title: 'Recommendation operativity',
      content: {
        principle: 'Recommendations become operative unless rejected and roster must be updated immediately after accepted recommendation.',
      },
      scopes: ['recommendation', 'assignment', 'task-governance'],
    }, null, 2),
  );

  const store = openTaskLifecycleStore(tempDir);
  try {
    for (const agent of [
      { agent_id: 'agent-alpha', role: 'implementer', capabilities: ['typescript', 'testing', 'cli'] },
      { agent_id: 'agent-beta', role: 'implementer', capabilities: ['database', 'architecture'] },
      { agent_id: 'agent-gamma', role: 'reviewer', capabilities: ['typescript', 'testing'] },
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
    for (const taskNumber of [997, 998, 999]) {
      seedLifecycle(store, taskNumber, 'opened');
    }
    seedSpec(store, 997, 'Blocked Task', [998]);
    seedSpec(store, 998, 'TypeScript CLI Feature', []);
    seedSpec(store, 999, 'Database Schema Update', []);
  } finally {
    store.db.close();
  }
}

function seedLifecycle(store: ReturnType<typeof openTaskLifecycleStore>, taskNumber: number, status: TaskStatus): void {
  const taskIdByNumber: Record<number, string> = {
    996: '20260420-996-review-task',
    997: '20260420-997-blocked-task',
    998: '20260420-998-typescript-task',
    999: '20260420-999-database-task',
  };
  store.upsertLifecycle({
    task_id: taskIdByNumber[taskNumber] ?? `20260420-${taskNumber}-task`,
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
}

function setLifecycleStatus(tempDir: string, taskNumber: number, status: TaskStatus): void {
  const store = openTaskLifecycleStore(tempDir);
  try {
    seedLifecycle(store, taskNumber, status);
    if (!store.getTaskSpecByNumber(taskNumber)) {
      seedSpec(store, taskNumber, `Task ${taskNumber}`, []);
    }
  } finally {
    store.db.close();
  }
}

function seedSpec(
  store: ReturnType<typeof openTaskLifecycleStore>,
  taskNumber: number,
  title: string,
  dependencies: number[],
): void {
  const taskIdByNumber: Record<number, string> = {
    996: '20260420-996-review-task',
    997: '20260420-997-blocked-task',
    998: '20260420-998-typescript-task',
    999: '20260420-999-database-task',
  };
  store.upsertTaskSpec({
    task_id: taskIdByNumber[taskNumber] ?? `20260420-${taskNumber}-task`,
    task_number: taskNumber,
    title,
    chapter_markdown: null,
    goal_markdown: null,
    context_markdown: null,
    required_work_markdown: null,
    non_goals_markdown: null,
    acceptance_criteria_json: JSON.stringify([]),
    dependencies_json: JSON.stringify(dependencies),
    updated_at: new Date().toISOString(),
  });
}

describe('task recommend operator', () => {
  let tempDir: string;
  let baselineDir: string;

  beforeAll(() => {
    baselineDir = mkdtempSync(join(tmpdir(), 'narada-task-recommend-baseline-'));
    setupRepo(baselineDir);
  });

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-recommend-test-'));
    cpSync(baselineDir, tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  afterAll(() => {
    rmSync(baselineDir, { recursive: true, force: true });
  });

  it('recommends idle capable agent for unblocked opened task', async () => {
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json', full: true });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as {
      primary: { task_id: string; principal_id: string; score: number } | null;
      guidance: unknown[];
    };
    expect(rec.primary).not.toBeNull();
    expect(rec.primary!.score).toBeGreaterThan(0);
    // agent-alpha has typescript + testing + cli capabilities; should match task 998 (typescript/cli)
    expect(rec.primary!.principal_id).toBe('agent-alpha');
    expect(rec.guidance.length).toBeGreaterThan(0);
    expect(rec.guidance[0]).toMatchObject({
      artifact_id: '20260422-005',
    });
  });

  it('does not recommend blocked task', async () => {
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json', full: true });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { abstained: Array<{ task_id: string; reason: string }> };
    const blocked = rec.abstained.find((a) => a.task_id.includes('997'));
    expect(blocked).toBeDefined();
    expect(blocked!.reason).toContain('Blocked');
  });

  it('records architect provenance when --architect is provided', async () => {
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json', architect: 'architect-codex' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { recommender_id: string };
    expect(rec.recommender_id).toBe('architect-codex');
  });

  it('defaults recommender_id to system when no architect is provided', async () => {
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json', full: true });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { recommender_id: string };
    expect(rec.recommender_id).toBe('system');
  });

  it('prefers idle agent over working agent', async () => {
    // Claim task 998 for agent-alpha (makes them working)
    await taskClaimCommand({ taskNumber: '998', agent: 'agent-alpha', cwd: tempDir, format: 'json' });

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { principal_id: string } | null };
    // agent-alpha is now working, so agent-beta should be recommended for task 999
    expect(rec.primary).not.toBeNull();
    expect(rec.primary!.principal_id).toBe('agent-beta');
  });

  it('filters by --agent', async () => {
    const result = await taskRecommendCommand({
      cwd: tempDir,
      agent: 'agent-beta',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { principal_id: string } | null };
    expect(rec.primary).not.toBeNull();
    expect(rec.primary!.principal_id).toBe('agent-beta');
  });

  it('returns structured agent_not_found for unknown agent filters', async () => {
    const result = await taskRecommendCommand({
      cwd: tempDir,
      agent: 'architect',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'agent_not_found',
      agent: 'architect',
      action: 'recommend',
    });
  });

  it('bounds abstained JSON output by default', async () => {
    const abstained = Array.from({ length: 20 }, (_, i) => ({
      task_id: `task-${i + 1}`,
      task_number: i + 1,
      reason: 'Blocked by unmet dependencies',
      blocked_by: [1],
      blocked_by_agents: [{ task_number: 1, agent_id: 'agent-alpha' }],
    }));
    const spy = vi.spyOn(taskRecommender, 'generateRecommendations').mockResolvedValue({
      recommendation_id: 'rec-test',
      generated_at: '2026-01-01T00:00:00Z',
      recommender_id: 'system',
      primary: null,
      alternatives: [],
      abstained,
      summary: '0 recommendations, 0 alternatives, 20 abstained.',
    });

    const result = await taskRecommendCommand({
      cwd: tempDir,
      format: 'json',
      limit: 1,
      ignorePosture: true,
    });

    spy.mockRestore();
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const rec = result.result as {
      abstained: unknown[];
      abstained_total: number;
      abstained_returned: number;
      abstained_truncated: boolean;
      abstained_limit: number;
    };
    expect(rec.abstained).toHaveLength(1);
    expect(rec.abstained_total).toBe(20);
    expect(rec.abstained_returned).toBe(1);
    expect(rec.abstained_truncated).toBe(true);
    expect(rec.abstained_limit).toBe(1);
  });

  it('returns full abstained JSON output only with explicit full opt-in', async () => {
    const abstained = Array.from({ length: 20 }, (_, i) => ({
      task_id: `task-${i + 1}`,
      task_number: i + 1,
      reason: 'Blocked by unmet dependencies',
    }));
    const spy = vi.spyOn(taskRecommender, 'generateRecommendations').mockResolvedValue({
      recommendation_id: 'rec-test',
      generated_at: '2026-01-01T00:00:00Z',
      recommender_id: 'system',
      primary: null,
      alternatives: [],
      abstained,
      summary: '0 recommendations, 0 alternatives, 20 abstained.',
    });

    const result = await taskRecommendCommand({
      cwd: tempDir,
      format: 'json',
      limit: 1,
      full: true,
      ignorePosture: true,
    });

    spy.mockRestore();
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const rec = result.result as {
      abstained: unknown[];
      abstained_total: number;
      abstained_returned: number;
      abstained_truncated: boolean;
      abstained_limit: null;
    };
    expect(rec.abstained).toHaveLength(20);
    expect(rec.abstained_total).toBe(20);
    expect(rec.abstained_returned).toBe(20);
    expect(rec.abstained_truncated).toBe(false);
    expect(rec.abstained_limit).toBeNull();
  });

  it('filters by --task', async () => {
    const result = await taskRecommendCommand({
      cwd: tempDir,
      taskNumber: '999',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { task_id: string } | null };
    expect(rec.primary).not.toBeNull();
    expect(rec.primary!.task_id).toBe('20260420-999-database-task');
  });

  it('surfaces high write-set risk', async () => {
    // Claim and report task 998 (released, in_review)
    await taskClaimCommand({ taskNumber: '998', agent: 'agent-alpha', cwd: tempDir, format: 'json' });
    await taskReportCommand({
      taskNumber: '998',
      agent: 'agent-alpha',
      summary: 'Done',
      changedFiles: 'src/shared.ts',
      cwd: tempDir,
      format: 'json',
    });

    // Reset task 998 to opened so it can be recommended again
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-typescript-task.md'),
      '---\ntask_id: 998\nstatus: opened\n---\n\n# Task 998: TypeScript CLI Feature\n',
    );
    setLifecycleStatus(tempDir, 998, 'opened');

    // Claim task 999 for agent-beta and KEEP it claimed (don't report/release)
    await taskClaimCommand({ taskNumber: '999', agent: 'agent-beta', cwd: tempDir, format: 'json' });

    // Persist a report for task 999 with overlapping changed files
    // (simulating that the agent has declared intent to touch these files)
    await saveReport(tempDir, {
      report_id: 'wrr_999_20260420-999-database-task_agent-beta',
      task_number: 999,
      task_id: '20260420-999-database-task',
      agent_id: 'agent-beta',
      assignment_id: 'test',
      reported_at: new Date().toISOString(),
      summary: 'In progress',
      changed_files: ['src/shared.ts'],
      verification: [],
      known_residuals: [],
      ready_for_review: false,
      report_status: 'submitted',
    });

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as {
      primary: { risks: Array<{ category: string; severity: string }> } | null;
      alternatives: Array<{ risks: Array<{ category: string; severity: string }> }>;
    };

    // Find any candidate with write_set risk
    const allCandidates = [rec.primary, ...rec.alternatives].filter(Boolean);
    const hasWriteSetRisk = allCandidates.some((c) =>
      c!.risks.some((r) => r.category === 'write_set'),
    );
    expect(hasWriteSetRisk).toBe(true);
  });

  it('does not mutate any files', async () => {
    const beforeTasks = readdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks')).filter((f) => f.endsWith('.md'));
    const beforeRoster = readFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), 'utf8');

    await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    const afterTasks = readdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks')).filter((f) => f.endsWith('.md'));
    const afterRoster = readFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), 'utf8');

    expect(afterTasks).toEqual(beforeTasks);
    expect(afterRoster).toBe(beforeRoster);
  });

  it('produces stable JSON output', async () => {
    const result1 = await taskRecommendCommand({ cwd: tempDir, format: 'json' });
    const result2 = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result1.exitCode).toBe(result2.exitCode);
    const rec1 = result1.result as TaskRecommendation;
    const rec2 = result2.result as TaskRecommendation;
    expect(rec1.primary?.task_id).toBe(rec2.primary?.task_id);
    expect(rec1.primary?.principal_id).toBe(rec2.primary?.principal_id);
  });

  it('degrades gracefully when PrincipalRuntime registry is missing', async () => {
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { principal_id: string } | null };
    expect(rec.primary).not.toBeNull();
    // Should still produce recommendations based on roster alone
    expect(rec.primary!.principal_id).toBeTruthy();
  });

  it('returns no primary when all tasks abstained', async () => {
    // Mark all tasks as claimed
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-typescript-task.md'),
      '---\ntask_id: 998\nstatus: claimed\n---\n\n# Task 998\n',
    );
    setLifecycleStatus(tempDir, 998, 'claimed');
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-database-task.md'),
      '---\ntask_id: 999\nstatus: claimed\n---\n\n# Task 999\n',
    );
    setLifecycleStatus(tempDir, 999, 'claimed');

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const rec = result.result as { primary: null; abstained: unknown[] };
    expect(rec.primary).toBeNull();
    expect(rec.abstained.length).toBeGreaterThan(0);
  });

  it('in_review task is not implementation-recommended', async () => {
    // Mark task 998 as in_review
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-typescript-task.md'),
      '---\ntask_id: 998\nstatus: in_review\n---\n\n# Task 998\n',
    );
    setLifecycleStatus(tempDir, 998, 'in_review');

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { task_id: string } | null };
    // Should recommend task 999, not 998
    expect(rec.primary).not.toBeNull();
    expect(rec.primary!.task_id).toBe('20260420-999-database-task');
  });

  it('classifies in_review tasks as awaiting review in abstained list', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-996-review-task.md'),
      '---\ntask_id: 996\nstatus: in_review\n---\n\n# Task 996: Review Needed\n\nDone.\n',
    );
    setLifecycleStatus(tempDir, 996, 'in_review');

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { abstained: Array<{ task_id: string; reason: string }> };
    const inReviewAbstained = rec.abstained.find((a) => a.task_id === '20260420-996-review-task');
    expect(inReviewAbstained).toBeDefined();
    expect(inReviewAbstained!.reason).toContain('review or closure');
  });

  it('warns when posture is missing', async () => {
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { posture_warning?: string };
    expect(rec.posture_warning).toBeDefined();
    expect(rec.posture_warning).toContain('No active CCC posture');
  });

  it('warns when posture is expired', async () => {
    mkdirSync(join(tempDir, '.ai', 'postures'), { recursive: true });
    writeFileSync(
      join(tempDir, '.ai', 'postures', 'current.json'),
      JSON.stringify({
        posture_id: 'expired',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        source: 'manual',
        coordinates: {
          semantic_resolution: { reading: 'stable', evidence: 'ok' },
          invariant_preservation: { reading: 'strong', evidence: 'ok' },
          constructive_executability: { reading: 'strong', evidence: 'ok' },
          grounded_universalization: { reading: 'healthy', evidence: 'ok' },
          authority_reviewability: { reading: 'strong', evidence: 'ok' },
          teleological_pressure: { reading: 'focused', evidence: 'ok' },
        },
        counterweight_intent: 'test',
        recommended_next_slices: [],
        expires_at: '2020-01-01T00:00:00Z',
      }),
    );

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { posture_warning?: string };
    expect(rec.posture_warning).toBeDefined();
    expect(rec.posture_warning).toContain('expired');
  });

  it('boosts runnable-proof tasks when constructive_executability is low', async () => {
    // Add a task with "test" in the title
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-995-test-task.md'),
      '---\ntask_id: 995\nstatus: opened\n---\n\n# Task 995: Add Test Fixture\n\nImplement a test fixture.\n',
    );

    mkdirSync(join(tempDir, '.ai', 'postures'), { recursive: true });
    writeFileSync(
      join(tempDir, '.ai', 'postures', 'current.json'),
      JSON.stringify({
        posture_id: 'low-exec',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        source: 'manual',
        coordinates: {
          semantic_resolution: { reading: 'stable', evidence: 'ok' },
          invariant_preservation: { reading: 'strong', evidence: 'ok' },
          constructive_executability: { reading: 'weak', evidence: 'build is red' },
          grounded_universalization: { reading: 'healthy', evidence: 'ok' },
          authority_reviewability: { reading: 'strong', evidence: 'ok' },
          teleological_pressure: { reading: 'focused', evidence: 'ok' },
        },
        counterweight_intent: 'test',
        recommended_next_slices: [],
        expires_at: '2026-12-31T23:59:59Z',
      }),
    );

    // Get baseline without posture
    const baselineResult = await taskRecommendCommand({ cwd: tempDir, format: 'json', ignorePosture: true });
    const baseline = baselineResult.result as { alternatives: Array<{ task_id: string; score: number }> };
    const baselineTestScore = baseline.alternatives.find((a) => a.task_id === '20260420-995-test-task')?.score ?? 0;

    // Get with posture
    const postureResult = await taskRecommendCommand({ cwd: tempDir, format: 'json' });
    const postureRec = postureResult.result as { alternatives: Array<{ task_id: string; score: number }>; posture_adjustments?: string[] };
    const postureTestScore = postureRec.alternatives.find((a) => a.task_id === '20260420-995-test-task')?.score ?? 0;

    expect(postureRec.posture_adjustments).toBeDefined();
    expect(postureRec.posture_adjustments!.some((r) => r.includes('constructive_executability'))).toBe(true);
    // The test task should be boosted relative to baseline
    expect(postureTestScore).toBeGreaterThanOrEqual(baselineTestScore);
  });

  it('penalizes meta tasks when teleological_pressure is unfocused', async () => {
    // Add a meta task
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-994-meta-task.md'),
      '---\ntask_id: 994\nstatus: opened\n---\n\n# Task 994: Governance Contract Update\n\nUpdate the governance contract.\n',
    );

    mkdirSync(join(tempDir, '.ai', 'postures'), { recursive: true });
    writeFileSync(
      join(tempDir, '.ai', 'postures', 'current.json'),
      JSON.stringify({
        posture_id: 'diffuse',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        source: 'manual',
        coordinates: {
          semantic_resolution: { reading: 'stable', evidence: 'ok' },
          invariant_preservation: { reading: 'strong', evidence: 'ok' },
          constructive_executability: { reading: 'strong', evidence: 'ok' },
          grounded_universalization: { reading: 'healthy', evidence: 'ok' },
          authority_reviewability: { reading: 'strong', evidence: 'ok' },
          teleological_pressure: { reading: 'diffuse', evidence: 'no clear target' },
        },
        counterweight_intent: 'test',
        recommended_next_slices: [],
        expires_at: '2026-12-31T23:59:59Z',
      }),
    );

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });
    const rec = result.result as { posture_adjustments?: string[] };

    expect(rec.posture_adjustments).toBeDefined();
    expect(rec.posture_adjustments!.some((r) => r.includes('teleological_pressure'))).toBe(true);
  });

  it('--ignore-posture disables CCC scoring', async () => {
    mkdirSync(join(tempDir, '.ai', 'postures'), { recursive: true });
    writeFileSync(
      join(tempDir, '.ai', 'postures', 'current.json'),
      JSON.stringify({
        posture_id: 'ignore-test',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        source: 'manual',
        coordinates: {
          semantic_resolution: { reading: 'stable', evidence: 'ok' },
          invariant_preservation: { reading: 'strong', evidence: 'ok' },
          constructive_executability: { reading: 'weak', evidence: 'build is red' },
          grounded_universalization: { reading: 'healthy', evidence: 'ok' },
          authority_reviewability: { reading: 'strong', evidence: 'ok' },
          teleological_pressure: { reading: 'focused', evidence: 'ok' },
        },
        counterweight_intent: 'test',
        recommended_next_slices: [],
        expires_at: '2026-12-31T23:59:59Z',
      }),
    );

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json', ignorePosture: true });
    const rec = result.result as { posture_adjustments?: string[]; posture_warning?: string };

    expect(rec.posture_adjustments).toBeUndefined();
    expect(rec.posture_warning).toBeUndefined();
  });

  it('human default output is terse and omits guidance', async () => {
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'human' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const formatted = (result.result as { _formatted?: string })._formatted ?? '';
    expect(formatted.includes('Active guidance:')).toBe(false);
  });

  it('human verbose output includes guidance', async () => {
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'human', verbose: true });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const formatted = (result.result as { _formatted?: string })._formatted ?? '';
    expect(formatted.includes('Active guidance:')).toBe(true);
  });

  it('excludes chapter range files from recommendation candidates', async () => {
    // Create a chapter file that would appear as an opened task
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-995-999-chapter-artifact.md'),
      '---\nstatus: opened\n---\n\n# Chapter 995–999\n\nA chapter artifact.\n',
    );

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { task_id: string } | null; alternatives: Array<{ task_id: string }>; abstained: Array<{ task_id: string }> };
    const allTaskIds = [
      rec.primary?.task_id,
      ...rec.alternatives.map((a) => a.task_id),
      ...rec.abstained.map((a) => a.task_id),
    ].filter(Boolean);
    expect(allTaskIds).not.toContain('20260420-995-999-chapter-artifact');
  });

  it('excludes derivative files from recommendation candidates', async () => {
    // Create a derivative file that would appear as an opened task
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-994-task-DONE.md'),
      '---\nstatus: opened\n---\n\n# Task 994 Done\n\nDerivative artifact.\n',
    );

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { task_id: string } | null; alternatives: Array<{ task_id: string }>; abstained: Array<{ task_id: string }> };
    const allTaskIds = [
      rec.primary?.task_id,
      ...rec.alternatives.map((a) => a.task_id),
      ...rec.abstained.map((a) => a.task_id),
    ].filter(Boolean);
    expect(allTaskIds).not.toContain('20260420-994-task-DONE');
  });

  it('recommends executable task when chapter file shares overlapping numbers', async () => {
    // Create a chapter range that overlaps with an executable task number
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-990-995-chapter-range.md'),
      '---\nstatus: opened\n---\n\n# Chapter 990–995\n',
    );
    // Create executable task 991 inside the chapter range
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-991-executable-task.md'),
      '---\ntask_id: 991\nstatus: opened\n---\n\n# Task 991: Executable Task Inside Range\n\nDo something.\n',
    );

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { task_id: string } | null; alternatives: Array<{ task_id: string }>; abstained: Array<{ task_id: string }> };
    const allTaskIds = [
      rec.primary?.task_id,
      ...rec.alternatives.map((a) => a.task_id),
      ...rec.abstained.map((a) => a.task_id),
    ].filter(Boolean);
    // Chapter should not appear
    expect(allTaskIds).not.toContain('20260420-990-995-chapter-range');
    // Executable task should appear
    expect(allTaskIds).toContain('20260420-991-executable-task');
  });

  it('filters by specific executable task number despite chapter files', async () => {
    // Create a chapter range
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-980-985-chapter-range.md'),
      '---\nstatus: opened\n---\n\n# Chapter 980–985\n',
    );

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json', taskNumber: '998' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { task_id: string } | null; alternatives: Array<{ task_id: string }>; abstained: Array<{ task_id: string }> };
    // Should only recommend task 998, not the chapter
    expect(rec.primary?.task_id).toBe('20260420-998-typescript-task');
    const allTaskIds = [
      rec.primary?.task_id,
      ...rec.alternatives.map((a) => a.task_id),
      ...rec.abstained.map((a) => a.task_id),
    ].filter(Boolean);
    expect(allTaskIds).not.toContain('20260420-980-985-chapter-range');
  });

  it('excludes chapter closure tasks from recommendation candidates', async () => {
    // Create a chapter closure file with opened status
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-975-mail-connectivity-chapter-closure.md'),
      '---\nstatus: opened\ndepends_on: [998]\n---\n\n# Task 975 - Mail Connectivity Chapter Closure\n',
    );

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { task_id: string } | null; alternatives: Array<{ task_id: string }>; abstained: Array<{ task_id: string }> };
    const allTaskIds = [
      rec.primary?.task_id,
      ...rec.alternatives.map((a) => a.task_id),
      ...rec.abstained.map((a) => a.task_id),
    ].filter(Boolean);
    expect(allTaskIds).not.toContain('20260420-975-mail-connectivity-chapter-closure');
  });

  it('excludes completed (closed) executable tasks from recommendation candidates', async () => {
    // Create a closed executable task
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-970-completed-task.md'),
      '---\ntask_id: 970\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 970: Completed Task\n\n## Acceptance Criteria\n\n- [x] Done\n\n## Execution Notes\n\nCompleted.\n\n## Verification\n\nVerified.\n',
    );

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { task_id: string } | null; alternatives: Array<{ task_id: string }>; abstained: Array<{ task_id: string }> };
    const allTaskIds = [
      rec.primary?.task_id,
      ...rec.alternatives.map((a) => a.task_id),
      ...rec.abstained.map((a) => a.task_id),
    ].filter(Boolean);
    expect(allTaskIds).not.toContain('20260420-970-completed-task');
  });

  it('excludes legacy markdown notes without canonical front matter even when SQLite has opened lifecycle rows', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-969-legacy-note.md'),
      '# Legacy Note\n\nOld planning note without task front matter.\n',
    );
    setLifecycleStatus(tempDir, 969, 'opened');
    const store = openTaskLifecycleStore(tempDir);
    try {
      seedSpec(store, 969, 'Legacy Note', []);
    } finally {
      store.db.close();
    }

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json', full: true });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { task_id: string } | null; alternatives: Array<{ task_id: string }>; abstained: Array<{ task_id: string }> };
    const allTaskIds = [
      rec.primary?.task_id,
      ...rec.alternatives.map((a) => a.task_id),
      ...rec.abstained.map((a) => a.task_id),
    ].filter(Boolean);
    expect(allTaskIds).not.toContain('20260420-969-legacy-note');
  });

  it('includes clean executable opened tasks in recommendation candidates', async () => {
    // Task 998 is already set up as an opened executable task in setupRepo
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { task_id: string } | null; alternatives: Array<{ task_id: string }>; abstained: Array<{ task_id: string }> };
    const allTaskIds = [
      rec.primary?.task_id,
      ...rec.alternatives.map((a) => a.task_id),
      ...rec.abstained.map((a) => a.task_id),
    ].filter(Boolean);
    expect(allTaskIds).toContain('20260420-998-typescript-task');
  });

  it('reports empty recommendation honestly in human mode', async () => {
    // Mark all tasks as claimed so no recommendations are available
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-typescript-task.md'),
      '---\ntask_id: 998\nstatus: claimed\n---\n\n# Task 998\n',
    );
    setLifecycleStatus(tempDir, 998, 'claimed');
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-database-task.md'),
      '---\ntask_id: 999\nstatus: claimed\n---\n\n# Task 999\n',
    );
    setLifecycleStatus(tempDir, 999, 'claimed');

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'human' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const rec = result.result as { primary: null; abstained: unknown[]; _formatted?: string };
    expect(rec.primary).toBeNull();
    // Should report empty honestly, not as a failure
    expect(rec._formatted?.includes('No recommendations available.')).toBe(true);
    // Should NOT print the misleading failure message
    expect(rec._formatted?.includes('Recommendation failed')).toBe(false);
  });

  it('reports actual command failure as failure', async () => {
    const spy = vi.spyOn(taskRecommender, 'generateRecommendations').mockRejectedValue(new Error('Simulated engine failure'));

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    spy.mockRestore();

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const rec = result.result as { error: string };
    expect(rec.error).toBe('Simulated engine failure');
  });
});
