import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approvePendingDecisionCommand } from '../../src/commands/approve-pending-decision.js';
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

function createMockContext(configPath: string): CommandContext {
  return {
    configPath,
    logger: createMockLogger(),
    verbose: false,
  };
}

describe('approve-pending-decision command', () => {
  let tempDir: string;
  let configPath: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-approve-pending-decision-'));
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

  function seedPendingDecision(payload: Record<string, unknown>) {
    const db = new Database(dbPath);
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    const now = new Date().toISOString();
    coordinatorStore.upsertContextRecord({
      context_id: 'ctx-1',
      scope_id: 'test-scope',
      primary_charter: 'charter-1',
      secondary_charters_json: '[]',
      status: 'active',
      assigned_agent: null,
      last_message_at: now,
      last_inbound_at: null,
      last_outbound_at: null,
      last_analyzed_at: null,
      last_triaged_at: null,
      created_at: now,
      updated_at: now,
    });
    coordinatorStore.insertDecision({
      decision_id: 'fd_wi_1_pending_approval',
      context_id: 'ctx-1',
      scope_id: 'test-scope',
      source_charter_ids_json: JSON.stringify(['charter-1']),
      approved_action: 'pending_approval',
      payload_json: JSON.stringify(payload),
      rationale: 'Needs operator approval',
      decided_at: now,
      outbound_id: null,
      created_by: 'foreman:test/charter:charter-1',
    });
    db.close();
  }

  it('materializes a pending approval decision into an outbound command without sending mail', async () => {
    seedPendingDecision({
      reason: 'Clarification draft valid but requires human approval',
      proposed_action: {
        action_type: 'draft_reply',
        payload_json: JSON.stringify({
          reply_to_message_id: 'msg-1',
          to: ['willem@example.com'],
          subject: 'Re: Campaign request',
          body_text: 'Could you clarify the audience and target date?',
        }),
        rationale: 'Ask for missing campaign details',
      },
    });

    const result = await approvePendingDecisionCommand(
      { decisionId: 'fd_wi_1_pending_approval', by: 'operator', format: 'json' },
      createMockContext(configPath),
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      idempotent: false,
      decision_id: 'fd_wi_1_pending_approval',
      approved_decision_id: 'fd_wi_1_pending_approval_approved_draft_reply',
      action: 'draft_reply',
    });

    const outboundId = (result.result as { outbound_id: string }).outbound_id;
    const db = new Database(dbPath);
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    const outboundStore = new SqliteOutboundStore({ db });
    const approved = coordinatorStore.getDecisionById('fd_wi_1_pending_approval_approved_draft_reply');
    const command = outboundStore.getCommand(outboundId);
    const version = outboundStore.getLatestVersion(outboundId);
    db.close();

    expect(approved?.outbound_id).toBe(outboundId);
    expect(command).toMatchObject({
      outbound_id: outboundId,
      action_type: 'draft_reply',
      status: 'pending',
    });
    expect(version).toMatchObject({
      reply_to_message_id: 'msg-1',
      to: ['willem@example.com'],
      subject: 'Re: Campaign request',
      body_text: 'Could you clarify the audience and target date?',
    });
  });

  it('is idempotent when a pending decision was already materialized', async () => {
    seedPendingDecision({
      proposed_action: {
        action_type: 'draft_reply',
        payload_json: JSON.stringify({
          reply_to_message_id: 'msg-1',
          to: ['willem@example.com'],
          subject: 'Re: Campaign request',
          body_text: 'Could you clarify the audience and target date?',
        }),
      },
    });

    const first = await approvePendingDecisionCommand(
      { decisionId: 'fd_wi_1_pending_approval', by: 'operator', format: 'json' },
      createMockContext(configPath),
    );
    const second = await approvePendingDecisionCommand(
      { decisionId: 'fd_wi_1_pending_approval', by: 'operator', format: 'json' },
      createMockContext(configPath),
    );

    expect(first.exitCode).toBe(ExitCode.SUCCESS);
    expect(second.exitCode).toBe(ExitCode.SUCCESS);
    expect(second.result).toMatchObject({
      status: 'success',
      idempotent: true,
      outbound_id: (first.result as { outbound_id: string }).outbound_id,
    });
  });

  it('rejects pending decisions without a materializable proposed action', async () => {
    seedPendingDecision({ reason: 'approval required' });

    const result = await approvePendingDecisionCommand(
      { decisionId: 'fd_wi_1_pending_approval', by: 'operator', format: 'json' },
      createMockContext(configPath),
    );

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('does not contain a materializable proposed_action'),
    });
  });
});
