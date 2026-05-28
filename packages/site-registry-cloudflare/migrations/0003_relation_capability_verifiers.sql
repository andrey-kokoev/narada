create table if not exists site_registry_relation_capability_verifiers (
  verifier_id text primary key,
  relation_id text not null,
  registry_id text not null,
  site_id text not null,
  subject_site_id text not null,
  relation_kind text not null,
  owner_site_id text not null,
  capability_ref text not null,
  capability_family text not null,
  algorithm text not null,
  salt text not null,
  verifier_hash text not null,
  status text not null,
  created_at text not null,
  rotated_at text,
  revoked_at text,
  evidence_refs_json text not null,
  verifier_json text not null,
  recorded_at text not null default current_timestamp,
  unique (relation_id, site_id, capability_family)
);

create index if not exists idx_site_registry_relation_verifiers_scope
  on site_registry_relation_capability_verifiers (relation_id, site_id, capability_family, status);

create index if not exists idx_site_registry_relation_verifiers_owner
  on site_registry_relation_capability_verifiers (owner_site_id, status);
