-- Full-live E2E Site fixture for the Codex admission startup contract.

CREATE TABLE IF NOT EXISTS codex_session_admissions (
  admission_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  runtime TEXT NOT NULL DEFAULT 'codex',
  cwd TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('creating', 'admitted', 'suspect', 'retired')),
  agent_start_event_id TEXT,
  codex_session_id TEXT,
  codex_session_file TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  verified_at TEXT
);
