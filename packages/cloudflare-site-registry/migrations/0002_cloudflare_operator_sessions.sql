CREATE TABLE IF NOT EXISTS cloudflare_operator_sessions (
  operator_session_id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  auth_type TEXT NOT NULL,
  issuer TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  subject TEXT,
  object_id TEXT NOT NULL,
  email TEXT,
  display_name TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS cloudflare_operator_sessions_principal_idx
  ON cloudflare_operator_sessions(principal_id, expires_at);
