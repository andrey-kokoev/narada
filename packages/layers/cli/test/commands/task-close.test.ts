import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskCloseCommand } from '../../src/commands/task-close.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });
}

function writeTask(tempDir: string, num: number, status: string, bodyExtra = '') {
  writeFileSync(
    join(tempDir, '.ai', 'tasks', `20260420-${num}-test.md`),
    `---\ntask_id: ${num}\nstatus: ${status}\n---\n\n# Task ${num}: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n- [x] Criterion B\n\n${bodyExtra}`,
  );
}

describe('task close operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-close-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('closes a task with complete evidence', async () => {
    writeTask(
      tempDir,
      100,
      'in_review',
      '## Execution Notes\nDid the work.\n\n## Verification\nTests pass.\n',
    );

    const result = await taskCloseCommand({
      taskNumber: '100',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; new_status: string; closed_by: string };
    expect(r.status).toBe('success');
    expect(r.new_status).toBe('closed');
    expect(r.closed_by).toBe('operator-1');

    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-100-test.md'), 'utf8');
    expect(content).toContain('status: closed');
    expect(content).toContain('closed_by: operator-1');
    expect(content).toContain('closed_at:');
  });

  it('allows direct close from opened when closure gates are satisfied', async () => {
    writeTask(
      tempDir,
      108,
      'opened',
      '## Execution Notes\nDid the work.\n\n## Verification\nTests pass.\n',
    );

    const result = await taskCloseCommand({
      taskNumber: '108',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; new_status: string; closed_by: string };
    expect(r.status).toBe('success');
    expect(r.new_status).toBe('closed');
    expect(r.closed_by).toBe('operator-1');

    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-108-test.md'), 'utf8');
    expect(content).toContain('status: closed');
  });

  it('fails with unchecked criteria', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-101-test.md'),
      `---\ntask_id: 101\nstatus: in_review\n---\n\n# Task 101: Test\n\n## Acceptance Criteria\n- [ ] Unchecked A\n- [x] Checked B\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '101',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; gate_failures: string[]; violations: string[] };
    expect(r.status).toBe('error');
    expect(r.gate_failures.some((f) => f.includes('acceptance criteria'))).toBe(true);
    // Violations are only computed for terminal tasks; this task is in_review
    expect(r.violations).toEqual([]);

    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-101-test.md'), 'utf8');
    expect(content).toContain('status: in_review');
  });

  it('fails without execution notes', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-102-test.md'),
      `---\ntask_id: 102\nstatus: in_review\n---\n\n# Task 102: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Verification\nOK.\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '102',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; gate_failures: string[] };
    expect(r.status).toBe('error');
    expect(r.gate_failures.some((f) => f.includes('execution notes'))).toBe(true);

    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-102-test.md'), 'utf8');
    expect(content).toContain('status: in_review');
  });

  it('fails without verification notes', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-103-test.md'),
      `---\ntask_id: 103\nstatus: in_review\n---\n\n# Task 103: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '103',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; gate_failures: string[] };
    expect(r.status).toBe('error');
    expect(r.gate_failures.some((f) => f.includes('verification'))).toBe(true);

    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-103-test.md'), 'utf8');
    expect(content).toContain('status: in_review');
  });

  it('fails with derivative files', async () => {
    writeTask(
      tempDir,
      104,
      'in_review',
      '## Execution Notes\nDone.\n\n## Verification\nOK.\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-104-test-EXECUTED.md'),
      '# Derivative\n',
    );

    const result = await taskCloseCommand({
      taskNumber: '104',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; gate_failures: string[]; violations: string[] };
    expect(r.status).toBe('error');
    expect(r.gate_failures.some((f) => f.includes('Derivative'))).toBe(true);
    // Violations are only computed for terminal tasks; this task is in_review
    expect(r.violations).toEqual([]);

    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-104-test.md'), 'utf8');
    expect(content).toContain('status: in_review');
  });

  it('reports valid for already-closed task with good evidence', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-105-test.md'),
      `---\ntask_id: 105\nstatus: closed\nclosed_by: operator-1\nclosed_at: 2026-04-23T17:35:00Z\n---\n\n# Task 105: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n- [x] Criterion B\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '105',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { status: string; valid: boolean; current_status: string };
    expect(r.status).toBe('ok');
    expect(r.valid).toBe(true);
    expect(r.current_status).toBe('closed');
  });

  it('reports invalid for already-closed task with unchecked criteria', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-106-test.md'),
      `---\ntask_id: 106\nstatus: closed\n---\n\n# Task 106: Test\n\n## Acceptance Criteria\n- [ ] Unchecked A\n- [x] Checked B\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '106',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; valid: boolean; violations: string[] };
    expect(r.status).toBe('error');
    expect(r.valid).toBe(false);
    expect(r.violations).toContain('terminal_with_unchecked_criteria');
  });

  it('returns human-readable output on success', async () => {
    writeTask(
      tempDir,
      107,
      'in_review',
      '## Execution Notes\nDone.\n\n## Verification\nOK.\n',
    );

    const result = await taskCloseCommand({
      taskNumber: '107',
      by: 'operator-1',
      cwd: tempDir,
      format: 'human',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const text = result.result as { status: string; new_status: string };
    expect(text.status).toBe('success');
    expect(text.new_status).toBe('closed');
  });

  it('includes remediation guidance in gate failure response', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-112-test.md'),
      `---\ntask_id: 112\nstatus: in_review\n---\n\n# Task 112: Test\n\n## Acceptance Criteria\n- [ ] Unchecked A\n- [x] Checked B\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '112',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; remediation: string[]; gate_failures: string[] };
    expect(r.status).toBe('error');
    expect(r.remediation).toBeDefined();
    expect(r.remediation.length).toBeGreaterThanOrEqual(2);
    expect(r.remediation.some((m) => m.includes('Check all acceptance criteria'))).toBe(true);
    expect(r.remediation.some((m) => m.includes('Execution Notes'))).toBe(true);
    expect(r.remediation.some((m) => m.includes('Verification'))).toBe(true);
  });

  it('fails for invalid task number', async () => {
    const result = await taskCloseCommand({
      taskNumber: 'not-a-number',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('Invalid');
  });

  it('fails when task file is missing', async () => {
    const result = await taskCloseCommand({
      taskNumber: '999',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('not found');
  });

  it('sets governed_by on closure', async () => {
    writeTask(
      tempDir,
      110,
      'in_review',
      '## Execution Notes\nDone.\n\n## Verification\nOK.\n',
    );

    const result = await taskCloseCommand({
      taskNumber: '110',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const content = readFileSync(join(tempDir, '.ai', 'tasks', '20260420-110-test.md'), 'utf8');
    expect(content).toContain('governed_by: task_close:operator-1');
  });

  it('reports invalid for already-closed task without governed provenance (raw mutation)', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'tasks', '20260420-111-test.md'),
      `---\ntask_id: 111\nstatus: closed\n---\n\n# Task 111: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n`,
    );

    const result = await taskCloseCommand({
      taskNumber: '111',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { status: string; valid: boolean; violations: string[] };
    expect(r.status).toBe('error');
    expect(r.valid).toBe(false);
    expect(r.violations).toContain('terminal_without_governed_provenance');
  });
});
