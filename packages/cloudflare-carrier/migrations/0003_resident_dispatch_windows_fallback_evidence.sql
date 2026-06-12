CREATE TABLE IF NOT EXISTS cloudflare_resident_dispatch_windows_fallback_evidence (
  fallback_evidence_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  fallback_request_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  dispatch_decision_id TEXT NOT NULL,
  local_execution_id TEXT NOT NULL,
  windows_admission_action TEXT NOT NULL,
  windows_admission_reason TEXT NOT NULL,
  local_execution_status TEXT NOT NULL,
  local_executor_authority TEXT NOT NULL,
  local_session_start_admission TEXT NOT NULL,
  local_resident_session_ref TEXT NOT NULL,
  rollback_evidence_ref TEXT,
  direct_cloudflare_session_start_admission TEXT NOT NULL,
  evidence_posture TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  recorded_by_principal_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cloudflare_resident_dispatch_windows_fallback_evidence_site_recorded
ON cloudflare_resident_dispatch_windows_fallback_evidence(site_id, recorded_at);
