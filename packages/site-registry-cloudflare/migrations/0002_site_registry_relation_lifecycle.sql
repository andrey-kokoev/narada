create table if not exists site_registry_relations (
  relation_id text primary key,
  registry_id text not null,
  site_id text not null,
  subject_site_id text not null,
  relation_kind text not null,
  state text not null,
  visibility text not null,
  created_at text not null,
  updated_at text not null,
  retired_at text,
  withdrawn_at text,
  suppressed_at text,
  evidence_event_id text,
  relation_json text not null,
  unique (registry_id, site_id, relation_kind)
);

create index if not exists idx_site_registry_relations_public
  on site_registry_relations (state, visibility, updated_at);

create index if not exists idx_site_registry_relations_site
  on site_registry_relations (site_id, relation_kind);

create table if not exists site_registry_relation_events (
  event_id text primary key,
  relation_id text not null,
  registry_id text not null,
  site_id text not null,
  relation_kind text not null,
  transition text not null,
  from_state text,
  to_state text not null,
  from_visibility text,
  to_visibility text not null,
  actor_site_id text,
  actor_kind text not null,
  capability_ref text not null,
  idempotency_key text not null,
  occurred_at text not null,
  event_json text not null,
  recorded_at text not null default current_timestamp,
  unique (relation_id, idempotency_key)
);

create index if not exists idx_site_registry_relation_events_relation
  on site_registry_relation_events (relation_id, occurred_at);

create index if not exists idx_site_registry_relation_events_site
  on site_registry_relation_events (site_id, occurred_at);
