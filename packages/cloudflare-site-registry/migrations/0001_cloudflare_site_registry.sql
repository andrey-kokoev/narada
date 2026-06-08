CREATE TABLE IF NOT EXISTS cloudflare_sites (
  site_id TEXT PRIMARY KEY,
  site_ref TEXT,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_principal_id TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS cloudflare_sites_site_ref_idx
  ON cloudflare_sites(site_ref)
  WHERE site_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS cloudflare_site_memberships (
  site_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (site_id, principal_id)
);

CREATE INDEX IF NOT EXISTS cloudflare_site_memberships_principal_idx
  ON cloudflare_site_memberships(principal_id, status);

CREATE TABLE IF NOT EXISTS cloudflare_site_settings (
  site_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_principal_id TEXT NOT NULL,
  PRIMARY KEY (site_id, setting_key)
);

CREATE TABLE IF NOT EXISTS cloudflare_site_operations (
  operation_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  operation_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by_principal_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cloudflare_site_operations_site_idx
  ON cloudflare_site_operations(site_id, status);

CREATE TABLE IF NOT EXISTS cloudflare_site_carrier_sessions (
  carrier_session_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  operation_id TEXT,
  agent_id TEXT NOT NULL,
  bound_by_principal_id TEXT NOT NULL,
  binding_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cloudflare_site_carrier_sessions_site_idx
  ON cloudflare_site_carrier_sessions(site_id, created_at);

CREATE INDEX IF NOT EXISTS cloudflare_site_carrier_sessions_operation_idx
  ON cloudflare_site_carrier_sessions(operation_id, created_at);

CREATE TABLE IF NOT EXISTS cloudflare_site_authority_events (
  event_id TEXT PRIMARY KEY,
  event_kind TEXT NOT NULL,
  site_id TEXT,
  carrier_session_id TEXT,
  principal_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  evidence_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cloudflare_site_authority_events_site_idx
  ON cloudflare_site_authority_events(site_id, recorded_at);

CREATE TABLE IF NOT EXISTS cloudflare_site_continuity_packets (
  packet_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  relation_id TEXT,
  source_embodiment_kind TEXT NOT NULL,
  target_embodiment_kind TEXT NOT NULL,
  admission_action TEXT NOT NULL,
  admission_reason TEXT NOT NULL,
  packet_json TEXT NOT NULL,
  imported_by_principal_id TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cloudflare_site_continuity_packets_site_idx
  ON cloudflare_site_continuity_packets(site_id, imported_at);
