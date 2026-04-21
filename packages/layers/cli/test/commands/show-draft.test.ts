import { vi } from 'vitest';

// Unmock fs so we can use real SQLite databases in this test file.
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { showDraftCommand } from '../../src/commands/show-draft.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database, SqliteOutboundStore, SqliteCoordinatorStore } from '@narada2/control-plane';

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

describe('show-draft command', () => {
  let tempDir: string;
  let configPath: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-show-draft-test-'));
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
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    const now = new Date().toISOString();

    coordinatorStore.upsertContextRecord({
      context_id: 'ctx-1',
      scope_id: 'test-scope',
      primary_charter: 'support_steward',
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
        to: ['recipient@example.com'],
        cc: [],
        bcc: [],
        subject: 'Re: Help needed',
        body_text: 'Here is the reply text.',
        body_html: '',
        idempotency_key: `key-${outboundId}`,
        policy_snapshot_json: '{}',
        payload_json: '{}',
        created_at: now,
        superseded_at: null,
      },
    );

    coordinatorStore.insertDecision({
      decision_id: `fd-${outboundId}`,
      context_id: 'ctx-1',
      scope_id: 'test-scope',
      source_charter_ids_json: '["support_steward"]',
      approved_action: 'send_reply',
      payload_json: '{}',
      rationale: 'Customer needs a follow-up',
      decided_at: now,
      outbound_id: outboundId,
      created_by: 'foreman:test/charter:support_steward',
    });

    coordinatorStore.insertWorkItem({
      work_item_id: 'wi-1',
      context_id: 'ctx-1',
      scope_id: 'test-scope',
      status: 'resolved',
      priority: 0,
      opened_for_revision_id: 'rev-1',
      resolved_revision_id: null,
      resolution_outcome: 'action_created',
      error_message: null,
      retry_count: 0,
      next_retry_at: null,
      context_json: null,
      created_at: now,
      updated_at: now,
      preferred_session_id: null,
      preferred_agent_id: null,
      affinity_group_id: null,
      affinity_strength: 0,
      affinity_expires_at: null,
      affinity_reason: null,
    });

    coordinatorStore.insertExecutionAttempt({
      execution_id: 'ex-1',
      work_item_id: 'wi-1',
      revision_id: 'rev-1',
      session_id: null,
      status: 'succeeded',
      started_at: now,
      completed_at: now,
      runtime_envelope_json: '{}',
      outcome_json: null,
      error_message: null,
    });

    coordinatorStore.insertEvaluation({
      evaluation_id: 'eval-1',
      execution_id: 'ex-1',
      work_item_id: 'wi-1',
      context_id: 'ctx-1',
      scope_id: 'test-scope',
      charter_id: 'support_steward',
      role: 'primary',
      output_version: '1',
      analyzed_at: now,
      outcome: 'accepted',
      confidence_json: '{}',
      summary: 'Customer asks for follow-up',
      classifications_json: '[]',
      facts_json: '[]',
      escalations_json: '[]',
      proposed_actions_json: '[]',
      tool_requests_json: '[]',
      recommended_action_class: null,
      created_at: now,
    });

    db.close();
  }

  it('returns draft detail with lineage and available actions', async () => {
    seedDraftReadyOutbound('out-1');

    const context = createMockContext({ configPath });
    const result = await showDraftCommand({ outboundId: 'out-1' }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      draft: expect.objectContaining({
        outbound_id: 'out-1',
        status: 'draft_ready',
        review_status: 'awaiting_review',
        subject: 'Re: Help needed',
        body_preview: 'Here is the reply text.',
        to: ['recipient@example.com'],
        decision_rationale: 'Customer needs a follow-up',
        evaluation_summary: 'Customer asks for follow-up',
        charter_id: 'support_steward',
        available_actions: expect.arrayContaining(['approve_draft_for_send', 'mark_reviewed', 'reject_draft', 'handled_externally']),
      }),
    });
  });

  it('returns formatted human output when format is human', async () => {
    seedDraftReadyOutbound('out-1');

    const context = createMockContext({ configPath });
    const result = await showDraftCommand({ outboundId: 'out-1', format: 'human' }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      _formatted: expect.stringContaining('Draft: out-1'),
      draft: expect.objectContaining({ outbound_id: 'out-1' }),
    });
    const formatted = (result.result as { _formatted: string })._formatted;
    expect(formatted).toContain('Available Actions');
    expect(formatted).toContain('narada approve-draft-for-send out-1');
    expect(formatted).toContain('Decision');
    expect(formatted).toContain('Evaluation');
  });

  it('returns error when outbound command is not found in any scope', async () => {
    const context = createMockContext({ configPath });
    const result = await showDraftCommand({ outboundId: 'out-missing' }, context);

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('not found'),
    });
  });
});
