import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  updatePrincipalRuntimeFromTaskEvent,
  resolvePrincipalStateDir,
} from '../../src/lib/principal-bridge.js';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { taskReportCommand } from '../../src/commands/task-report.js';
import { taskReviewCommand } from '../../src/commands/task-review.js';
import { taskReleaseCommand } from '../../src/commands/task-release.js';
import { principalSyncFromTasksCommand } from '../../src/commands/principal-sync-from-tasks.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'reports'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'learning', 'accepted'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'test-agent', role: 'implementer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'reviewer-agent', role: 'reviewer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Test Task\n\n## Verification\nTests pass.\n',
  );
}

function createPrincipalRuntime(
  stateDir: string,
  runtimeId: string,
  principalId: string,
  state: string,
) {
  const filepath = join(stateDir, '.principal-runtimes.json');
  let data: unknown[] = [];
  try {
    const raw = readFileSync(filepath, 'utf8');
    data = JSON.parse(raw) as unknown[];
  } catch {
    // file doesn't exist yet
  }
  data.push({
    runtime_id: runtimeId,
    principal_id: principalId,
    principal_type: 'agent',
    state,
    scope_id: 'test-scope',
    attachment_mode: 'interact',
    state_changed_at: new Date().toISOString(),
    last_heartbeat_at: new Date().toISOString(),
    active_work_item_id: null,
    budget_remaining: null,
    budget_unit: null,
    detail: null,
  });
  writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n');
}

describe('resolvePrincipalStateDir', () => {
  it('defaults to cwd', () => {
    const result = resolvePrincipalStateDir({ cwd: '/some/path' });
    expect(result).toBe('/some/path');
  });

  it('uses explicit principalStateDir', () => {
    const result = resolvePrincipalStateDir({ cwd: '/some/path', principalStateDir: '/other/path' });
    expect(result).toBe('/other/path');
  });
});

