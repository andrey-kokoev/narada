/**
 * SQLite-backed Coordinator Store
 *
 * Durable state for foreman, charter outputs, thread records, and policy overrides.
 */

import Database from "better-sqlite3";
import type {
  CoordinatorStore,
  ThreadRecord,
  ConversationRecord,
  CharterOutputRow,
  ForemanDecisionRow,
  PolicyOverrideRow,
  WorkItem,
  WorkItemStatus,
  WorkItemLease,
  ExecutionAttempt,
  ExecutionAttemptStatus,
  Evaluation,
  AgentSession,
  ToolCallRecord,
  ToolCallStatus,
} from "./types.js";
import { isValidCreatedBy } from "./types.js";

function rowToThreadRecord(row: Record<string, unknown>): ThreadRecord {
  return {
    conversation_id: String(row.thread_id),
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

function rowToConversationRecord(row: Record<string, unknown>): ConversationRecord {
  return {
    conversation_id: String(row.conversation_id),
    mailbox_id: String(row.mailbox_id),
    primary_charter: String(row.primary_charter),
    secondary_charters_json: String(row.secondary_charters_json),
    status: String(row.status) as ConversationRecord["status"],
    assigned_agent: row.assigned_agent ? String(row.assigned_agent) : null,
    last_message_at: row.last_message_at ? String(row.last_message_at) : null,
    last_inbound_at: row.last_inbound_at ? String(row.last_inbound_at) : null,
    last_outbound_at: row.last_outbound_at ? String(row.last_outbound_at) : null,
    last_analyzed_at: row.last_analyzed_at ? String(row.last_analyzed_at) : null,
    last_triaged_at: row.last_triaged_at ? String(row.last_triaged_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToWorkItem(row: Record<string, unknown>): WorkItem {
  return {
    work_item_id: String(row.work_item_id),
    context_id: String(row.context_id),
    scope_id: String(row.scope_id),
    status: String(row.status) as WorkItemStatus,
    priority: Number(row.priority),
    opened_for_revision_id: String(row.opened_for_revision_id),
    resolved_revision_id: row.resolved_revision_id ? String(row.resolved_revision_id) : null,
    resolution_outcome: row.resolution_outcome
      ? (String(row.resolution_outcome) as WorkItem["resolution_outcome"])
      : null,
    error_message: row.error_message ? String(row.error_message) : null,
    retry_count: Number(row.retry_count ?? 0),
    next_retry_at: row.next_retry_at ? String(row.next_retry_at) : null,
    context_json: row.context_json ? String(row.context_json) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToWorkItemLease(row: Record<string, unknown>): WorkItemLease {
  return {
    lease_id: String(row.lease_id),
    work_item_id: String(row.work_item_id),
    runner_id: String(row.runner_id),
    acquired_at: String(row.acquired_at),
    expires_at: String(row.expires_at),
    released_at: row.released_at ? String(row.released_at) : null,
    release_reason: row.release_reason
      ? (String(row.release_reason) as WorkItemLease["release_reason"])
      : null,
  };
}

function rowToExecutionAttempt(row: Record<string, unknown>): ExecutionAttempt {
  return {
    execution_id: String(row.execution_id),
    work_item_id: String(row.work_item_id),
    revision_id: String(row.revision_id),
    session_id: row.session_id ? String(row.session_id) : null,
    status: String(row.status) as ExecutionAttemptStatus,
    started_at: String(row.started_at),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    runtime_envelope_json: String(row.runtime_envelope_json),
    outcome_json: row.outcome_json ? String(row.outcome_json) : null,
    error_message: row.error_message ? String(row.error_message) : null,
  };
}

function rowToAgentSession(row: Record<string, unknown>): AgentSession {
  return {
    session_id: String(row.session_id),
    context_id: String(row.context_id),
    work_item_id: String(row.work_item_id ?? ''),
    started_at: String(row.started_at),
    ended_at: row.ended_at ? String(row.ended_at) : null,
    updated_at: String(row.updated_at ?? row.started_at),
    status: String(row.status) as AgentSession["status"],
    resume_hint: row.resume_hint ? String(row.resume_hint) : null,
  };
}

function rowToEvaluation(row: Record<string, unknown>): Evaluation {
  return {
    evaluation_id: String(row.evaluation_id),
    execution_id: String(row.execution_id),
    work_item_id: String(row.work_item_id),
    context_id: String(row.context_id),
    scope_id: String(row.scope_id),
    charter_id: String(row.charter_id),
    role: String(row.role) as Evaluation["role"],
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

function rowToCharterOutput(row: Record<string, unknown>): CharterOutputRow {
  return {
    output_id: String(row.output_id),
    context_id: String(row.context_id),
    scope_id: String(row.scope_id),
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
    context_id: String(row.context_id),
    scope_id: String(row.scope_id),
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

function rowToToolCallRecord(row: Record<string, unknown>): ToolCallRecord {
  return {
    call_id: String(row.call_id),
    execution_id: String(row.execution_id),
    work_item_id: String(row.work_item_id),
    context_id: String(row.context_id),
    tool_id: String(row.tool_id),
    request_args_json: String(row.request_args_json),
    exit_status: String(row.exit_status) as ToolCallStatus,
    stdout: String(row.stdout),
    stderr: String(row.stderr),
    structured_output_json: row.structured_output_json ? String(row.structured_output_json) : null,
    started_at: String(row.started_at),
    completed_at: String(row.completed_at),
    duration_ms: Number(row.duration_ms),
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
      -- Legacy thread_records (deprecated, retained for rollback safety)
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

      -- v2 conversation_records (canonical control-plane conversation metadata)
      create table if not exists conversation_records (
        conversation_id text primary key,
        mailbox_id text not null,
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

      create index if not exists idx_conversation_records_mailbox
        on conversation_records(mailbox_id, status, updated_at);

      -- v2 conversation_revisions (monotone ordinal tracking)
      create table if not exists conversation_revisions (
        revision_record_id integer primary key autoincrement,
        conversation_id text not null,
        ordinal integer not null,
        observed_at text not null default (datetime('now')),
        trigger_event_id text,
        unique (conversation_id, ordinal),
        foreign key (conversation_id) references conversation_records(conversation_id)
          on delete cascade
      );

      create index if not exists idx_conversation_revisions_lookup
        on conversation_revisions(conversation_id, ordinal);

      -- v2 work_items (terminal schedulable unit)
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
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now')),
        foreign key (context_id) references conversation_records(conversation_id)
          on delete cascade
      );

      create index if not exists idx_work_items_runnable
        on work_items(context_id, status, priority, created_at);
      create index if not exists idx_work_items_scope_status
        on work_items(scope_id, status, updated_at);
      create index if not exists idx_work_items_retry
        on work_items(scope_id, status, next_retry_at);

      -- v2 work_item_leases (crash-safe scheduling)
      create table if not exists work_item_leases (
        lease_id text primary key,
        work_item_id text not null,
        runner_id text not null,
        acquired_at text not null,
        expires_at text not null,
        released_at text,
        release_reason text,
        foreign key (work_item_id) references work_items(work_item_id)
          on delete cascade
      );

      create index if not exists idx_work_item_leases_active
        on work_item_leases(work_item_id, released_at, expires_at);
      create index if not exists idx_work_item_leases_stale
        on work_item_leases(released_at, expires_at);

      -- v2 execution_attempts (bounded invocations)
      create table if not exists execution_attempts (
        execution_id text primary key,
        work_item_id text not null,
        revision_id text not null,
        session_id text,
        status text not null default 'started',
        started_at text not null default (datetime('now')),
        completed_at text,
        runtime_envelope_json text not null,
        outcome_json text,
        error_message text,
        foreign key (work_item_id) references work_items(work_item_id)
          on delete cascade
      );

      create index if not exists idx_execution_attempts_work_item
        on execution_attempts(work_item_id, started_at);
      create index if not exists idx_execution_attempts_session
        on execution_attempts(session_id) where session_id is not null;

      -- v2 evaluations (durable charter output summary)
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
        summary text not null,
        classifications_json text not null default '{}',
        facts_json text not null default '[]',
        escalations_json text not null default '[]',
        proposed_actions_json text not null default '[]',
        tool_requests_json text not null default '[]',
        created_at text not null default (datetime('now')),
        foreign key (execution_id) references execution_attempts(execution_id)
          on delete cascade,
        foreign key (work_item_id) references work_items(work_item_id)
          on delete cascade,
        foreign key (context_id) references conversation_records(conversation_id)
          on delete cascade
      );

      create index if not exists idx_evaluations_context
        on evaluations(context_id, analyzed_at);
      create index if not exists idx_evaluations_work_item
        on evaluations(work_item_id, analyzed_at);

      create table if not exists charter_outputs (
        output_id text primary key,
        context_id text not null,
        scope_id text not null,
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
        foreign key (context_id) references conversation_records(conversation_id)
          on delete cascade
      );

      create index if not exists idx_charter_outputs_context
        on charter_outputs(context_id, scope_id, analyzed_at desc);

      create index if not exists idx_charter_outputs_charter
        on charter_outputs(charter_id, analyzed_at desc);

      create table if not exists foreman_decisions (
        decision_id text primary key,
        context_id text not null,
        scope_id text not null,
        source_charter_ids_json text not null,
        approved_action text not null,
        payload_json text not null,
        rationale text not null,
        decided_at text not null,
        outbound_id text,
        created_by text not null,
        foreign key (context_id) references conversation_records(conversation_id)
          on delete cascade
      );

      create index if not exists idx_foreman_decisions_context
        on foreman_decisions(context_id, scope_id, decided_at desc);

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

      create table if not exists agent_sessions (
        session_id text primary key,
        context_id text not null,
        work_item_id text not null,
        started_at text not null,
        ended_at text,
        updated_at text not null,
        status text not null,
        resume_hint text
      );

      create index if not exists idx_agent_sessions_context
        on agent_sessions(context_id);

      create index if not exists idx_agent_sessions_work_item
        on agent_sessions(work_item_id);

      create table if not exists tool_call_records (
        call_id text primary key,
        execution_id text not null,
        work_item_id text not null,
        context_id text not null,
        tool_id text not null,
        request_args_json text not null default '{}',
        exit_status text not null default 'pending',
        stdout text not null default '',
        stderr text not null default '',
        structured_output_json text,
        started_at text not null,
        completed_at text not null,
        duration_ms integer not null default 0,
        foreign key (execution_id) references execution_attempts(execution_id)
          on delete cascade,
        foreign key (work_item_id) references work_items(work_item_id)
          on delete cascade
      );

      create index if not exists idx_tool_call_records_execution
        on tool_call_records(execution_id, started_at);

      create index if not exists idx_tool_call_records_work_item
        on tool_call_records(work_item_id, started_at);
    `);

    this.migrateThreadRecordsToConversationRecords();
    this.migrateAgentSessionsSchema();
    this.migrateWorkItemsContextJson();
  }

  private migrateAgentSessionsSchema(): void {
    const columns = this.db.prepare(`pragma table_info(agent_sessions)`).all() as Array<{ name: string }>;
    const names = new Set(columns.map((c) => c.name));
    if (!names.has('work_item_id')) {
      this.db.prepare(`alter table agent_sessions add column work_item_id text`).run();
      this.db.prepare(`update agent_sessions set work_item_id = '' where work_item_id is null`).run();
    }
    if (!names.has('updated_at')) {
      this.db.prepare(`alter table agent_sessions add column updated_at text`).run();
      this.db.prepare(`update agent_sessions set updated_at = started_at where updated_at is null`).run();
    }
    if (!names.has('resume_hint')) {
      this.db.prepare(`alter table agent_sessions add column resume_hint text`).run();
    }
  }

  private migrateWorkItemsContextJson(): void {
    const columns = this.db.prepare(`pragma table_info(work_items)`).all() as Array<{ name: string }>;
    const names = new Set(columns.map((c) => c.name));
    if (!names.has('context_json')) {
      this.db.prepare(`alter table work_items add column context_json text`).run();
    }
  }

  private migrateThreadRecordsToConversationRecords(): void {
    this.db.prepare(`
      insert or ignore into conversation_records (
        conversation_id, mailbox_id, primary_charter, secondary_charters_json,
        status, assigned_agent, last_message_at, last_inbound_at, last_outbound_at,
        last_analyzed_at, last_triaged_at, created_at, updated_at
      )
      select
        thread_id as conversation_id, mailbox_id, primary_charter, secondary_charters_json,
        status, assigned_agent, last_message_at, last_inbound_at, last_outbound_at,
        last_analyzed_at, last_triaged_at, created_at, updated_at
      from thread_records
    `).run();
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
      record.conversation_id,
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

  upsertConversationRecord(record: ConversationRecord): void {
    this.db.prepare(`
      insert into conversation_records (
        conversation_id, mailbox_id, primary_charter, secondary_charters_json, status,
        assigned_agent, last_message_at, last_inbound_at, last_outbound_at,
        last_analyzed_at, last_triaged_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(conversation_id) do update set
        mailbox_id = excluded.mailbox_id,
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
      record.conversation_id,
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

  getConversationRecord(conversationId: string): ConversationRecord | undefined {
    const row = this.db.prepare(`
      select * from conversation_records where conversation_id = ?
    `).get(conversationId) as Record<string, unknown> | undefined;
    return row ? rowToConversationRecord(row) : undefined;
  }

  nextRevisionOrdinal(conversationId: string): number {
    const tx = this.db.transaction(() => {
      const current = this.db.prepare(`
        select coalesce(max(ordinal), 0) as max_ordinal from conversation_revisions where conversation_id = ?
      `).get(conversationId) as { max_ordinal: number };
      const next = current.max_ordinal + 1;
      this.db.prepare(`
        insert into conversation_revisions (conversation_id, ordinal, observed_at, trigger_event_id)
        values (?, ?, datetime('now'), null)
      `).run(conversationId, next);
      return next;
    });
    return tx();
  }

  recordRevision(
    conversationId: string,
    ordinal: number,
    triggerEventId: string | null = null,
  ): void {
    this.db.prepare(`
      insert into conversation_revisions (conversation_id, ordinal, observed_at, trigger_event_id)
      values (?, ?, datetime('now'), ?)
    `).run(conversationId, ordinal, triggerEventId);
  }

  getLatestRevisionOrdinal(conversationId: string): number | null {
    const row = this.db.prepare(`
      select ordinal from conversation_revisions
      where conversation_id = ?
      order by ordinal desc
      limit 1
    `).get(conversationId) as { ordinal: number } | undefined;
    return row ? row.ordinal : null;
  }

  insertWorkItem(item: WorkItem): void {
    this.db.prepare(`
      insert into work_items (
        work_item_id, context_id, scope_id, status, priority,
        opened_for_revision_id, resolved_revision_id, resolution_outcome,
        error_message, retry_count, next_retry_at, context_json, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.work_item_id,
      item.context_id,
      item.scope_id,
      item.status,
      item.priority,
      item.opened_for_revision_id,
      item.resolved_revision_id,
      item.resolution_outcome,
      item.error_message,
      item.retry_count,
      item.next_retry_at,
      item.context_json,
      item.created_at,
      item.updated_at,
    );
  }

  updateWorkItemStatus(
    workItemId: string,
    status: WorkItemStatus,
    updates?: Partial<
      Pick<WorkItem, "resolved_revision_id" | "resolution_outcome" | "error_message" | "retry_count" | "next_retry_at" | "updated_at">
    >,
  ): void {
    const fields: string[] = ["status = ?"];
    const params: (string | number | null)[] = [status];

    if (updates?.resolved_revision_id !== undefined) {
      fields.push("resolved_revision_id = ?");
      params.push(updates.resolved_revision_id);
    }
    if (updates?.resolution_outcome !== undefined) {
      fields.push("resolution_outcome = ?");
      params.push(updates.resolution_outcome);
    }
    if (updates?.error_message !== undefined) {
      fields.push("error_message = ?");
      params.push(updates.error_message);
    }
    if (updates?.retry_count !== undefined) {
      fields.push("retry_count = ?");
      params.push(updates.retry_count);
    }
    if (updates?.next_retry_at !== undefined) {
      fields.push("next_retry_at = ?");
      params.push(updates.next_retry_at);
    }
    fields.push("updated_at = ?");
    params.push(updates?.updated_at ?? new Date().toISOString());
    params.push(workItemId);

    this.db.prepare(`
      update work_items set ${fields.join(", ")} where work_item_id = ?
    `).run(...params);
  }

  getWorkItem(workItemId: string): WorkItem | undefined {
    const row = this.db.prepare(`
      select * from work_items where work_item_id = ?
    `).get(workItemId) as Record<string, unknown> | undefined;
    return row ? rowToWorkItem(row) : undefined;
  }

  getActiveWorkItemForContext(contextId: string): WorkItem | undefined {
    const row = this.db.prepare(`
      select * from work_items
      where context_id = ? and status in ('opened', 'leased', 'executing')
      order by created_at desc
      limit 1
    `).get(contextId) as Record<string, unknown> | undefined;
    return row ? rowToWorkItem(row) : undefined;
  }

  getLatestWorkItemForContext(contextId: string): WorkItem | undefined {
    const row = this.db.prepare(`
      select * from work_items
      where context_id = ?
      order by created_at desc
      limit 1
    `).get(contextId) as Record<string, unknown> | undefined;
    return row ? rowToWorkItem(row) : undefined;
  }

  insertLease(lease: WorkItemLease): void {
    this.db.prepare(`
      insert into work_item_leases (
        lease_id, work_item_id, runner_id, acquired_at, expires_at, released_at, release_reason
      ) values (?, ?, ?, ?, ?, ?, ?)
    `).run(
      lease.lease_id,
      lease.work_item_id,
      lease.runner_id,
      lease.acquired_at,
      lease.expires_at,
      lease.released_at,
      lease.release_reason,
    );
  }

  getActiveLeaseForWorkItem(workItemId: string): WorkItemLease | undefined {
    const row = this.db.prepare(`
      select * from work_item_leases
      where work_item_id = ? and released_at is null
      order by acquired_at desc
      limit 1
    `).get(workItemId) as Record<string, unknown> | undefined;
    return row ? rowToWorkItemLease(row) : undefined;
  }

  updateLeaseExpiry(leaseId: string, expiresAt: string): void {
    this.db.prepare(`
      update work_item_leases set expires_at = ? where lease_id = ? and released_at is null
    `).run(expiresAt, leaseId);
  }

  releaseLease(leaseId: string, releasedAt: string, reason: WorkItemLease["release_reason"]): void {
    this.db.prepare(`
      update work_item_leases
      set released_at = ?, release_reason = ?
      where lease_id = ? and released_at is null
    `).run(releasedAt, reason, leaseId);
  }

  recoverStaleLeases(now: string): { leaseId: string; workItemId: string }[] {
    const tx = this.db.transaction(() => {
      const stale = this.db.prepare(`
        select lease_id, work_item_id from work_item_leases
        where released_at is null and expires_at <= ?
      `).all(now) as Array<{ lease_id: string; work_item_id: string }>;

      for (const row of stale) {
        // Release lease
        this.db.prepare(`
          update work_item_leases
          set released_at = ?, release_reason = 'abandoned'
          where lease_id = ? and released_at is null
        `).run(now, row.lease_id);

        // Mark active attempts as abandoned
        this.db.prepare(`
          update execution_attempts
          set status = 'abandoned', completed_at = ?
          where work_item_id = ? and status = 'active'
        `).run(now, row.work_item_id);

        // Transition session to idle (work item will be retried)
        this.db.prepare(`
          update agent_sessions
          set status = 'idle', updated_at = ?
          where work_item_id = ? and status in ('opened', 'active')
        `).run(now, row.work_item_id);

        // Transition work item to failed_retryable with retry_count + 1
        this.db.prepare(`
          update work_items
          set status = 'failed_retryable',
              retry_count = retry_count + 1,
              updated_at = ?
          where work_item_id = ? and status in ('leased', 'executing')
        `).run(now, row.work_item_id);
      }

      return stale.map((r) => ({ leaseId: r.lease_id, workItemId: r.work_item_id }));
    });
    return tx();
  }

  insertExecutionAttempt(attempt: ExecutionAttempt): void {
    this.db.prepare(`
      insert into execution_attempts (
        execution_id, work_item_id, revision_id, session_id, status,
        started_at, completed_at, runtime_envelope_json, outcome_json, error_message
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attempt.execution_id,
      attempt.work_item_id,
      attempt.revision_id,
      attempt.session_id,
      attempt.status,
      attempt.started_at,
      attempt.completed_at,
      attempt.runtime_envelope_json,
      attempt.outcome_json,
      attempt.error_message,
    );
  }

  getExecutionAttempt(executionId: string): ExecutionAttempt | undefined {
    const row = this.db.prepare(`
      select * from execution_attempts where execution_id = ?
    `).get(executionId) as Record<string, unknown> | undefined;
    return row ? rowToExecutionAttempt(row) : undefined;
  }

  getExecutionAttemptsByWorkItem(workItemId: string): ExecutionAttempt[] {
    const rows = this.db.prepare(`
      select * from execution_attempts where work_item_id = ? order by started_at asc
    `).all(workItemId) as Record<string, unknown>[];
    return rows.map(rowToExecutionAttempt);
  }

  updateExecutionAttemptStatus(
    executionId: string,
    status: ExecutionAttemptStatus,
    updates?: Partial<Pick<ExecutionAttempt, "completed_at" | "outcome_json" | "error_message">>,
  ): void {
    const fields: string[] = ["status = ?"];
    const params: (string | null)[] = [status];

    if (updates?.completed_at !== undefined) {
      fields.push("completed_at = ?");
      params.push(updates.completed_at);
    }
    if (updates?.outcome_json !== undefined) {
      fields.push("outcome_json = ?");
      params.push(updates.outcome_json);
    }
    if (updates?.error_message !== undefined) {
      fields.push("error_message = ?");
      params.push(updates.error_message);
    }
    params.push(executionId);

    this.db.prepare(`
      update execution_attempts set ${fields.join(", ")} where execution_id = ?
    `).run(...params);
  }

  insertEvaluation(evaluation: Evaluation): void {
    this.db.prepare(`
      insert into evaluations (
        evaluation_id, execution_id, work_item_id, context_id, scope_id, charter_id, role,
        output_version, analyzed_at, summary, classifications_json, facts_json,
        escalations_json, proposed_actions_json, tool_requests_json, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evaluation.evaluation_id,
      evaluation.execution_id,
      evaluation.work_item_id,
      evaluation.context_id,
      evaluation.scope_id,
      evaluation.charter_id,
      evaluation.role,
      evaluation.output_version,
      evaluation.analyzed_at,
      evaluation.summary,
      evaluation.classifications_json,
      evaluation.facts_json,
      evaluation.escalations_json,
      evaluation.proposed_actions_json,
      evaluation.tool_requests_json,
      evaluation.created_at,
    );
  }

  getEvaluationByExecutionId(executionId: string): Evaluation | undefined {
    const row = this.db.prepare(`
      select * from evaluations where execution_id = ?
    `).get(executionId) as Record<string, unknown> | undefined;
    return row ? rowToEvaluation(row) : undefined;
  }

  getEvaluationsByWorkItem(workItemId: string): Evaluation[] {
    const rows = this.db.prepare(`
      select * from evaluations where work_item_id = ? order by analyzed_at asc
    `).all(workItemId) as Record<string, unknown>[];
    return rows.map(rowToEvaluation);
  }

  insertCharterOutput(output: CharterOutputRow): void {
    this.db.prepare(`
      insert into charter_outputs (
        output_id, context_id, scope_id, charter_id, role, output_version,
        analyzed_at, summary, classifications_json, facts_json, escalations_json,
        proposed_actions_json, tool_requests_json, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      output.output_id,
      output.context_id,
      output.scope_id,
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

  getOutputsByContext(contextId: string, scopeId: string): CharterOutputRow[] {
    const rows = this.db.prepare(`
      select * from charter_outputs
      where context_id = ? and scope_id = ?
      order by analyzed_at desc
    `).all(contextId, scopeId) as Record<string, unknown>[];
    return rows.map(rowToCharterOutput);
  }

  insertDecision(decision: ForemanDecisionRow): void {
    if (!isValidCreatedBy(decision.created_by)) {
      throw new Error(
        `Invalid created_by format: "${decision.created_by}". Expected foreman:{id}/charter:{id}[,{id}...]`,
      );
    }
    this.db.prepare(`
      insert into foreman_decisions (
        decision_id, context_id, scope_id, source_charter_ids_json,
        approved_action, payload_json, rationale, decided_at, outbound_id, created_by
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      decision.decision_id,
      decision.context_id,
      decision.scope_id,
      decision.source_charter_ids_json,
      decision.approved_action,
      decision.payload_json,
      decision.rationale,
      decision.decided_at,
      decision.outbound_id,
      decision.created_by,
    );
  }

  getDecisionsByContext(contextId: string, scopeId: string): ForemanDecisionRow[] {
    const rows = this.db.prepare(`
      select * from foreman_decisions
      where context_id = ? and scope_id = ?
      order by decided_at desc
    `).all(contextId, scopeId) as Record<string, unknown>[];
    return rows.map(rowToForemanDecision);
  }

  getDecisionById(decisionId: string): ForemanDecisionRow | undefined {
    const row = this.db.prepare(`
      select * from foreman_decisions where decision_id = ?
    `).get(decisionId) as Record<string, unknown> | undefined;
    return row ? rowToForemanDecision(row) : undefined;
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

  insertToolCallRecord(record: ToolCallRecord): void {
    this.db.prepare(`
      insert into tool_call_records (
        call_id, execution_id, work_item_id, context_id, tool_id,
        request_args_json, exit_status, stdout, stderr, structured_output_json,
        started_at, completed_at, duration_ms
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.call_id,
      record.execution_id,
      record.work_item_id,
      record.context_id,
      record.tool_id,
      record.request_args_json,
      record.exit_status,
      record.stdout,
      record.stderr,
      record.structured_output_json,
      record.started_at,
      record.completed_at,
      record.duration_ms,
    );
  }

  getToolCallRecordsByExecution(executionId: string): ToolCallRecord[] {
    const rows = this.db.prepare(`
      select * from tool_call_records where execution_id = ? order by started_at asc
    `).all(executionId) as Record<string, unknown>[];
    return rows.map(rowToToolCallRecord);
  }

  getToolCallRecordsByWorkItem(workItemId: string): ToolCallRecord[] {
    const rows = this.db.prepare(`
      select * from tool_call_records where work_item_id = ? order by started_at asc
    `).all(workItemId) as Record<string, unknown>[];
    return rows.map(rowToToolCallRecord);
  }

  updateToolCallRecord(
    callId: string,
    updates: Partial<
      Pick<ToolCallRecord, "exit_status" | "stdout" | "stderr" | "structured_output_json" | "completed_at" | "duration_ms">
    >,
  ): void {
    const fields: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.exit_status !== undefined) {
      fields.push("exit_status = ?");
      params.push(updates.exit_status);
    }
    if (updates.stdout !== undefined) {
      fields.push("stdout = ?");
      params.push(updates.stdout);
    }
    if (updates.stderr !== undefined) {
      fields.push("stderr = ?");
      params.push(updates.stderr);
    }
    if (updates.structured_output_json !== undefined) {
      fields.push("structured_output_json = ?");
      params.push(updates.structured_output_json);
    }
    if (updates.completed_at !== undefined) {
      fields.push("completed_at = ?");
      params.push(updates.completed_at);
    }
    if (updates.duration_ms !== undefined) {
      fields.push("duration_ms = ?");
      params.push(updates.duration_ms);
    }

    if (fields.length === 0) return;
    params.push(callId);

    this.db.prepare(`update tool_call_records set ${fields.join(", ")} where call_id = ?`).run(...params);
  }


  insertAgentSession(session: AgentSession): void {
    this.db.prepare(`
      insert into agent_sessions (
        session_id, context_id, work_item_id, started_at, ended_at, updated_at, status, resume_hint
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.session_id,
      session.context_id,
      session.work_item_id,
      session.started_at,
      session.ended_at,
      session.updated_at,
      session.status,
      session.resume_hint,
    );
  }

  getAgentSession(sessionId: string): AgentSession | undefined {
    const row = this.db.prepare(`select * from agent_sessions where session_id = ?`).get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return rowToAgentSession(row);
  }

  getSessionForWorkItem(workItemId: string): AgentSession | undefined {
    const row = this.db.prepare(`
      select * from agent_sessions where work_item_id = ? order by started_at desc limit 1
    `).get(workItemId) as Record<string, unknown> | undefined;
    return row ? rowToAgentSession(row) : undefined;
  }

  getSessionsForContext(contextId: string): AgentSession[] {
    const rows = this.db.prepare(`
      select * from agent_sessions where context_id = ? order by started_at desc
    `).all(contextId) as Record<string, unknown>[];
    return rows.map(rowToAgentSession);
  }

  getResumableSessions(scopeId?: string): AgentSession[] {
    let sql: string;
    let params: string[];
    if (scopeId) {
      sql = `
        select s.* from agent_sessions s
        join work_items wi on wi.work_item_id = s.work_item_id
        where wi.scope_id = ? and s.status in ('opened', 'idle', 'active')
        order by s.updated_at desc
      `;
      params = [scopeId];
    } else {
      sql = `
        select * from agent_sessions
        where status in ('opened', 'idle', 'active')
        order by updated_at desc
      `;
      params = [];
    }
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToAgentSession);
  }

  updateAgentSessionStatus(sessionId: string, status: AgentSession["status"], endedAt?: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      update agent_sessions set status = ?, ended_at = ?, updated_at = ? where session_id = ?
    `).run(status, endedAt ?? null, now, sessionId);
  }

  updateAgentSessionResumeHint(sessionId: string, hint: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      update agent_sessions set resume_hint = ?, updated_at = ? where session_id = ?
    `).run(hint, now, sessionId);
  }

  close(): void {
    // Intentionally no-op: this store shares a database connection
    // and does not own its lifecycle.
  }
}
