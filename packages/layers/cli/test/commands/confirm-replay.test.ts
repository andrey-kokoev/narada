import { vi } from 'vitest';

// Unmock fs so we can use real SQLite databases in this test file.
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { confirmReplayCommand } from '../../src/commands/confirm-replay.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '@narada2/control-plane';

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
}

function createMockContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    configPath: '/test/config.json',
    logger: createMockLogger(),
    verbose: false,
    ...overrides,
  };
}

describe('confirm-replay command', () => {
  let tempDir: string;
  let configPath: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-confirm-replay-test-'));
    configPath = join(tempDir, 'config.json');
    const rootDir = join(tempDir, 'data');
    const naradaDir = join(rootDir, '.narada');
    dbPath = join(naradaDir, 'coordinator.db');

    mkdirSync(naradaDir, { recursive: true });

    writeFileSync(
      configPath,
      JSON.stringify({
        scope_id: 'test-scope',
        root_dir: rootDir,
        scopes: [
          {
            scope_id: 'test-scope',
            root_dir: rootDir,
            sources: [{ type: 'mock' }],
          },
        ],
      }),
    );

    // Initialize only the process_executions schema (the command assumes
    // the database is already initialized by the daemon; we pre-seed the
    // minimal schema needed for process-family confirmation replay).
    const db = new Database(dbPath);
    db.exec(`
      create table if not exists process_executions (
        execution_id text primary key,
        intent_id text not null,
        executor_family text not null default 'process',
        phase text,
        confirmation_status text default 'unconfirmed',
        command text not null,
        args_json text not null default '[]',
        cwd text,
        env_json text,
        status text not null,
        exit_code integer,
        stdout text not null default '',
        stderr text not null default '',
        started_at text,
        completed_at text,
        confirmed_at text,
        error_message text,
        artifact_id text,
        result_json text not null default '{}',
        lease_expires_at text,
        lease_runner_id text,
        created_at text not null
      );
      create index if not exists idx_process_executions_intent_id on process_executions(intent_id);
      create index if not exists idx_process_executions_phase on process_executions(phase);
    `);
    db.close();
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('invokes the real ConfirmationReplay operator and confirms a completed execution', async () => {
    // Seed a completed, unconfirmed process execution
    const db = new Database(dbPath);
    db.prepare(
      `
      insert into process_executions (
        execution_id, intent_id, executor_family, phase, confirmation_status,
        command, args_json, cwd, env_json, status, exit_code, stdout, stderr,
        started_at, completed_at, confirmed_at, error_message, artifact_id, result_json,
        lease_expires_at, lease_runner_id, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    ).run(
      'exec-1',
      'intent-1',
      'process',
      'completed',
      'unconfirmed',
      '/bin/echo',
      '[]',
      null,
      null,
      'completed',
      0,
      'hello',
      '',
      new Date().toISOString(),
      new Date().toISOString(),
      null,
      null,
      null,
      '{}',
      null,
      null,
    );
    db.close();

    const context = createMockContext({ configPath });
    const result = await confirmReplayCommand({ limit: 10 }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      scope: 'test-scope',
      processed: 1,
      confirmed: 1,
      confirmation_failed: 0,
      still_unconfirmed: 0,
    });

    // Verify the execution was actually confirmed in the database
    const db2 = new Database(dbPath);
    const row = db2.prepare("select confirmation_status from process_executions where execution_id = ?").get('exec-1') as {
      confirmation_status: string;
    };
    db2.close();
    expect(row.confirmation_status).toBe('confirmed');
  });

  it('returns empty result when no unconfirmed executions exist', async () => {
    const context = createMockContext({ configPath });
    const result = await confirmReplayCommand({ limit: 10 }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      scope: 'test-scope',
      processed: 0,
      confirmed: 0,
      confirmation_failed: 0,
      still_unconfirmed: 0,
    });
  });

  it('hard fails when requested scope is not configured', async () => {
    const context = createMockContext({ configPath });
    const result = await confirmReplayCommand({ scope: 'missing-scope', limit: 10 }, context);

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toEqual({
      status: 'error',
      error: 'Scope not found: missing-scope',
    });
  });

  it('respects intentIds bound', async () => {
    const db = new Database(dbPath);
    db.prepare(
      `
      insert into process_executions (
        execution_id, intent_id, executor_family, phase, confirmation_status,
        command, args_json, cwd, env_json, status, exit_code, stdout, stderr,
        started_at, completed_at, confirmed_at, error_message, artifact_id, result_json,
        lease_expires_at, lease_runner_id, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    ).run(
      'exec-a', 'intent-a', 'process', 'completed', 'unconfirmed',
      '/bin/echo', '[]', null, null, 'completed', 0, '', '',
      new Date().toISOString(), new Date().toISOString(), null, null, null, '{}', null, null,
    );
    db.prepare(
      `
      insert into process_executions (
        execution_id, intent_id, executor_family, phase, confirmation_status,
        command, args_json, cwd, env_json, status, exit_code, stdout, stderr,
        started_at, completed_at, confirmed_at, error_message, artifact_id, result_json,
        lease_expires_at, lease_runner_id, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    ).run(
      'exec-b', 'intent-b', 'process', 'completed', 'unconfirmed',
      '/bin/echo', '[]', null, null, 'completed', 0, '', '',
      new Date().toISOString(), new Date().toISOString(), null, null, null, '{}', null, null,
    );
    db.close();

    const context = createMockContext({ configPath });
    const result = await confirmReplayCommand({ intentIds: ['intent-b'], limit: 10 }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      processed: 1,
      confirmed: 1,
    });
    expect((result.result as Record<string, unknown>).details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ intent_id: 'intent-b' }),
      ]),
    );
  });
});
