/**
 * SQLite-backed Coordinator Store
 *
 * Durable state for foreman, charter outputs, thread records, and policy overrides.
 */

import Database from "better-sqlite3";
import type {
  CoordinatorStore,
  ThreadRecord,
  CharterOutputRow,
  ForemanDecisionRow,
  PolicyOverrideRow,
} from "./types.js";

function rowToThreadRecord(row: Record<string, unknown>): ThreadRecord {
  return {
    thread_id: String(row.thread_id),
    mailbox_id: String(row.mailbox_id),
    primary_charter: String(row.primary_charter),
    secondary_charters_json: String(row.secondary_charters_json),
    status: String(row.status),
    assigned_agent: row.assigned_agent ? String(row.assigned_agent) : null,
    last_message_at: String(row.last_message_at),
    last_inbound_at: row.last_inbound_at ? String(row.last_inbound_at) : null,
    last_outbound_at: row.last_outbound_at ? String(row.last_outbound_at) : null,
    last_analyzed_at: row.last_analyzed_at ? String(row.last_analyzed_at) : null,
    last_triaged_at: row.last_triaged_at ? String(row.last_triaged_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToCharterOutput(row: Record<string, unknown>): CharterOutputRow {
  return {
    output_id: String(row.output_id),
    thread_id: String(row.thread_id),
    mailbox_id: String(row.mailbox_id),
    charter_id: String(row.charter_id),
    role: String(row.role) as CharterOutputRow["role"],
    output_version: String(row.output_version),
    analyzed_at: String(row.analyzed_at),
    summary: String(row.summary),
    classifications_json: String(row.classifications_json),
    facts_json: String(row.facts_json),
    escalations_json: String(row.escalations_json),
    proposed_actions_json: String(row.proposed_actions_json),
    tool_requests_json: String(row.tool_requests_json),
    created_at: String(row.created_at),
  };
}

function rowToForemanDecision(row: Record<string, unknown>): ForemanDecisionRow {
  return {
    decision_id: String(row.decision_id),
    thread_id: String(row.thread_id),
    mailbox_id: String(row.mailbox_id),
    source_charter_ids_json: String(row.source_charter_ids_json),
    approved_action: String(row.approved_action),
    payload_json: String(row.payload_json),
    rationale: String(row.rationale),
    decided_at: String(row.decided_at),
    outbound_id: row.outbound_id ? String(row.outbound_id) : null,
    created_by: String(row.created_by),
  };
}

function rowToPolicyOverride(row: Record<string, unknown>): PolicyOverrideRow {
  return {
    override_id: String(row.override_id),
    outbound_id: String(row.outbound_id),
    overridden_by: String(row.overridden_by),
    reason: String(row.reason),
    created_at: String(row.created_at),
  };
}

export interface SqliteCoordinatorStoreOptions {
  db: Database.Database;
}

export class SqliteCoordinatorStore implements CoordinatorStore {
  readonly db: Database.Database;

  constructor(opts: SqliteCoordinatorStoreOptions) {
    this.db = opts.db;
  }

  initSchema(): void {
    this.db.exec(`
      create table if not exists thread_records (
        thread_id text not null,
        mailbox_id text not null,
        primary_charter text not null,
        secondary_charters_json text not null default '[]',
        status text not null,
        assigned_agent text,
        last_message_at text not null,
        last_inbound_at text,
        last_outbound_at text,
        last_analyzed_at text,
        last_triaged_at text,
        created_at text not null,
        updated_at text not null,
        primary key (thread_id, mailbox_id)
      );

      create index if not exists idx_thread_records_mailbox
        on thread_records(mailbox_id, updated_at desc);

      create index if not exists idx_thread_records_status
        on thread_records(status, mailbox_id);

      create table if not exists charter_outputs (
        output_id text primary key,
        thread_id text not null,
        mailbox_id text not null,
        charter_id text not null,
        role text not null,
        output_version text not null,
        analyzed_at text not null,
        summary text not null,
        classifications_json text not null default '[]',
        facts_json text not null default '[]',
        escalations_json text not null default '[]',
        proposed_actions_json text not null default '[]',
        tool_requests_json text not null default '[]',
        created_at text not null,
        foreign key (thread_id, mailbox_id) references thread_records(thread_id, mailbox_id)
          on delete cascade
      );

      create index if not exists idx_charter_outputs_thread
        on charter_outputs(thread_id, mailbox_id, analyzed_at desc);

      create index if not exists idx_charter_outputs_charter
        on charter_outputs(charter_id, analyzed_at desc);

      create table if not exists foreman_decisions (
        decision_id text primary key,
        thread_id text not null,
        mailbox_id text not null,
        source_charter_ids_json text not null,
        approved_action text not null,
        payload_json text not null,
        rationale text not null,
        decided_at text not null,
        outbound_id text,
        created_by text not null,
        foreign key (thread_id, mailbox_id) references thread_records(thread_id, mailbox_id)
          on delete cascade
      );

      create index if not exists idx_foreman_decisions_thread
        on foreman_decisions(thread_id, mailbox_id, decided_at desc);

      create index if not exists idx_foreman_decisions_outbound
        on foreman_decisions(outbound_id);

      create table if not exists policy_overrides (
        override_id text primary key,
        outbound_id text not null,
        overridden_by text not null,
        reason text not null,
        created_at text not null,
        foreign key (outbound_id) references outbound_commands(outbound_id)
      );

      create index if not exists idx_policy_overrides_outbound
        on policy_overrides(outbound_id);
    `);
  }

  upsertThread(record: ThreadRecord): void {
    this.db.prepare(`
      insert into thread_records (
        thread_id, mailbox_id, primary_charter, secondary_charters_json, status,
        assigned_agent, last_message_at, last_inbound_at, last_outbound_at,
        last_analyzed_at, last_triaged_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(thread_id, mailbox_id) do update set
        primary_charter = excluded.primary_charter,
        secondary_charters_json = excluded.secondary_charters_json,
        status = excluded.status,
        assigned_agent = excluded.assigned_agent,
        last_message_at = excluded.last_message_at,
        last_inbound_at = excluded.last_inbound_at,
        last_outbound_at = excluded.last_outbound_at,
        last_analyzed_at = excluded.last_analyzed_at,
        last_triaged_at = excluded.last_triaged_at,
        updated_at = excluded.updated_at
    `).run(
      record.thread_id,
      record.mailbox_id,
      record.primary_charter,
      record.secondary_charters_json,
      record.status,
      record.assigned_agent,
      record.last_message_at,
      record.last_inbound_at,
      record.last_outbound_at,
      record.last_analyzed_at,
      record.last_triaged_at,
      record.created_at,
      record.updated_at,
    );
  }

  getThread(threadId: string, mailboxId: string): ThreadRecord | undefined {
    const row = this.db.prepare(`
      select * from thread_records where thread_id = ? and mailbox_id = ?
    `).get(threadId, mailboxId) as Record<string, unknown> | undefined;
    return row ? rowToThreadRecord(row) : undefined;
  }

  insertCharterOutput(output: CharterOutputRow): void {
    this.db.prepare(`
      insert into charter_outputs (
        output_id, thread_id, mailbox_id, charter_id, role, output_version,
        analyzed_at, summary, classifications_json, facts_json, escalations_json,
        proposed_actions_json, tool_requests_json, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      output.output_id,
      output.thread_id,
      output.mailbox_id,
      output.charter_id,
      output.role,
      output.output_version,
      output.analyzed_at,
      output.summary,
      output.classifications_json,
      output.facts_json,
      output.escalations_json,
      output.proposed_actions_json,
      output.tool_requests_json,
      output.created_at,
    );
  }

  getOutputsByThread(threadId: string, mailboxId: string): CharterOutputRow[] {
    const rows = this.db.prepare(`
      select * from charter_outputs
      where thread_id = ? and mailbox_id = ?
      order by analyzed_at desc
    `).all(threadId, mailboxId) as Record<string, unknown>[];
    return rows.map(rowToCharterOutput);
  }

  insertDecision(decision: ForemanDecisionRow): void {
    this.db.prepare(`
      insert into foreman_decisions (
        decision_id, thread_id, mailbox_id, source_charter_ids_json,
        approved_action, payload_json, rationale, decided_at, outbound_id, created_by
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      decision.decision_id,
      decision.thread_id,
      decision.mailbox_id,
      decision.source_charter_ids_json,
      decision.approved_action,
      decision.payload_json,
      decision.rationale,
      decision.decided_at,
      decision.outbound_id,
      decision.created_by,
    );
  }

  getDecisionsByThread(threadId: string, mailboxId: string): ForemanDecisionRow[] {
    const rows = this.db.prepare(`
      select * from foreman_decisions
      where thread_id = ? and mailbox_id = ?
      order by decided_at desc
    `).all(threadId, mailboxId) as Record<string, unknown>[];
    return rows.map(rowToForemanDecision);
  }

  linkDecisionToOutbound(decisionId: string, outboundId: string): void {
    this.db.prepare(`
      update foreman_decisions set outbound_id = ? where decision_id = ?
    `).run(outboundId, decisionId);
  }

  insertOverride(override: PolicyOverrideRow): void {
    this.db.prepare(`
      insert into policy_overrides (
        override_id, outbound_id, overridden_by, reason, created_at
      ) values (?, ?, ?, ?, ?)
    `).run(
      override.override_id,
      override.outbound_id,
      override.overridden_by,
      override.reason,
      override.created_at,
    );
  }

  getOverridesByOutboundId(outboundId: string): PolicyOverrideRow[] {
    const rows = this.db.prepare(`
      select * from policy_overrides where outbound_id = ? order by created_at asc
    `).all(outboundId) as Record<string, unknown>[];
    return rows.map(rowToPolicyOverride);
  }

  close(): void {
    // Intentionally no-op: this store shares a database connection
    // and does not own its lifecycle.
  }
}
