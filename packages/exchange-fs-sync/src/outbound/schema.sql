-- Outbound Draft Worker SQLite Schema
--
-- Canonical persistence for durable outbound commands, versions,
-- managed drafts, and audit transitions.
--
-- Spec: .ai/tasks/20260413-001-outbound-draft-worker-spec.md

-- ---------------------------------------------------------------------------
-- outbound_commands
-- Canonical command envelope. One row per outbound intent.
-- ---------------------------------------------------------------------------
create table if not exists outbound_commands (
  outbound_id text primary key,
  conversation_id text not null,
  mailbox_id text not null,
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

-- Fast lookups for worker eligibility and thread constraints
create index if not exists idx_outbound_commands_status
  on outbound_commands(status);

create index if not exists idx_outbound_commands_thread_action
  on outbound_commands(conversation_id, action_type);

create index if not exists idx_outbound_commands_idempotency
  on outbound_commands(idempotency_key);

create index if not exists idx_outbound_commands_mailbox
  on outbound_commands(mailbox_id);

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
  created_at text not null,
  superseded_at text,
  primary key (outbound_id, version),
  foreign key (outbound_id) references outbound_commands(outbound_id)
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

-- ---------------------------------------------------------------------------
-- outbound_transitions
-- Immutable audit log of every status change.
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
