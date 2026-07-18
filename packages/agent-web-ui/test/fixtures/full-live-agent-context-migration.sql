-- Full-live E2E Site fixture for the agent-context startup contract.
-- The real launcher requires this migration at .ai/db/migrations/001-agent-context-materializations.sql.

CREATE TABLE IF NOT EXISTS agent_start_events (
  event_id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  runtime TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  resume_command TEXT,
  bootstrap_artifact_uri TEXT
);

CREATE TABLE IF NOT EXISTS execution_context_materializations (
  materialization_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  runtime TEXT NOT NULL,
  cwd TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES agent_start_events(event_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS intelligence_context_materializations (
  materialization_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  schema_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES agent_start_events(event_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS proposal_records (
  proposal_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  materialization_id TEXT,
  proposal_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  verdict TEXT NOT NULL DEFAULT 'pending',
  verdict_at TEXT,
  verdict_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES agent_start_events(event_id),
  FOREIGN KEY (materialization_id) REFERENCES intelligence_context_materializations(materialization_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS residual_records (
  residual_id TEXT PRIMARY KEY,
  event_id TEXT,
  materialization_id TEXT,
  label TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'noted',
  promoted_task_id TEXT,
  created_at TEXT NOT NULL,
  status_at TEXT,
  FOREIGN KEY (event_id) REFERENCES agent_start_events(event_id),
  FOREIGN KEY (materialization_id) REFERENCES intelligence_context_materializations(materialization_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS artifact_refs (
  artifact_id TEXT PRIMARY KEY,
  uri TEXT NOT NULL,
  sha256 TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  created_at TEXT NOT NULL
);
