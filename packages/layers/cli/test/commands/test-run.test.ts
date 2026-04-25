import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { testRunCommand, testRunInspectCommand, testRunListCommand } from '../../src/commands/test-run.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { SqliteTaskLifecycleStore, openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from "better-sqlite3";

describe('test-run command', () => {
  let tempDir: string;
  let store: SqliteTaskLifecycleStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-test-run-'));
    mkdirSync(join(tempDir, '.ai'), { recursive: true });
    store = openTaskLifecycleStore(tempDir);
    // Seed a task for linkage tests
    store.upsertLifecycle({
      task_id: 'task-606',
      task_number: 606,
      status: 'claimed',
      governed_by: null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: new Date().toISOString(),
    });
  });

  afterEach(() => {
    store.db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects missing --cmd', async () => {
    const result = await testRunCommand({ cwd: tempDir, store });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('No command provided');
  });

  it('rejects full suite without ALLOW_FULL_TESTS', async () => {
    const result = await testRunCommand({
      cwd: tempDir,
      store,
      cmd: 'pnpm test',
      scope: 'full',
    });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('ALLOW_FULL_TESTS');
  });

  it('executes a focused command and stores a run record', async () => {
    const result = await testRunCommand({
      cwd: tempDir,
      store,
      cmd: 'echo hello',
      scope: 'focused',
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { run_id: string; result: { status: string } };
    expect(r.run_id).toMatch(/^run_/);
    expect(r.result.status).toBe('passed');

    const run = store.getVerificationRun(r.run_id);
    expect(run).toBeDefined();
    expect(run!.target_command).toBe('echo hello');
    expect(run!.status).toBe('passed');
    expect(run!.exit_code).toBe(0);
    expect(run!.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('links run to task when taskNumber is provided', async () => {
    const result = await testRunCommand({
      cwd: tempDir,
      store,
      cmd: 'echo linked',
      taskNumber: 606,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { run_id: string };
    const run = store.getVerificationRun(r.run_id);
    expect(run!.task_id).toBe('task-606');
  });

  it('captures failing command as failed status', async () => {
    const result = await testRunCommand({
      cwd: tempDir,
      store,
      cmd: 'exit 1',
      scope: 'focused',
    });
    // Exit code is GENERAL_ERROR because the test failed
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const r = result.result as { run_id: string; result: { status: string } };
    expect(r.result.status).toBe('failed');

    const run = store.getVerificationRun(r.run_id);
    expect(run!.status).toBe('failed');
    expect(run!.exit_code).toBe(1);
  });

  it('stores stdout/stderr excerpts and digests', async () => {
    const result = await testRunCommand({
      cwd: tempDir,
      store,
      cmd: 'echo stdout-content && echo stderr-content >&2',
      scope: 'focused',
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { run_id: string };
    const run = store.getVerificationRun(r.run_id);
    expect(run!.stdout_excerpt).toContain('stdout-content');
    expect(run!.stderr_excerpt).toContain('stderr-content');
    expect(run!.stdout_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(run!.stderr_digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('caps timeout at max for scope', async () => {
    const result = await testRunCommand({
      cwd: tempDir,
      store,
      cmd: 'echo hello',
      scope: 'focused',
      timeout: 9999,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { run_id: string };
    const run = store.getVerificationRun(r.run_id);
    expect(run!.timeout_seconds).toBe(120); // max for focused
  });
});

describe('test-run inspect', () => {
  let tempDir: string;
  let store: SqliteTaskLifecycleStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-test-run-'));
    mkdirSync(join(tempDir, '.ai'), { recursive: true });
    store = openTaskLifecycleStore(tempDir);
  });

  afterEach(() => {
    store.db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects missing run-id', async () => {
    const result = await testRunInspectCommand({ cwd: tempDir, store });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
  });

  it('returns run details when found', async () => {
    store.insertVerificationRun({
      run_id: 'run_abc',
      request_id: 'req_abc',
      task_id: null,
      target_command: 'echo test',
      scope: 'focused',
      timeout_seconds: 60,
      requester_identity: 'a3',
      requested_at: new Date().toISOString(),
      status: 'passed',
      exit_code: 0,
      duration_ms: 42,
      metrics_json: null,
      stdout_digest: null,
      stderr_digest: null,
      stdout_excerpt: 'test',
      stderr_excerpt: null,
      completed_at: new Date().toISOString(),
    });

    const result = await testRunInspectCommand({ cwd: tempDir, store, runId: 'run_abc' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { run: { run_id: string; status: string } };
    expect(r.run.run_id).toBe('run_abc');
    expect(r.run.status).toBe('passed');
  });

  it('returns error when run not found', async () => {
    const result = await testRunInspectCommand({ cwd: tempDir, store, runId: 'run_missing' });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
  });
});

describe('test-run list', () => {
  let tempDir: string;
  let store: SqliteTaskLifecycleStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-test-run-'));
    mkdirSync(join(tempDir, '.ai'), { recursive: true });
    store = openTaskLifecycleStore(tempDir);
    store.upsertLifecycle({
      task_id: 'task-606',
      task_number: 606,
      status: 'claimed',
      governed_by: null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: new Date().toISOString(),
    });
  });

  afterEach(() => {
    store.db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('lists recent runs', async () => {
    store.insertVerificationRun({
      run_id: 'run_1',
      request_id: 'req_1',
      task_id: null,
      target_command: 'echo one',
      scope: 'focused',
      timeout_seconds: 60,
      requester_identity: 'a3',
      requested_at: new Date().toISOString(),
      status: 'passed',
      exit_code: 0,
      duration_ms: 10,
      metrics_json: null,
      stdout_digest: null,
      stderr_digest: null,
      stdout_excerpt: null,
      stderr_excerpt: null,
      completed_at: new Date().toISOString(),
    });

    const result = await testRunListCommand({ cwd: tempDir, store, limit: 10 });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { count: number; runs: unknown[] };
    expect(r.count).toBe(1);
  });

  it('filters by task number', async () => {
    store.insertVerificationRun({
      run_id: 'run_linked',
      request_id: 'req_linked',
      task_id: 'task-606',
      target_command: 'echo linked',
      scope: 'focused',
      timeout_seconds: 60,
      requester_identity: 'a3',
      requested_at: new Date().toISOString(),
      status: 'passed',
      exit_code: 0,
      duration_ms: 10,
      metrics_json: null,
      stdout_digest: null,
      stderr_digest: null,
      stdout_excerpt: null,
      stderr_excerpt: null,
      completed_at: new Date().toISOString(),
    });

    const result = await testRunListCommand({ cwd: tempDir, store, taskNumber: 606 });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const r = result.result as { count: number; runs: Array<{ run_id: string }> };
    expect(r.count).toBe(1);
    expect(r.runs[0].run_id).toBe('run_linked');
  });
});
