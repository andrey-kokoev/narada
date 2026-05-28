create table if not exists site_registry_outbound_communications (
  communication_id text primary key,
  source_ref text not null,
  idempotency_key text not null,
  target_site_id text not null,
  delivery_status text not null,
  admission_status text not null,
  created_at text not null,
  updated_at text not null,
  envelope_json text not null,
  delivery_receipt_json text not null,
  admission_receipt_json text not null,
  unique (source_ref, idempotency_key)
);

create index if not exists idx_site_registry_outbound_communications_target
  on site_registry_outbound_communications (target_site_id, created_at);

create index if not exists idx_site_registry_outbound_communications_delivery
  on site_registry_outbound_communications (delivery_status, admission_status, created_at);

create table if not exists site_registry_outbound_delivery_attempts (
  attempt_id text primary key,
  communication_id text not null,
  status text not null,
  attempted_at text not null,
  delivery_endpoint_json text not null,
  receipt_json text not null
);

create index if not exists idx_site_registry_outbound_delivery_attempts_message
  on site_registry_outbound_delivery_attempts (communication_id, attempted_at);
