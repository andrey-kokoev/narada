CREATE TABLE IF NOT EXISTS cloudflare_resident_dispatch_windows_fallback_requests (
  fallback_request_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  operation_id TEXT,
  dispatch_decision_id TEXT NOT NULL,
  carrier_session_id TEXT,
  requested_action_ref TEXT NOT NULL,
  requested_action_summary TEXT NOT NULL,
  governed_request_contract_ref TEXT NOT NULL,
  evidence_return_contract_ref TEXT NOT NULL,
  rollback_plan_ref TEXT NOT NULL,
  authority_locus TEXT NOT NULL,
  windows_fallback_ref TEXT NOT NULL,
  local_executor_authority TEXT NOT NULL,
  local_execution_admission TEXT NOT NULL,
  direct_cloudflare_session_start_admission TEXT NOT NULL,
  request_posture TEXT NOT NULL,
  request_json TEXT NOT NULL,
  recorded_by_principal_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cloudflare_resident_dispatch_windows_fallback_requests_site_recorded
  ON cloudflare_resident_dispatch_windows_fallback_requests(site_id, recorded_at);