describe('updatePrincipalRuntimeFromTaskEvent', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-bridge-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('task_claimed transitions attached_interact → claiming', async () => {
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'attached_interact');

    const result = await updatePrincipalRuntimeFromTaskEvent(tempDir, {
      type: 'task_claimed',
      agent_id: 'test-agent',
      task_id: '999',
    });

    expect(result.updated).toBe(true);
    expect(result.previous_state).toBe('attached_interact');
    expect(result.new_state).toBe('claiming');
  });

  it('task_reported transitions executing → waiting_review', async () => {
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'executing');

    const result = await updatePrincipalRuntimeFromTaskEvent(tempDir, {
      type: 'task_reported',
      agent_id: 'test-agent',
      task_id: '999',
      report_id: 'wrr-test',
    });

    expect(result.updated).toBe(true);
    expect(result.previous_state).toBe('executing');
    expect(result.new_state).toBe('waiting_review');
  });

  it('task_review_accepted transitions waiting_review → attached_interact', async () => {
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'waiting_review');

    const result = await updatePrincipalRuntimeFromTaskEvent(tempDir, {
      type: 'task_review_accepted',
      agent_id: 'test-agent',
      task_id: '999',
      review_id: 'review-test',
    });

    expect(result.updated).toBe(true);
    expect(result.previous_state).toBe('waiting_review');
    expect(result.new_state).toBe('attached_interact');
  });

  it('task_review_rejected transitions waiting_review → attached_interact', async () => {
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'waiting_review');

    const result = await updatePrincipalRuntimeFromTaskEvent(tempDir, {
      type: 'task_review_rejected',
      agent_id: 'test-agent',
      task_id: '999',
      review_id: 'review-test',
    });

    expect(result.updated).toBe(true);
    expect(result.previous_state).toBe('waiting_review');
    expect(result.new_state).toBe('attached_interact');
  });

  it('task_released (completed) transitions claiming → attached_interact', async () => {
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'claiming');

    const result = await updatePrincipalRuntimeFromTaskEvent(tempDir, {
      type: 'task_released',
      agent_id: 'test-agent',
      task_id: '999',
      reason: 'completed',
    });

    expect(result.updated).toBe(true);
    expect(result.previous_state).toBe('claiming');
    expect(result.new_state).toBe('attached_interact');
  });

  it('task_released (budget_exhausted) transitions executing → budget_exhausted', async () => {
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'executing');

    const result = await updatePrincipalRuntimeFromTaskEvent(tempDir, {
      type: 'task_released',
      agent_id: 'test-agent',
      task_id: '999',
      reason: 'budget_exhausted',
    });

    expect(result.updated).toBe(true);
    expect(result.previous_state).toBe('executing');
    expect(result.new_state).toBe('budget_exhausted');
  });

  it('missing principal is silent for report/review/release', async () => {
    const reported = await updatePrincipalRuntimeFromTaskEvent(tempDir, {
      type: 'task_reported',
      agent_id: 'missing-agent',
      task_id: '999',
      report_id: 'wrr-test',
    });
    expect(reported.updated).toBe(false);
    expect(reported.warning).toBeUndefined();

    const reviewed = await updatePrincipalRuntimeFromTaskEvent(tempDir, {
      type: 'task_review_accepted',
      agent_id: 'missing-agent',
      task_id: '999',
      review_id: 'review-test',
    });
    expect(reviewed.updated).toBe(false);
    expect(reviewed.warning).toBeUndefined();

    const released = await updatePrincipalRuntimeFromTaskEvent(tempDir, {
      type: 'task_released',
      agent_id: 'missing-agent',
      task_id: '999',
      reason: 'completed',
    });
    expect(released.updated).toBe(false);
    expect(released.warning).toBeUndefined();
  });

  it('missing principal warns for claim', async () => {
    const result = await updatePrincipalRuntimeFromTaskEvent(tempDir, {
      type: 'task_claimed',
      agent_id: 'missing-agent',
      task_id: '999',
    });
    expect(result.updated).toBe(false);
    expect(result.warning).toContain('PrincipalRuntime not found');
  });

  it('multiple matching principals returns warning', async () => {
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'attached_interact');
    createPrincipalRuntime(tempDir, 'rt-2', 'test-agent', 'available');

    const result = await updatePrincipalRuntimeFromTaskEvent(tempDir, {
      type: 'task_claimed',
      agent_id: 'test-agent',
      task_id: '999',
    });

    expect(result.updated).toBe(false);
    expect(result.warning).toContain('Multiple PrincipalRuntime records');
  });

  it('invalid transition returns warning', async () => {
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'available');

    const result = await updatePrincipalRuntimeFromTaskEvent(tempDir, {
      type: 'task_reported',
      agent_id: 'test-agent',
      task_id: '999',
      report_id: 'wrr-test',
    });

    expect(result.updated).toBe(false);
    expect(result.warning).toContain('no transition applies');
  });
});

describe('task command bridge integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-bridge-cmd-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('task report succeeds even when PR update fails (no runtime)', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'test-agent',
      summary: 'Test summary',
      cwd: tempDir,
      format: 'json',
      principalStateDir: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ status: 'success', new_status: 'in_review' });
  });

  it('task review succeeds even when PR update fails (no runtime)', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });
    await taskReportCommand({ taskNumber: '999', agent: 'test-agent', summary: 'Test', cwd: tempDir, format: 'json' });

    const result = await taskReviewCommand({
      taskNumber: '999',
      agent: 'reviewer-agent',
      verdict: 'accepted',
      cwd: tempDir,
      format: 'json',
      principalStateDir: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ status: 'success', new_status: 'closed' });
  });

  it('task claim without --update-principal-runtime does not touch PR', async () => {
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'attached_interact');

    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
      principalStateDir: tempDir,
      // updatePrincipalRuntime is undefined / not set
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Verify PR state is unchanged
    const prFile = readFileSync(join(tempDir, '.principal-runtimes.json'), 'utf8');
    const prData = JSON.parse(prFile) as Array<{ state: string }>;
    expect(prData[0].state).toBe('attached_interact');
  });

  it('task claim with --update-principal-runtime touches PR', async () => {
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'attached_interact');

    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
      principalStateDir: tempDir,
      updatePrincipalRuntime: true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Verify PR state was updated
    const prFile = readFileSync(join(tempDir, '.principal-runtimes.json'), 'utf8');
    const prData = JSON.parse(prFile) as Array<{ state: string }>;
    expect(prData[0].state).toBe('claiming');
  });

  it('task release with principalStateDir updates PR', async () => {
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'claiming');
    await taskClaimCommand({ taskNumber: '999', agent: 'test-agent', cwd: tempDir, format: 'json' });

    const result = await taskReleaseCommand({
      taskNumber: '999',
      reason: 'completed',
      cwd: tempDir,
      format: 'json',
      principalStateDir: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const prFile = readFileSync(join(tempDir, '.principal-runtimes.json'), 'utf8');
    const prData = JSON.parse(prFile) as Array<{ state: string }>;
    expect(prData[0].state).toBe('attached_interact');
  });
});

