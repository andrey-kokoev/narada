-- Outbound Draft Worker SQLite Schema
--
-- Canonical persistence for durable outbound handoffs, versions,
-- managed drafts, and audit transitions.
--
-- Spec: .ai/tasks/20260413-001-outbound-draft-worker-spec.md

-- ---------------------------------------------------------------------------
-- outbound_handoffs
-- Canonical command envelope. One row per outbound intent.
-- ---------------------------------------------------------------------------
create table if not exists outbound_handoffs (
  outbound_id text primary key,
  context_id text not null,
  scope_id text not null,
  action_type text not null,
  status text not null,
  latest_version integer not null default 1,
  created_at text not null,
  created_by text not null,
  submitted_at text,
  confirmed_at text,
  blocked_reason text,
  terminal_reason text,
  idempotency_key text not null unique
);

-- Fast lookups for worker eligibility and context constraints
create index if not exists idx_outbound_handoffs_status
  on outbound_handoffs(status);

create index if not exists idx_outbound_handoffs_context_action
  on outbound_handoffs(context_id, action_type);

create index if not exists idx_outbound_handoffs_idempotency
  on outbound_handoffs(idempotency_key);

create index if not exists idx_outbound_handoffs_scope
  on outbound_handoffs(scope_id);

-- Mailbox compatibility view
create view if not exists outbound_commands as
select
  outbound_id,
  context_id as conversation_id,
  scope_id as mailbox_id,
  action_type,
  status,
  latest_version,
  created_at,
  created_by,
  submitted_at,
  confirmed_at,
  blocked_reason,
  terminal_reason,
  idempotency_key
from outbound_handoffs;

-- ---------------------------------------------------------------------------
-- outbound_versions
-- Versioned payload for each command. One row per version.
-- ---------------------------------------------------------------------------
create table if not exists outbound_versions (
  outbound_id text not null,
  version integer not null,
  reply_to_message_id text,
  to_json text not null default '[]',
  cc_json text not null default '[]',
  bcc_json text not null default '[]',
  subject text not null default '',
  body_text text not null default '',
  body_html text not null default '',
  idempotency_key text not null,
  policy_snapshot_json text not null default '{}',
  payload_json text not null default '{}',
  created_at text not null,
  superseded_at text,
  primary key (outbound_id, version),
  foreign key (outbound_id) references outbound_handoffs(outbound_id)
    on delete cascade
);

create index if not exists idx_outbound_versions_outbound_id
  on outbound_versions(outbound_id);

-- ---------------------------------------------------------------------------
-- managed_drafts
-- Binding between a local version and its Graph draft artifact.
-- ---------------------------------------------------------------------------
create table if not exists managed_drafts (
  outbound_id text not null,
  version integer not null,
  draft_id text not null,
  etag text,
  internet_message_id text,
  header_outbound_id_present integer not null default 0,
  body_hash text not null,
  recipients_hash text not null,
  subject_hash text not null,
  created_at text not null,
  last_verified_at text,
  invalidated_reason text,
  primary key (outbound_id, version),
  foreign key (outbound_id, version) references outbound_versions(outbound_id, version)
    on delete cascade
);

create index if not exists idx_managed_drafts_outbound_id
  on managed_drafts(outbound_id);

-- ---------------------------------------------------------------------------
-- outbound_transitions
-- Audit log of status transitions.
-- ---------------------------------------------------------------------------
create table if not exists outbound_transitions (
  id integer primary key autoincrement,
  outbound_id text not null,
  version integer,
  from_status text,
  to_status text not null,
  reason text,
  transition_at text not null
);

create index if not exists idx_outbound_transitions_outbound_id
  on outbound_transitions(outbound_id);

create index if not exists idx_outbound_transitions_transition_at
  on outbound_transitions(transition_at);
