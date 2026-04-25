import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  constructionLoopRunCommand,
  constructionLoopPauseCommand,
  constructionLoopResumeCommand,
  constructionLoopMetricsCommand,
  checkHardGates,
} from '../../src/commands/construction-loop.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'decisions'), { recursive: true });
}

function writeTask(tempDir: string, filename: string, frontMatter: string, title: string, extraBody = '') {
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', filename),
    `---\n${frontMatter}---\n\n# ${title}\n${extraBody}`,
  );
}

function writeRoster(tempDir: string, agents: Array<{
  agent_id: string;
  status?: string;
  task?: number | null;
  updated_at?: string;
}>) {
  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: new Date().toISOString(),
      agents: agents.map((a) => ({
        agent_id: a.agent_id,
        role: 'agent',
        capabilities: [],
        first_seen_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        status: a.status ?? 'idle',
        task: a.task ?? null,
        updated_at: a.updated_at ?? new Date().toISOString(),
      })),
    }, null, 2),
  );
}

function writePolicy(tempDir: string, overrides: Record<string, unknown> = {}) {
  mkdirSync(join(tempDir, '.ai', 'construction-loop'), { recursive: true });
  writeFileSync(
    join(tempDir, '.ai', 'construction-loop', 'policy.json'),
    JSON.stringify({
      version: 1,
      allowed_autonomy_level: 'bounded_auto',
      require_operator_approval_for_promotion: false,
      dry_run_default: true,
      allow_auto_review: false,
      max_simultaneous_assignments: 2,
      max_tasks_per_cycle: 1,
      max_tasks_per_agent_per_day: 3,
      allowed_agent_ids: [],
      blocked_agent_ids: [],
      preferred_agent_ids: [],
      blocked_task_ranges: [],
      blocked_task_numbers: [],
      require_evidence_before_promotion: false,
      review_separation_rules: {
        reviewer_cannot_review_own_work: true,
        max_reviews_per_reviewer_per_day: 3,
        require_different_agent_for_review: true,
      },
      max_write_set_risk_severity: 'medium',
      max_recommendation_age_minutes: 60,
      stale_agent_timeout_ms: 1800000,
      stop_conditions: {
        on_all_agents_busy: 'wait',
        on_no_runnable_tasks: 'suggest_closure',
        on_cycle_limit_reached: 'stop',
        on_policy_violation: 'stop',
      },
      ccc_posture_path: '.ai/ccc/posture.json',
      ccc_influence_weight: 0.3,
      ...overrides,
    }),
  );
}

describe('construction loop run command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-construction-loop-run-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('blocks when policy autonomy level is plan', async () => {
    writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\ndepends_on: []\n', 'Task 100 — A');
    writePolicy(tempDir, { allowed_autonomy_level: 'plan' });

    const result = await constructionLoopRunCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);

    const r = result.result as { status: string; error: string };
    expect(r.status).toBe('policy_error');
    expect(r.error).toContain('plan');

    // Audit record written
    const auditFiles = readAuditFiles(tempDir);
    expect(auditFiles.length).toBe(1);
    expect(auditFiles[0].status).toBe('policy_error');
  });

  it('blocks when paused', async () => {
    writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\ndepends_on: []\n', 'Task 100 — A');
    writePolicy(tempDir);
    await constructionLoopPauseCommand({ cwd: tempDir, reason: 'test pause', format: 'json' });

    const result = await constructionLoopRunCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);

    const r = result.result as { status: string };
    expect(r.status).toBe('paused');

    const auditFiles = readAuditFiles(tempDir);
    expect(auditFiles.length).toBeGreaterThanOrEqual(1);
    expect(auditFiles.some((a) => a.status === 'paused')).toBe(true);
  });

  it('dry-run previews without mutation', async () => {
    writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle', updated_at: new Date(Date.now() - 10 * 60000).toISOString() }]);
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\ndepends_on: []\n', 'Task 100 — A');
    writePolicy(tempDir);

    const result = await constructionLoopRunCommand({ cwd: tempDir, dryRun: true, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const r = result.result as { status: string; promoted: unknown[]; dry_run: boolean };
    expect(r.dry_run).toBe(true);

    // Audit record should exist
    const auditFiles = readAuditFiles(tempDir);
    expect(auditFiles.length).toBeGreaterThanOrEqual(1);
    expect(auditFiles.some((a) => a.dry_run === true)).toBe(true);
  });

  it('dry-run with no candidates returns no_candidates', async () => {
    writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
    // No tasks
    writePolicy(tempDir);

    const result = await constructionLoopRunCommand({ cwd: tempDir, dryRun: true, format: 'json' });
    const r = result.result as { status: string };
    expect(r.status).toBe('no_candidates');
  });

  it('resume removes pause file', async () => {
    await constructionLoopPauseCommand({ cwd: tempDir, reason: 'test', format: 'json' });
    const pausePath = join(tempDir, '.ai', 'construction-loop', 'pause');
    expect(() => readFileSync(pausePath, 'utf8')).not.toThrow();

    const result = await constructionLoopResumeCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    expect(() => readFileSync(pausePath, 'utf8')).toThrow();
  });

  it('metrics returns zero when no audit records exist', async () => {
    const result = await constructionLoopMetricsCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const r = result.result as { metrics: { auto_promotions_total: number } };
    expect(r.metrics.auto_promotions_total).toBe(0);
  });

  it('metrics accumulates from audit logs', async () => {
    writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle', updated_at: new Date(Date.now() - 10 * 60000).toISOString() }]);
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\ndepends_on: []\n', 'Task 100 — A');
    writePolicy(tempDir);

    // Run dry-run to generate audit records
    await constructionLoopRunCommand({ cwd: tempDir, dryRun: true, format: 'json' });

    const result = await constructionLoopMetricsCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const r = result.result as { metrics: { auto_promotions_total: number } };
    expect(r.metrics.auto_promotions_total).toBeGreaterThanOrEqual(1);
  });
});

