import { vi } from 'vitest';

// Unmock fs so we can use real SQLite databases in this test file.
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { showCommand } from '../../src/commands/show.js';
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

describe('show command', () => {
  let tempDir: string;
  let configPath: string;
  let dbPath: string;
  let db: Database;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-show-test-'));
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
      create table if not exists context_records (
        context_id text primary key,
        scope_id text not null,
        primary_charter text not null,
        secondary_charters_json text not null default '[]',
        status text not null default 'active',
        assigned_agent text,
        last_message_at text,
        last_inbound_at text,
        last_outbound_at text,
        last_analyzed_at text,
        last_triaged_at text,
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now'))
      );

      create table if not exists work_items (
        work_item_id text primary key,
        context_id text not null,
        scope_id text not null,
        status text not null default 'opened',
        priority integer not null default 0,
        opened_for_revision_id text not null,
        resolved_revision_id text,
        resolution_outcome text,
        error_message text,
        retry_count integer not null default 0,
        next_retry_at text,
        context_json text,
        preferred_session_id text,
        preferred_agent_id text,
        affinity_group_id text,
        affinity_reason text,
        affinity_strength integer not null default 0,
        affinity_expires_at text,
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now'))
      );

      create table if not exists execution_attempts (
        execution_id text primary key,
        work_item_id text not null,
        revision_id text not null,
        session_id text,
        status text not null default 'started',
        started_at text not null default (datetime('now')),
        completed_at text,
        runtime_envelope_json text not null default '{}',
        outcome_json text,
        error_message text
      );

      create table if not exists evaluations (
        evaluation_id text primary key,
        execution_id text not null unique,
        work_item_id text not null,
        context_id text not null,
        scope_id text not null,
        charter_id text not null,
        role text not null check (role in ('primary', 'secondary')),
        output_version text not null,
        analyzed_at text not null default (datetime('now')),
        outcome text not null,
        confidence_json text not null default '{}',
        summary text not null,
        classifications_json text not null default '[]',
        facts_json text not null default '[]',
        escalations_json text not null default '[]',
        proposed_actions_json text not null default '[]',
        tool_requests_json text not null default '[]',
        recommended_action_class text,
        created_at text not null default (datetime('now'))
      );

      create table if not exists foreman_decisions (
        decision_id text primary key,
        context_id text not null,
        scope_id text not null,
        source_charter_ids_json text not null default '[]',
        approved_action text not null,
        payload_json text not null default '{}',
        rationale text not null,
        decided_at text not null,
        outbound_id text,
        created_by text not null
      );
    `);

    // Insert fixture data
    db.prepare(`insert into context_records (context_id, scope_id, primary_charter) values (?, ?, ?)`)
      .run('ctx-1', 'test@example.com', 'support_steward');

    db.prepare(`insert into work_items (work_item_id, context_id, scope_id, opened_for_revision_id) values (?, ?, ?, ?)`)
      .run('wi-1', 'ctx-1', 'test@example.com', 'rev-1');

    db.prepare(`
      insert into execution_attempts (
        execution_id, work_item_id, revision_id, session_id, status,
        started_at, runtime_envelope_json, outcome_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'exec-1', 'wi-1', 'rev-1', 'session-1', 'succeeded',
      '2024-01-01T00:00:00Z',
      JSON.stringify({ context: { facts: [] }, tools: [], policy: {} }),
      JSON.stringify({ action: 'draft_reply', payload: {} }),
    );

    db.prepare(`
      insert into evaluations (
        evaluation_id, execution_id, work_item_id, context_id, scope_id,
        charter_id, role, output_version, analyzed_at, outcome, summary,
        confidence_json, classifications_json, facts_json, escalations_json,
        proposed_actions_json, tool_requests_json, recommended_action_class
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'eval-1', 'exec-1', 'wi-1', 'ctx-1', 'test@example.com',
      'support_steward', 'primary', '1.0', '2024-01-01T00:01:00Z',
      'proposed', 'Eval summary',
      JSON.stringify({ overall: 0.9 }),
      JSON.stringify([{ tag: 'urgent' }]),
      JSON.stringify([{ fact_id: 'f-1', fact_type: 'mail.received' }]),
      JSON.stringify([]),
      JSON.stringify([{ action_type: 'draft_reply', authority: 'propose', rationale: 'Reply needed' }]),
      JSON.stringify([{ tool_id: 'send_email', args: {}, approved: false }]),
      'draft_reply',
    );

    db.prepare(`
      insert into foreman_decisions (
        decision_id, context_id, scope_id, source_charter_ids_json,
        approved_action, payload_json, rationale, decided_at, created_by
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'dec-1', 'ctx-1', 'test@example.com',
      JSON.stringify(['support_steward']),
      'draft_reply',
      JSON.stringify({ to: 'user@example.com', subject: 'Re: Test' }),
      'Single charter with high confidence proposed draft_reply',
      '2024-01-01T00:02:00Z',
      'foreman:test/charter:support_steward',
    );
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('shows evaluation detail in JSON format', async () => {
    const context = createMockContext({ configPath });
    const result = await showCommand(
      { type: 'evaluation', id: 'eval-1', format: 'json' },
      context,
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      type: 'evaluation',
      evaluation: {
        evaluation_id: 'eval-1',
        charter_id: 'support_steward',
        outcome: 'proposed',
        summary: 'Eval summary',
        proposed_actions: [{ action_type: 'draft_reply', authority: 'propose', rationale: 'Reply needed' }],
        confidence: { overall: 0.9 },
        classifications: [{ tag: 'urgent' }],
        facts: [{ fact_id: 'f-1', fact_type: 'mail.received' }],
        tool_requests: [{ tool_id: 'send_email', args: {}, approved: false }],
        escalations: [],
      },
    });
  });

  it('shows decision detail in JSON format', async () => {
    const context = createMockContext({ configPath });
    const result = await showCommand(
      { type: 'decision', id: 'dec-1', format: 'json' },
      context,
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      type: 'decision',
      decision: {
        decision_id: 'dec-1',
        approved_action: 'draft_reply',
        rationale: 'Single charter with high confidence proposed draft_reply',
        source_charter_ids: ['support_steward'],
        payload: { to: 'user@example.com', subject: 'Re: Test' },
      },
    });
  });

  it('shows execution detail in JSON format', async () => {
    const context = createMockContext({ configPath });
    const result = await showCommand(
      { type: 'execution', id: 'exec-1', format: 'json' },
      context,
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      type: 'execution',
      execution: {
        execution_id: 'exec-1',
        work_item_id: 'wi-1',
        session_id: 'session-1',
        status: 'succeeded',
        runtime_envelope: { context: { facts: [] }, tools: [], policy: {} },
        outcome: { action: 'draft_reply', payload: {} },
      },
    });
  });

  it('returns error for missing evaluation', async () => {
    const context = createMockContext({ configPath });
    const result = await showCommand(
      { type: 'evaluation', id: 'nonexistent', format: 'json' },
      context,
    );

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: 'evaluation not found: nonexistent',
    });
  });

  it('returns error for missing decision', async () => {
    const context = createMockContext({ configPath });
    const result = await showCommand(
      { type: 'decision', id: 'nonexistent', format: 'json' },
      context,
    );

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: 'decision not found: nonexistent',
    });
  });

  it('returns error for missing execution', async () => {
    const context = createMockContext({ configPath });
    const result = await showCommand(
      { type: 'execution', id: 'nonexistent', format: 'json' },
      context,
    );

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: 'execution not found: nonexistent',
    });
  });

  it('returns INVALID_CONFIG for unknown explicit --scope', async () => {
    const context = createMockContext({ configPath });
    const result = await showCommand(
      { type: 'evaluation', id: 'eval-1', format: 'json', scope: 'nonexistent-scope' },
      context,
    );

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      error: 'Operation not found: nonexistent-scope',
    });
  });

  it('returns error when database is missing', async () => {
    // Use a different root dir that has no .narada/coordinator.db
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
    const result = await showCommand(
      { type: 'evaluation', id: 'eval-1', format: 'json' },
      context,
    );

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
    });
  });

  it('produces human-readable output for evaluation', async () => {
    const context = createMockContext({ configPath });
    const result = await showCommand(
      { type: 'evaluation', id: 'eval-1', format: 'human' },
      context,
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const formatted = (result.result as { _formatted: string })._formatted;
    expect(formatted).toContain('EVALUATION: eval-1');
    expect(formatted).toContain('Operation: test@example.com');
    expect(formatted).toContain('Charter:        support_steward');
    expect(formatted).toContain('Proposed Actions');
    expect(formatted).toContain('Confidence');
  });
});
