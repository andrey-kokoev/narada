import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskRecommendCommand } from '../../src/commands/task-recommend.js';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { taskReportCommand } from '../../src/commands/task-report.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'reports'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
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
    join(tempDir, '.ai', 'tasks', '20260420-998-typescript-task.md'),
    '---\ntask_id: 998\nstatus: opened\n---\n\n# Task 998: TypeScript CLI Feature\n\nImplement a new CLI command in TypeScript.\n',
  );

  // Task 999: opened, database task
  writeFileSync(
    join(tempDir, '.ai', 'tasks', '20260420-999-database-task.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Database Schema Update\n\nUpdate the SQLite schema for new tables.\n',
  );

  // Task 997: opened, blocked by dependency
  writeFileSync(
    join(tempDir, '.ai', 'tasks', '20260420-997-blocked-task.md'),
    '---\ntask_id: 997\nstatus: opened\ndepends_on: [998]\n---\n\n# Task 997: Blocked Task\n\nDepends on task 998.\n',
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
}

describe('task recommend operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-recommend-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('recommends idle capable agent for unblocked opened task', async () => {
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

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
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { abstained: Array<{ task_id: string; reason: string }> };
    const blocked = rec.abstained.find((a) => a.task_id === '20260420-997-blocked-task');
    // Task 997 depends_on [998], so it should be abstained (not in runnable tasks)
    expect(blocked).toBeDefined();
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
      join(tempDir, '.ai', 'tasks', '20260420-998-typescript-task.md'),
      '---\ntask_id: 998\nstatus: opened\n---\n\n# Task 998: TypeScript CLI Feature\n',
    );

    // Claim task 999 for agent-beta and KEEP it claimed (don't report/release)
    await taskClaimCommand({ taskNumber: '999', agent: 'agent-beta', cwd: tempDir, format: 'json' });

    // Manually write a report for task 999 with overlapping changed files
    // (simulating that the agent has declared intent to touch these files)
    writeFileSync(
      join(tempDir, '.ai', 'tasks', 'reports', 'wrr_999_20260420-999-database-task_agent-beta.json'),
      JSON.stringify({
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
      }, null, 2),
    );

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
    const beforeTasks = readdirSync(join(tempDir, '.ai', 'tasks')).filter((f) => f.endsWith('.md'));
    const beforeRoster = readFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), 'utf8');

    await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    const afterTasks = readdirSync(join(tempDir, '.ai', 'tasks')).filter((f) => f.endsWith('.md'));
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
      join(tempDir, '.ai', 'tasks', '20260420-998-typescript-task.md'),
      '---\ntask_id: 998\nstatus: claimed\n---\n\n# Task 998\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-999-database-task.md'),
      '---\ntask_id: 999\nstatus: claimed\n---\n\n# Task 999\n',
    );

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const rec = result.result as { primary: null; abstained: unknown[] };
    expect(rec.primary).toBeNull();
    expect(rec.abstained.length).toBeGreaterThan(0);
  });

  it('in_review task is not implementation-recommended', async () => {
    // Mark task 998 as in_review
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-998-typescript-task.md'),
      '---\ntask_id: 998\nstatus: in_review\n---\n\n# Task 998\n',
    );

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { primary: { task_id: string } | null };
    // Should recommend task 999, not 998
    expect(rec.primary).not.toBeNull();
    expect(rec.primary!.task_id).toBe('20260420-999-database-task');
  });

  it('classifies in_review tasks as awaiting review in abstained list', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-996-review-task.md'),
      '---\ntask_id: 996\nstatus: in_review\n---\n\n# Task 996: Review Needed\n\nDone.\n',
    );

    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rec = result.result as { abstained: Array<{ task_id: string; reason: string }> };
    const inReviewAbstained = rec.abstained.find((a) => a.task_id === '20260420-996-review-task');
    expect(inReviewAbstained).toBeDefined();
    expect(inReviewAbstained!.reason).toContain('review or closure');
  });
});
