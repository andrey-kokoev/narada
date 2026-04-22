import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });

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
    join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'),
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
    const taskContent = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: claimed');

    // Assignment record created
    const assignmentRaw = readFileSync(join(tempDir, '.ai', 'tasks', 'assignments', '20260420-999-test-task.json'), 'utf8');
    const assignment = JSON.parse(assignmentRaw);
    expect(assignment.task_id).toBe('20260420-999-test-task');
    expect(assignment.assignments).toHaveLength(1);
    expect(assignment.assignments[0].agent_id).toBe('test-agent');
    expect(assignment.assignments[0].claim_context).toBe('Testing claim');
    expect(assignment.assignments[0].released_at).toBeNull();
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
      join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'),
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
      join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'),
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
      join(tempDir, '.ai', 'tasks', '20260420-998-dep-task.md'),
      '---\ntask_id: 998\nstatus: opened\n---\n\n# Task 998: Dependency\n',
    );

    // Create main task with depends_on: [998]
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'),
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

  it('succeeds when dependencies are closed', async () => {
    // Create dependency task 998 (closed)
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-998-dep-task.md'),
      '---\ntask_id: 998\nstatus: closed\n---\n\n# Task 998: Dependency\n',
    );

    // Create main task with depends_on: [998]
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'),
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
      join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'),
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

    const taskContent = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: claimed');
  });

  it('preserves depends_on YAML list syntax when claiming', async () => {
    // Create closed dependency
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-998-dep-task.md'),
      '---\ntask_id: 998\nstatus: closed\n---\n\n# Task 998: Dependency\n',
    );

    // Create task with YAML list depends_on
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: opened\ndepends_on:\n  - 998\nextra_field: preserved\n---\n\n# Task 999: Test Task\n',
    );

    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'test-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const taskContent = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'), 'utf8');
    expect(taskContent).toContain('status: claimed');

    // Re-parse and verify depends_on survived
    const { readTaskFile } = await import('../../src/lib/task-governance.js');
    const { frontMatter } = await readTaskFile(join(tempDir, '.ai', 'tasks', '20260420-999-test-task.md'));
    expect(frontMatter.depends_on).toEqual([998]);
    expect(frontMatter.extra_field).toBe('preserved');
  });
});
