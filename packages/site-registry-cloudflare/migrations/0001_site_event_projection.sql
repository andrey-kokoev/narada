create table if not exists site_registry_event_audit (
  event_id text not null,
  idempotency_key text not null,
  source_site_id text not null,
  subject_site_id text not null,
  family text not null,
  status text not null,
  refusal_reasons text not null,
  observed_at text not null,
  recorded_at text not null default current_timestamp
);

create index if not exists idx_site_registry_event_audit_idempotency
  on site_registry_event_audit (idempotency_key);

create index if not exists idx_site_registry_event_audit_subject
  on site_registry_event_audit (subject_site_id, observed_at);

create table if not exists site_registry_remote_messages (
  message_id text primary key,
  source_ref text not null,
  idempotency_key text not null,
  target_site_id text not null,
  status text not null,
  retry_count integer not null default 0,
  received_at text not null,
  message_json text not null,
  receipt_json text not null,
  updated_at text not null default current_timestamp,
  unique (source_ref, idempotency_key)
);

create index if not exists idx_site_registry_remote_messages_status
  on site_registry_remote_messages (status, received_at);

create table if not exists site_registry_remote_message_events (
  event_id integer primary key autoincrement,
  message_id text not null,
  event_type text not null,
  refusal_reasons text not null,
  recorded_at text not null default current_timestamp
);

create index if not exists idx_site_registry_remote_message_events_message
  on site_registry_remote_message_events (message_id, recorded_at);
