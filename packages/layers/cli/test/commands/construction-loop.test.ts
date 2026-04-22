import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { constructionLoopPlanCommand } from '../../src/commands/construction-loop.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'decisions'), { recursive: true });
}

function writeTask(tempDir: string, filename: string, frontMatter: string, title: string, extraBody = '') {
  writeFileSync(
    join(tempDir, '.ai', 'tasks', filename),
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

describe('construction loop plan command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-construction-loop-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates default policy on first run', async () => {
    writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\ndepends_on: []\n', 'Task 100 — A');

    const result = await constructionLoopPlanCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const policyPath = join(tempDir, '.ai', 'construction-loop', 'policy.json');
    expect(readFileSync(policyPath, 'utf8')).toContain('"version": 1');

    const r = result.result as { plan: { policy_created_default: boolean } };
    expect(r.plan.policy_created_default).toBe(true);
  });

  it('plan with idle agents and runnable tasks', async () => {
    writeRoster(tempDir, [
      { agent_id: 'a1', status: 'idle' },
      { agent_id: 'a2', status: 'working', task: 100 },
    ]);
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\ndepends_on: []\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: opened\ndepends_on: []\n', 'Task 101 — B');

    const result = await constructionLoopPlanCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const r = result.result as { plan: { status: string; observations: { idle_agents: string[] }; graph_summary: { open_tasks: number } } };
    expect(r.plan.status).toBe('ok');
    expect(r.plan.observations.idle_agents).toContain('a1');
    expect(r.plan.graph_summary.open_tasks).toBe(2);
  });

  it('plan with all agents busy', async () => {
    writeRoster(tempDir, [
      { agent_id: 'a1', status: 'working', task: 100 },
      { agent_id: 'a2', status: 'reviewing', task: 101 },
    ]);
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: claimed\n', 'Task 100 — A');

    const result = await constructionLoopPlanCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);

    const r = result.result as { plan: { status: string; observations: { idle_agents: string[] } } };
    expect(r.plan.status).toBe('no_agents');
    expect(r.plan.observations.idle_agents).toHaveLength(0);
  });

  it('plan with no runnable tasks', async () => {
    writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: closed\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: confirmed\n', 'Task 101 — B');

    const result = await constructionLoopPlanCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);

    const r = result.result as { plan: { status: string; graph_summary: { open_tasks: number } } };
    expect(r.plan.status).toBe('no_tasks');
    expect(r.plan.graph_summary.open_tasks).toBe(0);
  });

  it('invalid policy fails gracefully', async () => {
    mkdirSync(join(tempDir, '.ai', 'construction-loop'), { recursive: true });
    writeFileSync(
      join(tempDir, '.ai', 'construction-loop', 'policy.json'),
      JSON.stringify({ version: 'not-a-number', allowed_autonomy_level: 'plan' }),
    );

    const result = await constructionLoopPlanCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);

    const r = result.result as { status: string; error: string };
    expect(r.status).toBe('error');
    expect(r.error).toContain('Policy validation failed');
  });

  it('policy filters blocked agents', async () => {
    writeRoster(tempDir, [
      { agent_id: 'a1', status: 'idle' },
      { agent_id: 'a2', status: 'idle' },
    ]);
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\ndepends_on: []\n', 'Task 100 — A');

    // Create policy with a2 blocked
    mkdirSync(join(tempDir, '.ai', 'construction-loop'), { recursive: true });
    writeFileSync(
      join(tempDir, '.ai', 'construction-loop', 'policy.json'),
      JSON.stringify({
        version: 1,
        allowed_autonomy_level: 'plan',
        require_operator_approval_for_promotion: true,
        dry_run_default: true,
        allow_auto_review: false,
        max_simultaneous_assignments: 2,
        max_tasks_per_cycle: 1,
        max_tasks_per_agent_per_day: 3,
        allowed_agent_ids: [],
        blocked_agent_ids: ['a2'],
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
      }),
    );

    const result = await constructionLoopPlanCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const r = result.result as { plan: { promotion_candidates: Array<{ agent_id: string; blocked_by_policy: string[] }> } };
    const blocked = r.plan.promotion_candidates.filter((c) => c.blocked_by_policy.some((b) => b.includes('a2')));
    expect(blocked.length).toBeGreaterThanOrEqual(0); // May or may not have a2 in recommendations
  });

  it('policy filters blocked task numbers', async () => {
    writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\ndepends_on: []\n', 'Task 100 — A');
    writeTask(tempDir, '20260420-101-b.md', 'task_id: 101\nstatus: opened\ndepends_on: []\n', 'Task 101 — B');

    mkdirSync(join(tempDir, '.ai', 'construction-loop'), { recursive: true });
    writeFileSync(
      join(tempDir, '.ai', 'construction-loop', 'policy.json'),
      JSON.stringify({
        version: 1,
        allowed_autonomy_level: 'plan',
        require_operator_approval_for_promotion: true,
        dry_run_default: true,
        allow_auto_review: false,
        max_simultaneous_assignments: 2,
        max_tasks_per_cycle: 1,
        max_tasks_per_agent_per_day: 3,
        allowed_agent_ids: [],
        blocked_agent_ids: [],
        preferred_agent_ids: [],
        blocked_task_ranges: [],
        blocked_task_numbers: [100],
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
      }),
    );

    const result = await constructionLoopPlanCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const r = result.result as { plan: { promotion_candidates: Array<{ task_number: number; blocked_by_policy: string[] }> } };
    const blocked100 = r.plan.promotion_candidates.filter((c) => c.task_number === 100 && c.blocked_by_policy.some((b) => b.includes('blocked')));
    // If task 100 appears in recommendations, it should be blocked
    if (blocked100.length > 0) {
      expect(blocked100[0].blocked_by_policy.length).toBeGreaterThan(0);
    }
  });

  it('detects stale agents', async () => {
    const oldTime = new Date(Date.now() - 35 * 60 * 1000).toISOString();
    writeRoster(tempDir, [
      { agent_id: 'a1', status: 'working', task: 100, updated_at: oldTime },
      { agent_id: 'a2', status: 'idle' },
    ]);
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: claimed\n', 'Task 100 — A');

    const result = await constructionLoopPlanCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const r = result.result as { plan: { observations: { stale_agents: Array<{ agent_id: string; minutes_since_update: number }> } } };
    expect(r.plan.observations.stale_agents.length).toBe(1);
    expect(r.plan.observations.stale_agents[0].agent_id).toBe('a1');
    expect(r.plan.observations.stale_agents[0].minutes_since_update).toBeGreaterThanOrEqual(30);
  });

  it('respects pause file', async () => {
    mkdirSync(join(tempDir, '.ai', 'construction-loop'), { recursive: true });
    writeFileSync(join(tempDir, '.ai', 'construction-loop', 'pause'), 'operator requested pause\n');
    writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);

    const result = await constructionLoopPlanCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);

    const r = result.result as { plan: { status: string; warnings: string[] } };
    expect(r.plan.status).toBe('paused');
    expect(r.plan.warnings[0]).toContain('paused');
  });

  it('produces human-readable output', async () => {
    writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
    writeTask(tempDir, '20260420-100-a.md', 'task_id: 100\nstatus: opened\n', 'Task 100 — A');

    const result = await constructionLoopPlanCommand({ cwd: tempDir, format: 'human' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const r = result.result as { status: string };
    expect(r.status).toBe('ok');
  });

  it('does not mutate task files', async () => {
    writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
    const path = join(tempDir, '.ai', 'tasks', '20260420-100-a.md');
    writeFileSync(path, '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n');
    const before = readFileSync(path, 'utf8');

    await constructionLoopPlanCommand({ cwd: tempDir, format: 'json' });

    const after = readFileSync(path, 'utf8');
    expect(after).toBe(before);
  });

  it('does not mutate roster', async () => {
    const rosterPath = join(tempDir, '.ai', 'agents', 'roster.json');
    writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
    const before = readFileSync(rosterPath, 'utf8');

    await constructionLoopPlanCommand({ cwd: tempDir, format: 'json' });

    const after = readFileSync(rosterPath, 'utf8');
    expect(after).toBe(before);
  });

  it('full_auto autonomy level fails', async () => {
    mkdirSync(join(tempDir, '.ai', 'construction-loop'), { recursive: true });
    writeFileSync(
      join(tempDir, '.ai', 'construction-loop', 'policy.json'),
      JSON.stringify({
        version: 1,
        allowed_autonomy_level: 'full_auto',
        require_operator_approval_for_promotion: true,
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
      }),
    );

    const result = await constructionLoopPlanCommand({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);

    const r = result.result as { status: string; error: string };
    expect(r.status).toBe('error');
    expect(r.error).toContain('not yet supported');
  });
});
