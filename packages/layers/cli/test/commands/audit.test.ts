import { vi } from 'vitest';

// Unmock fs so we can use real SQLite databases in this test file.
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { auditCommand } from '../../src/commands/audit.js';
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

describe('audit command', () => {
  let tempDir: string;
  let configPath: string;
  let dbPath: string;
  let db: Database;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-audit-test-'));
    configPath = join(tempDir, 'config.json');
    const rootDir = join(tempDir, 'data');
    const naradaDir = join(rootDir, '.narada');
    dbPath = join(naradaDir, 'coordinator.db');

    mkdirSync(naradaDir, { recursive: true });

    writeFileSync(
      configPath,
      JSON.stringify({
        mailbox_id: 'test@example.com',
        root_dir: rootDir,
        graph: {
          user_id: 'test@example.com',
          prefer_immutable_ids: true,
        },
        scope: {
          included_container_refs: ['inbox'],
          included_item_kinds: ['message'],
        },
      }, null, 2),
    );

    db = new Database(dbPath);
    db.exec(`
      create table if not exists operator_action_requests (
        request_id text primary key,
        scope_id text not null,
        action_type text not null,
        target_id text,
        payload_json text,
        status text not null default 'pending',
        requested_by text not null default 'operator',
        requested_at text not null default (datetime('now')),
        executed_at text
      );
    `);

    // Insert fixture data
    db.prepare(`
      insert into operator_action_requests (request_id, scope_id, action_type, target_id, payload_json, status, requested_by, requested_at, executed_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('req-1', 'test@example.com', 'trigger_sync', null, null, 'executed', 'operator', '2024-01-01T10:00:00Z', '2024-01-01T10:00:01Z');

    db.prepare(`
      insert into operator_action_requests (request_id, scope_id, action_type, target_id, payload_json, status, requested_by, requested_at, executed_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('req-2', 'test@example.com', 'retry_work_item', 'wi-1', null, 'executed', 'system', '2024-01-02T10:00:00Z', '2024-01-02T10:00:01Z');
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns operator actions in JSON format', async () => {
    const context = createMockContext({ configPath });
    const result = await auditCommand({ format: 'json' }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      scope: 'test@example.com',
      count: 2,
    });
    const actions = (result.result as { actions: Array<{ action_id: string }> }).actions;
    expect(actions.map((a) => a.action_id)).toContain('req-1');
    expect(actions.map((a) => a.action_id)).toContain('req-2');
  });

  it('filters by --since', async () => {
    const context = createMockContext({ configPath });
    const result = await auditCommand({ format: 'json', since: '2024-01-02T00:00:00Z' }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const actions = (result.result as { actions: Array<{ action_id: string }> }).actions;
    expect(actions).toHaveLength(1);
    expect(actions[0]!.action_id).toBe('req-2');
  });

  it('respects --limit', async () => {
    const context = createMockContext({ configPath });
    const result = await auditCommand({ format: 'json', limit: 1 }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const actions = (result.result as { actions: Array<{ action_id: string }> }).actions;
    expect(actions).toHaveLength(1);
  });

  it('returns error when database is missing', async () => {
    const emptyDir = join(tempDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    const emptyConfigPath = join(tempDir, 'empty-config.json');
    writeFileSync(
      emptyConfigPath,
      JSON.stringify({
        mailbox_id: 'empty@example.com',
        root_dir: emptyDir,
        graph: { user_id: 'empty@example.com', prefer_immutable_ids: true },
        scope: { included_container_refs: ['inbox'], included_item_kinds: ['message'] },
      }, null, 2),
    );

    const context = createMockContext({ configPath: emptyConfigPath });
    const result = await auditCommand({ format: 'json' }, context);

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error' });
  });

  it('returns INVALID_CONFIG for unknown explicit --operation', async () => {
    const context = createMockContext({ configPath });
    const result = await auditCommand({ format: 'json', scope: 'nonexistent-scope' }, context);

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      error: 'Operation not found: nonexistent-scope',
    });
  });

  it('produces human-readable tabular output', async () => {
    const context = createMockContext({ configPath });
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    try {
      const result = await auditCommand({ format: 'human' }, context);
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
    } finally {
      console.log = originalLog;
    }
    const output = logs.join('\n');
    expect(output).toContain('trigger_sync');
    expect(output).toContain('retry_work_item');
    expect(output).toContain('operator');
    expect(output).toContain('system');
  });
});
