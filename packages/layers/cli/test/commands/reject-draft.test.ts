import { vi } from 'vitest';

// Unmock fs so we can use real SQLite databases in this test file.
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { rejectDraftCommand } from '../../src/commands/reject-draft.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database, SqliteOutboundStore, SqliteIntentStore, SqliteCoordinatorStore } from '@narada2/control-plane';

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

describe('reject-draft command', () => {
  let tempDir: string;
  let configPath: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-reject-draft-test-'));
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

    const db = new Database(dbPath);
    const outboundStore = new SqliteOutboundStore({ db });
    outboundStore.initSchema();
    const intentStore = new SqliteIntentStore({ db });
    intentStore.initSchema();
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    coordinatorStore.initSchema();
    db.close();
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  function seedDraftReadyOutbound(outboundId: string) {
    const db = new Database(dbPath);
    const outboundStore = new SqliteOutboundStore({ db });
    const intentStore = new SqliteIntentStore({ db });

    const now = new Date().toISOString();
    outboundStore.createCommand(
      {
        outbound_id: outboundId,
        context_id: 'ctx-1',
        scope_id: 'test-scope',
        action_type: 'send_reply',
        status: 'draft_ready',
        latest_version: 1,
        created_at: now,
        created_by: 'agent',
        submitted_at: null,
        confirmed_at: null,
        blocked_reason: null,
        terminal_reason: null,
        idempotency_key: `key-${outboundId}`,
        reviewed_at: null,
        reviewer_notes: null,
        external_reference: null,
      },
      {
        outbound_id: outboundId,
        version: 1,
        reply_to_message_id: null,
        to: [],
        cc: [],
        bcc: [],
        subject: '',
        body_text: '',
        body_html: '',
        idempotency_key: `key-${outboundId}`,
        policy_snapshot_json: '{}',
        payload_json: '{}',
        created_at: now,
        superseded_at: null,
      },
    );

    intentStore.admit({
      intent_id: `int-${outboundId}`,
      intent_type: 'mail.send_reply',
      executor_family: 'mail',
      payload_json: '{}',
      idempotency_key: `key-${outboundId}`,
      status: 'admitted',
      context_id: 'ctx-1',
      target_id: outboundId,
      terminal_reason: null,
    });

    db.close();
  }

  it('rejects a draft_ready outbound command and updates the intent', async () => {
    seedDraftReadyOutbound('out-1');

    const context = createMockContext({ configPath });
    const result = await rejectDraftCommand(
      { outboundId: 'out-1', rationale: 'not needed' },
      context,
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      outbound_id: 'out-1',
      action: 'reject_draft',
    });

    // Verify outbound command transitioned to cancelled
    const db = new Database(dbPath);
    const outboundStore = new SqliteOutboundStore({ db });
    const cmd = outboundStore.getCommand('out-1')!;
    expect(cmd.status).toBe('cancelled');
    expect(cmd.terminal_reason).toBe('operator_rejected');

    // Verify intent was updated
    const intentStore = new SqliteIntentStore({ db });
    const intent = intentStore.getByTargetId('out-1')!;
    expect(intent.status).toBe('cancelled');
    expect(intent.terminal_reason).toBe('operator_rejected');

    // Verify audit record
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    const actions = coordinatorStore.getPendingOperatorActionRequests('test-scope');
    // getPendingOperatorActionRequests only returns pending, so we need to query all
    const allActions = db.prepare("select * from operator_action_requests where action_type = 'reject_draft'").all() as Array<{
      request_id: string;
      scope_id: string;
      action_type: string;
      target_id: string;
      payload_json: string;
      status: string;
    }>;
    expect(allActions).toHaveLength(1);
    expect(allActions[0]!.scope_id).toBe('test-scope');
    expect(allActions[0]!.action_type).toBe('reject_draft');
    expect(allActions[0]!.target_id).toBe('out-1');
    expect(allActions[0]!.status).toBe('executed');
    expect(JSON.parse(allActions[0]!.payload_json)).toEqual({ rationale: 'not needed' });

    db.close();
  });

  it('returns error when outbound command is not draft_ready and audits rejection', async () => {
    const db = new Database(dbPath);
    const outboundStore = new SqliteOutboundStore({ db });
    const now = new Date().toISOString();
    outboundStore.createCommand(
      {
        outbound_id: 'out-2',
        context_id: 'ctx-1',
        scope_id: 'test-scope',
        action_type: 'send_reply',
        status: 'confirmed',
        latest_version: 1,
        created_at: now,
        created_by: 'agent',
        submitted_at: null,
        confirmed_at: null,
        blocked_reason: null,
        terminal_reason: null,
        idempotency_key: 'key-out-2',
        reviewed_at: null,
        reviewer_notes: null,
        external_reference: null,
      },
      {
        outbound_id: 'out-2',
        version: 1,
        reply_to_message_id: null,
        to: [],
        cc: [],
        bcc: [],
        subject: '',
        body_text: '',
        body_html: '',
        idempotency_key: 'key-out-2',
        policy_snapshot_json: '{}',
        payload_json: '{}',
        created_at: now,
        superseded_at: null,
      },
    );
    db.close();

    const context = createMockContext({ configPath });
    const result = await rejectDraftCommand({ outboundId: 'out-2' }, context);

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('not in draft_ready status'),
    });

    // Verify rejection was audited
    const db2 = new Database(dbPath);
    const allActions = db2.prepare("select * from operator_action_requests where action_type = 'reject_draft'").all() as Array<{
      request_id: string;
      scope_id: string;
      action_type: string;
      target_id: string;
      status: string;
    }>;
    expect(allActions).toHaveLength(1);
    expect(allActions[0]!.target_id).toBe('out-2');
    expect(allActions[0]!.status).toBe('rejected');
    db2.close();
  });

  it('returns error when outbound command is not found', async () => {
    const context = createMockContext({ configPath });
    const result = await rejectDraftCommand({ outboundId: 'missing' }, context);

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('not found'),
    });

    // No audit row should be created when the command is not found in any scope
    const db = new Database(dbPath);
    const count = db.prepare("select count(*) as c from operator_action_requests").get() as { c: number };
    expect(count.c).toBe(0);
    db.close();
  });
});