describe('principal sync-from-tasks', () => {
  let tempDir: string;

  function createTaskFile(taskId: string, status: string) {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', `20260420-${taskId}-test.md`),
      `---\ntask_id: ${taskId}\nstatus: ${status}\n---\n\n# Task ${taskId}\n`,
    );
  }

  function createAssignment(taskId: string, agentId: string, claimedAt = '2026-01-01T00:00:00Z') {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments', `${taskId}.json`),
      JSON.stringify({
        task_id: taskId,
        assignments: [
          {
            agent_id: agentId,
            claimed_at: claimedAt,
            claim_context: null,
            released_at: null,
            release_reason: null,
          },
        ],
      }, null, 2) + '\n',
    );
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-sync-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects divergence (task in_review, PR executing) and applies correction', async () => {
    createTaskFile('998', 'in_review');
    createAssignment('998', 'test-agent');
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'executing');

    const result = await principalSyncFromTasksCommand({
      cwd: tempDir,
      principalStateDir: tempDir,
      dryRun: false,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as {
      divergences: Array<{ action: string; actual_state: string; expected_state: string }>;
      summary: { corrected: number };
    };
    expect(parsed.summary.corrected).toBe(1);
    expect(parsed.divergences[0].action).toBe('corrected');
    expect(parsed.divergences[0].actual_state).toBe('waiting_review');
    expect(parsed.divergences[0].expected_state).toBe('waiting_review');

    // Verify PR was actually updated on disk
    const prFile = readFileSync(join(tempDir, '.principal-runtimes.json'), 'utf8');
    const prData = JSON.parse(prFile) as Array<{ state: string }>;
    expect(prData[0].state).toBe('waiting_review');
  });

  it('does not mutate in dry-run mode', async () => {
    createTaskFile('998', 'in_review');
    createAssignment('998', 'test-agent');
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'executing');

    const result = await principalSyncFromTasksCommand({
      cwd: tempDir,
      principalStateDir: tempDir,
      dryRun: true,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as {
      divergences: Array<{ action: string }>;
      summary: { corrected: number; would_correct: number };
    };
    expect(parsed.summary.corrected).toBe(0);
    expect(parsed.summary.would_correct).toBe(1);
    expect(parsed.divergences[0].action).toBe('would_correct');

    // Verify PR was NOT updated on disk
    const prFile = readFileSync(join(tempDir, '.principal-runtimes.json'), 'utf8');
    const prData = JSON.parse(prFile) as Array<{ state: string }>;
    expect(prData[0].state).toBe('executing');
  });

  it('does not create missing PR records', async () => {
    createTaskFile('998', 'claimed');
    createAssignment('998', 'test-agent');
    // No PrincipalRuntime created for test-agent

    const result = await principalSyncFromTasksCommand({
      cwd: tempDir,
      principalStateDir: tempDir,
      dryRun: false,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as {
      divergences: Array<{ action: string }>;
      summary: { no_runtime: number; corrected: number };
    };
    expect(parsed.summary.no_runtime).toBe(1);
    expect(parsed.summary.corrected).toBe(0);
    expect(parsed.divergences[0].action).toBe('no_runtime');

    // Verify no PR file was created
    expect(() => readFileSync(join(tempDir, '.principal-runtimes.json'), 'utf8')).toThrow();
  });

  it('reports no divergence when states match', async () => {
    createTaskFile('998', 'claimed');
    createAssignment('998', 'test-agent');
    createPrincipalRuntime(tempDir, 'rt-1', 'test-agent', 'claiming');

    const result = await principalSyncFromTasksCommand({
      cwd: tempDir,
      principalStateDir: tempDir,
      dryRun: false,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as {
      divergences: Array<unknown>;
      summary: { divergences_found: number };
    };
    expect(parsed.summary.divergences_found).toBe(0);
    expect(parsed.divergences).toHaveLength(0);
  });
});