describe('checkHardGates', () => {
  const basePolicy = {
    version: 1,
    allowed_autonomy_level: 'bounded_auto' as const,
    require_operator_approval_for_promotion: false,
    dry_run_default: true,
    allow_auto_review: false,
    max_simultaneous_assignments: 2,
    max_tasks_per_cycle: 1,
    max_tasks_per_agent_per_day: 3,
    allowed_agent_ids: [],
    blocked_agent_ids: [],
    preferred_agent_ids: [],
    blocked_task_ranges: [],
    blocked_task_numbers: [],
    require_evidence_before_promotion: false,
    review_separation_rules: {
      reviewer_cannot_review_own_work: true,
      max_reviews_per_reviewer_per_day: 3,
      require_different_agent_for_review: true,
    },
    max_write_set_risk_severity: 'medium' as const,
    max_recommendation_age_minutes: 60,
    stale_agent_timeout_ms: 1800000,
    stop_conditions: {
      on_all_agents_busy: 'wait' as const,
      on_no_runnable_tasks: 'suggest_closure' as const,
      on_cycle_limit_reached: 'stop' as const,
      on_policy_violation: 'stop' as const,
    },
    ccc_posture_path: '.ai/ccc/posture.json',
    ccc_influence_weight: 0.3,
  };

  const basePlan = {
    status: 'ok' as const,
    policy_created_default: false,
    observations: {
      agent_count: 1,
      idle_agents: ['a1'],
      working_agents: [],
      reviewing_agents: [],
      blocked_agents: [],
      done_agents: [],
      stale_agents: [],
      active_assignment_count: 0,
    },
    graph_summary: { total_tasks: 1, open_tasks: 1, terminal_tasks: 0 },
    evidence_summary: [],
    chapter_summary: [],
    recommendations: {
      recommendation_id: 'rec-1',
      generated_at: new Date().toISOString(),
      recommender_id: 'test',
      primary: null,
      alternatives: [],
      abstained: [],
      summary: 'test',
    },
    promotion_candidates: [],
    suggested_actions: [],
    warnings: [],
  };

  it('passes all gates for ideal candidate', () => {
    const candidate = {
      task_id: '20260420-100-a.md',
      task_number: 100,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: [],
    };

    const results = checkHardGates({
      policy: basePolicy,
      plan: basePlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date(Date.now() - 10 * 60000).toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 0,
    });

    expect(results.every((g) => g.passed)).toBe(true);
  });

  it('fails autonomy_level gate when policy is plan', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: [],
    };

    const results = checkHardGates({
      policy: { ...basePolicy, allowed_autonomy_level: 'plan' },
      plan: basePlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date().toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 0,
    });

    const autonomyGate = results.find((g) => g.gate === 'autonomy_level');
    expect(autonomyGate?.passed).toBe(false);
  });

  it('fails operator_approval_disabled gate when approval required', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: [],
    };

    const results = checkHardGates({
      policy: { ...basePolicy, require_operator_approval_for_promotion: true },
      plan: basePlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date().toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 0,
    });

    const gate = results.find((g) => g.gate === 'operator_approval_disabled');
    expect(gate?.passed).toBe(false);
  });

  it('fails task_468_validation gate when dry-run not ok', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_rejected' },
      blocked_by_policy: [],
    };

    const results = checkHardGates({
      policy: basePolicy,
      plan: basePlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date().toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 0,
    });

    const gate = results.find((g) => g.gate === 'task_468_validation');
    expect(gate?.passed).toBe(false);
  });

  it('fails write_set_risk_low gate when write-set blocked', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: ['write-set risk high exceeds policy max medium'],
    };

    const results = checkHardGates({
      policy: basePolicy,
      plan: basePlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date().toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 0,
    });

    const gate = results.find((g) => g.gate === 'write_set_risk_low');
    expect(gate?.passed).toBe(false);
  });

  it('fails recommendation_freshness gate when recommendation is stale', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: [],
    };

    const stalePlan = {
      ...basePlan,
      recommendations: {
        ...basePlan.recommendations!,
        generated_at: new Date(Date.now() - 20 * 60000).toISOString(),
      },
    };

    const results = checkHardGates({
      policy: basePolicy,
      plan: stalePlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date().toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 0,
    });

    const gate = results.find((g) => g.gate === 'recommendation_freshness');
    expect(gate?.passed).toBe(false);
  });

  it('fails task_status_opened gate when status is needs_continuation', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: [],
    };

    const results = checkHardGates({
      policy: basePolicy,
      plan: basePlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date().toISOString() },
      taskStatus: 'needs_continuation',
      todaysPromotionsForAgent: 0,
    });

    const gate = results.find((g) => g.gate === 'task_status_opened');
    expect(gate?.passed).toBe(false);
  });

  it('fails agent_idle_duration gate when agent not idle long enough', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: [],
    };

    const results = checkHardGates({
      policy: basePolicy,
      plan: basePlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date().toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 0,
    });

    const gate = results.find((g) => g.gate === 'agent_idle_duration');
    expect(gate?.passed).toBe(false);
  });

  it('fails max_simultaneous gate when at capacity', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: [],
    };

    const fullPlan = {
      ...basePlan,
      observations: { ...basePlan.observations, active_assignment_count: 2 },
    };

    const results = checkHardGates({
      policy: basePolicy,
      plan: fullPlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date(Date.now() - 10 * 60000).toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 0,
    });

    const gate = results.find((g) => g.gate === 'max_simultaneous');
    expect(gate?.passed).toBe(false);
  });

  it('fails not_paused gate when paused', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: [],
    };

    const pausedPlan = { ...basePlan, status: 'paused' as const };

    const results = checkHardGates({
      policy: basePolicy,
      plan: pausedPlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date(Date.now() - 10 * 60000).toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 0,
    });

    const gate = results.find((g) => g.gate === 'not_paused');
    expect(gate?.passed).toBe(false);
  });

  it('fails daily_agent_limit gate when at daily cap', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: [],
    };

    const results = checkHardGates({
      policy: basePolicy,
      plan: basePlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date(Date.now() - 10 * 60000).toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 3,
    });

    const gate = results.find((g) => g.gate === 'daily_agent_limit');
    expect(gate?.passed).toBe(false);
  });

  it('fails task_not_blocked gate when task is in blocked range', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: ['task is in blocked range 1-10'],
    };

    const results = checkHardGates({
      policy: basePolicy,
      plan: basePlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date(Date.now() - 10 * 60000).toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 0,
    });

    const gate = results.find((g) => g.gate === 'task_not_blocked');
    expect(gate?.passed).toBe(false);
  });

  it('fails agent_not_blocked gate when agent is blocked', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: ['agent a1 is in blocked_agent_ids'],
    };

    const results = checkHardGates({
      policy: basePolicy,
      plan: basePlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date(Date.now() - 10 * 60000).toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 0,
    });

    const gate = results.find((g) => g.gate === 'agent_not_blocked');
    expect(gate?.passed).toBe(false);
  });

  it('returns all gate results, not just failures', () => {
    const candidate = {
      task_id: 't1',
      task_number: 1,
      agent_id: 'a1',
      score: 0.9,
      confidence: 'high' as const,
      dry_run_result: { status: 'dry_run_ok' },
      blocked_by_policy: [],
    };

    const results = checkHardGates({
      policy: basePolicy,
      plan: basePlan,
      candidate,
      rosterAgent: { status: 'idle', updated_at: new Date(Date.now() - 10 * 60000).toISOString() },
      taskStatus: 'opened',
      todaysPromotionsForAgent: 0,
    });

    expect(results.length).toBe(12);
    const passed = results.filter((g) => g.passed);
    const failed = results.filter((g) => !g.passed);
    expect(passed.length + failed.length).toBe(12);
  });
});

function readAuditFiles(tempDir: string): Array<{
  status: string;
  dry_run?: boolean;
  agent_id: string;
  task_id: string;
}> {
  const auditDir = join(tempDir, '.ai', 'construction-loop', 'audit');
  try {
    const files = require('node:fs').readdirSync(auditDir);
    const records: Array<{ status: string; dry_run?: boolean; agent_id: string; task_id: string }> = [];
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const raw = require('node:fs').readFileSync(join(auditDir, file), 'utf8');
      for (const line of raw.split('\n')) {
        if (line.trim()) records.push(JSON.parse(line));
      }
    }
    return records;
  } catch {
    return [];
  }
}
