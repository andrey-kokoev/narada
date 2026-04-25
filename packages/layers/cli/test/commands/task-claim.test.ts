import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { loadAssignment } from '../../src/lib/task-governance.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'test-agent', role: 'implementer', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Test Task\n',
  );
}

describe('task claim operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-claim-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('claims an opened task', async () => {
    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      reason: 'Testing claim',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      agent_id: 'test-agent',
    });

    // Task file updated
    const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: claimed');

    // Assignment record created in SQLite authority
    const assignment = await loadAssignment(tempDir, '20260420-999-test-task');
    expect(assignment).not.toBeNull();
    expect(assignment.task_id).toBe('20260420-999-test-task');
    expect(assignment.assignments).toHaveLength(1);
    expect(assignment.assignments[0].agent_id).toBe('test-agent');
    expect(assignment.assignments[0].claim_context).toBe('Testing claim');
    expect(assignment.assignments[0].released_at).toBeNull();
    expect(assignment.assignments[0].intent).toBe('primary');

    const parsed = result.result as { assignment_intent_id: string };
    const store = openTaskLifecycleStore(tempDir);
    try {
      const intent = store.getAssignmentIntent(parsed.assignment_intent_id);
      expect(intent?.status).toBe('applied');
      expect(intent?.kind).toBe('claim');
      expect(intent?.lifecycle_status_before).toBe('opened');
      expect(intent?.lifecycle_status_after).toBe('claimed');
      expect(intent?.roster_status_after).toBe('working');
    } finally {
      store.db.close();
    }
  });

  it('records a rejected assignment intent without mutating lifecycle, roster, or assignments', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-blocker.md'),
      '---\ntask_id: 998\nstatus: opened\n---\n\n# Task 998\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: opened\ndepends_on:\n  - 998\n---\n\n# Task 999: Test Task\n',
    );

    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const parsed = result.result as { assignment_intent_id: string; error: string };
    expect(parsed.error).toContain('unmet dependencies');
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8')).toContain('status: opened');
    expect(() => readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'assignments', '20260420-999-test-task.json'), 'utf8')).toThrow();
    const roster = JSON.parse(readFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), 'utf8')) as { agents: Array<{ status?: string; task?: number | null }> };
    expect(roster.agents[0]?.status).not.toBe('working');

    const store = openTaskLifecycleStore(tempDir);
    try {
      const intent = store.getAssignmentIntent(parsed.assignment_intent_id);
      expect(intent?.status).toBe('rejected');
      expect(intent?.task_id).toBe('20260420-999-test-task');
      expect(store.getLifecycle('20260420-999-test-task')).toBeUndefined();
      expect(store.getAssignmentRecord('20260420-999-test-task')).toBeUndefined();
    } finally {
      store.db.close();
    }
  });

  it('fails when task is already claimed', async () => {
    // First claim
    await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    // Second claim should fail (task status is now claimed)
    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error' });
    expect((result.result as { error: string }).error).toContain('not claimable');
  });

  it('fails when agent is not in roster', async () => {
    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'unknown-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('Agent not found');
  });

  it('fails when task does not exist', async () => {
    const result = await taskClaimCommand({
      taskNumber: '000',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('Task not found');
  });

  it('fails when task status is not opened', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: in_review\n---\n\n# Task 999: Test Task\n',
    );

    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('not claimable');
  });

  it('fails when task has no front matter or status', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '# Task 999: Test Task\n\nNo front matter here.\n',
    );

    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('not claimable');
    expect((result.result as { error: string }).error).toContain('missing');
  });

  it('fails without task number', async () => {
    const result = await taskClaimCommand({
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('Task number is required');
  });

  it('fails without agent', async () => {
    const result = await taskClaimCommand({
      taskNumber: '999',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('--agent is required');
  });

  it('fails when dependencies are not closed or confirmed', async () => {
    // Create dependency task 998 (opened, not closed)
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-dep-task.md'),
      '---\ntask_id: 998\nstatus: opened\n---\n\n# Task 998: Dependency\n',
    );

    // Create main task with depends_on: [998]
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: opened\ndepends_on: [998]\n---\n\n# Task 999: Test Task\n',
    );

    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('unmet dependencies');
    expect((result.result as { error: string }).error).toContain('20260420-998-dep-task');
  });

  it('succeeds when dependencies are closed and complete by evidence', async () => {
    // Create dependency task 998 (closed, complete by evidence)
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-dep-task.md'),
      '---\ntask_id: 998\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 998: Dependency\n\n## Acceptance Criteria\n\n- [x] Criterion 1\n\n## Execution Notes\n\nCompleted.\n\n## Verification\n\nVerified.\n',
    );

    // Create main task with depends_on: [998]
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: opened\ndepends_on: [998]\n---\n\n# Task 999: Test Task\n',
    );

    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  it('fails when dependency is closed but not complete by evidence', async () => {
    // Create dependency task 998 (closed, but missing execution notes and verification)
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-dep-task.md'),
      '---\ntask_id: 998\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 998: Dependency\n\n## Acceptance Criteria\n\n- [x] Criterion 1\n',
    );

    // Create main task with depends_on: [998]
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: opened\ndepends_on: [998]\n---\n\n# Task 999: Test Task\n',
    );

    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const error = (result.result as { error: string }).error;
    expect(error).toContain('unmet dependencies');
    expect(error).toContain('not complete by evidence');
    expect(error).toContain('20260420-998-dep-task');
  });

  it('treats an executable dependency as satisfied even when a chapter range file shares its number', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260423-998-1000-synthetic-chapter.md'),
      '---\nstatus: opened\n---\n\n# Synthetic Chapter\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-dep-task.md'),
      '---\ntask_id: 998\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 998: Dependency\n\n## Acceptance Criteria\n\n- [x] Criterion 1\n\n## Execution Notes\n\nCompleted.\n\n## Verification\n\nVerified.\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: opened\ndepends_on: [998]\n---\n\n# Task 999: Test Task\n',
    );

    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  it('claims a needs_continuation task', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: needs_continuation\n---\n\n# Task 999: Test Task\n',
    );

    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ status: 'success' });

    const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: claimed');
  });

  it('preserves depends_on YAML list syntax when claiming', async () => {
    // Create closed dependency (complete by evidence)
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-dep-task.md'),
      '---\ntask_id: 998\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 998: Dependency\n\n## Acceptance Criteria\n\n- [x] Criterion 1\n\n## Execution Notes\n\nCompleted.\n\n## Verification\n\nVerified.\n',
    );

    // Create task with YAML list depends_on
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: opened\ndepends_on:\n  - 998\nextra_field: preserved\n---\n\n# Task 999: Test Task\n',
    );

    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: claimed');

    // Re-parse and verify depends_on survived
    const { readTaskFile } = await import('../../src/lib/task-governance.js');
    const { frontMatter } = await readTaskFile(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'));
    expect(frontMatter.depends_on).toEqual([998]);
    expect(frontMatter.extra_field).toBe('preserved');
  });

  it('updates roster to working assignment on claim', async () => {
    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      reason: 'Testing roster update',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const rosterRaw = readFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), 'utf8');
    const roster = JSON.parse(rosterRaw) as { agents: Array<{ agent_id: string; status: string; task: number | null }> };
    const agent = roster.agents.find((a) => a.agent_id === 'test-agent');
    expect(agent).toBeDefined();
    expect(agent!.status).toBe('working');
    expect(agent!.task).toBe(999);
  });
});
