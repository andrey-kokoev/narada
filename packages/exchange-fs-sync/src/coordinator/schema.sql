-- Coordinator SQLite Schema
--
-- Durable state for foreman, charter outputs, thread records, and policy overrides.
-- Designed to coexist in the same database as outbound_handoffs and agent_traces.
--
-- Spec: .ai/tasks/20260413-012-coordinator-state-and-foreman-handoff.md

-- ---------------------------------------------------------------------------
-- thread_records
-- Canonical thread state as seen by the coordinator.
-- thread_id is exactly NormalizedMessage.conversation_id.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- charter_outputs
-- Persisted output from charter analysis of a thread.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- foreman_decisions
-- Record of every foreman decision, linked to the outbound command it produced.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- policy_overrides
-- Explicit human/supervisor override for blocked_policy commands.
-- ---------------------------------------------------------------------------
create table if not exists policy_overrides (
  override_id text primary key,
  outbound_id text not null,
  overridden_by text not null,
  reason text not null,
  created_at text not null,
  foreign key (outbound_id) references outbound_handoffs(outbound_id)
);

create index if not exists idx_policy_overrides_outbound
  on policy_overrides(outbound_id);
