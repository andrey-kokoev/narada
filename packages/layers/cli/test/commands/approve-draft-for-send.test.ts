import { vi } from 'vitest';

// Unmock fs so this command-level test uses a real SQLite database.
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approveDraftForSendCommand } from '../../src/commands/approve-draft-for-send.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { Database, SqliteCoordinatorStore, SqliteIntentStore, SqliteOutboundStore } from '@narada2/control-plane';

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

describe('approve-draft-for-send command', () => {
  let tempDir: string;
  let configPath: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-approve-draft-test-'));
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
    new SqliteOutboundStore({ db }).initSchema();
    new SqliteIntentStore({ db }).initSchema();
    new SqliteCoordinatorStore({ db }).initSchema();
    db.close();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function seedOutbound(outboundId: string, status: 'draft_ready' | 'confirmed' = 'draft_ready') {
    const db = new Database(dbPath);
    const outboundStore = new SqliteOutboundStore({ db });
    const now = new Date().toISOString();

    outboundStore.createCommand(
      {
        outbound_id: outboundId,
        context_id: 'ctx-1',
        scope_id: 'test-scope',
        action_type: 'send_reply',
        status,
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
        approved_at: null,
      },
      {
        outbound_id: outboundId,
        version: 1,
        reply_to_message_id: null,
        to: ['alice@example.com'],
        cc: [],
        bcc: [],
        subject: 'Re: Login issue',
        body_text: 'Draft body',
        body_html: '',
        idempotency_key: `key-${outboundId}`,
        policy_snapshot_json: '{}',
        payload_json: '{}',
        created_at: now,
        superseded_at: null,
      },
    );

    db.close();
  }

  it('promotes a draft_ready outbound command to approved_for_send and audits the action', async () => {
    seedOutbound('out-1');

    const result = await approveDraftForSendCommand(
      { outboundId: 'out-1' },
      createMockContext({ configPath }),
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      outbound_id: 'out-1',
      action: 'approve_draft_for_send',
    });

    const db = new Database(dbPath);
    const outboundStore = new SqliteOutboundStore({ db });
    const command = outboundStore.getCommand('out-1')!;
    expect(command.status).toBe('approved_for_send');
    expect(command.approved_at).not.toBeNull();

    const transitions = db
      .prepare('select from_status, to_status from outbound_transitions where outbound_id = ? order by id')
      .all('out-1') as Array<{ from_status: string | null; to_status: string }>;
    expect(transitions.map((t) => [t.from_status, t.to_status])).toContainEqual([
      'draft_ready',
      'approved_for_send',
    ]);

    const actions = db
      .prepare("select scope_id, action_type, target_id, status from operator_action_requests where action_type = 'approve_draft_for_send'")
      .all() as Array<{ scope_id: string; action_type: string; target_id: string; status: string }>;
    expect(actions).toEqual([
      {
        scope_id: 'test-scope',
        action_type: 'approve_draft_for_send',
        target_id: 'out-1',
        status: 'executed',
      },
    ]);
    db.close();
  });

  it('rejects approval when the outbound command is not draft_ready and audits rejection', async () => {
    seedOutbound('out-2', 'confirmed');

    const result = await approveDraftForSendCommand(
      { outboundId: 'out-2' },
      createMockContext({ configPath }),
    );

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('not in draft_ready status'),
    });

    const db = new Database(dbPath);
    const outboundStore = new SqliteOutboundStore({ db });
    expect(outboundStore.getCommand('out-2')!.status).toBe('confirmed');

    const actions = db
      .prepare("select target_id, status from operator_action_requests where action_type = 'approve_draft_for_send'")
      .all() as Array<{ target_id: string; status: string }>;
    expect(actions).toEqual([{ target_id: 'out-2', status: 'rejected' }]);
    db.close();
  });
});
