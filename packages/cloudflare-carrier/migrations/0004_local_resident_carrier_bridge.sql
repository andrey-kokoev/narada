CREATE TABLE IF NOT EXISTS cloudflare_local_resident_carrier_bridge (
  bridge_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  dispatch_decision_id TEXT,
  fallback_evidence_id TEXT,
  local_resident_session_ref TEXT NOT NULL,
  cloudflare_carrier_session_id TEXT NOT NULL,
  bridge_admission_action TEXT NOT NULL,
  bridge_admission_reason TEXT NOT NULL,
  bridge_authority TEXT NOT NULL,
  cloudflare_session_replay_binding_admission TEXT NOT NULL,
  cloudflare_evidence_replay_binding_admission TEXT NOT NULL,
  cloudflare_runtime_session_start_admission TEXT NOT NULL,
  bridge_posture TEXT NOT NULL,
  bridge_json TEXT NOT NULL,
  recorded_by_principal_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cloudflare_local_resident_carrier_bridge_site_recorded
ON cloudflare_local_resident_carrier_bridge(site_id, recorded_at);
