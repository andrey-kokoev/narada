/**
 * Versioned relational schema for the intelligence registry. Portable
 * across node:sqlite and Cloudflare D1 (both SQLite dialects): positional
 * params only, no RETURNING, no engine-specific features.
 */

export const REGISTRY_SCHEMA_VERSION = 5;

export const MIGRATION_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS resources (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     schema TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS resource_relations (
     from_id TEXT NOT NULL,
     relation TEXT NOT NULL,
     to_id TEXT NOT NULL,
     PRIMARY KEY (from_id, relation, to_id)
   )`,
  `CREATE TABLE IF NOT EXISTS assertions (
     id TEXT PRIMARY KEY,
     subject_id TEXT NOT NULL,
     family TEXT NOT NULL,
     name TEXT NOT NULL,
     locus TEXT NOT NULL,
     site_id TEXT,
     confidence REAL NOT NULL,
     superseded_by TEXT,
     doc TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS assertions_subject ON assertions(subject_id)`,
  `CREATE INDEX IF NOT EXISTS assertions_capability ON assertions(family, name)`,
  `CREATE TABLE IF NOT EXISTS policies (
     id TEXT PRIMARY KEY,
     locus TEXT NOT NULL,
     site_id TEXT NOT NULL,
     kind TEXT NOT NULL,
     revision INTEGER NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS policy_bindings (
     policy_id TEXT NOT NULL,
     subject_id TEXT NOT NULL,
     PRIMARY KEY (policy_id, subject_id)
   )`,
  `CREATE TABLE IF NOT EXISTS invocation_intents (
     id TEXT PRIMARY KEY,
     purpose TEXT NOT NULL,
     created_at TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS invocation_plans (
     id TEXT PRIMARY KEY,
     intent_id TEXT NOT NULL,
     resolver_version TEXT NOT NULL,
     created_at TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS invocation_plans_intent ON invocation_plans(intent_id)`,
  `CREATE TABLE IF NOT EXISTS invocation_refusals (
     id TEXT PRIMARY KEY,
     intent_id TEXT NOT NULL,
     reason_code TEXT NOT NULL,
     created_at TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS plan_decision_snapshots (
     plan_id TEXT PRIMARY KEY,
     intent_id TEXT NOT NULL,
     resolved_at TEXT NOT NULL,
     valid_until TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS plan_decision_snapshots_intent ON plan_decision_snapshots(intent_id)`,
  `CREATE TABLE IF NOT EXISTS plan_revalidation_evidence (
     id TEXT PRIMARY KEY,
     plan_id TEXT NOT NULL,
     intent_id TEXT NOT NULL,
     evaluated_at TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS plan_revalidation_plan ON plan_revalidation_evidence(plan_id, evaluated_at, id)`,
  `CREATE TABLE IF NOT EXISTS invocation_execution_attempts (
     id TEXT PRIMARY KEY,
     intent_id TEXT NOT NULL,
     plan_id TEXT NOT NULL,
     state TEXT NOT NULL,
     created_at TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS invocation_execution_attempts_plan ON invocation_execution_attempts(plan_id, created_at, id)`,
  `CREATE TABLE IF NOT EXISTS invocation_execution_transitions (
     id TEXT PRIMARY KEY,
     attempt_id TEXT NOT NULL,
     sequence INTEGER NOT NULL,
     previous_state TEXT NOT NULL,
     state TEXT NOT NULL,
     transitioned_at TEXT NOT NULL,
     doc TEXT NOT NULL,
     UNIQUE (attempt_id, sequence)
   )`,
  `CREATE INDEX IF NOT EXISTS invocation_execution_transitions_attempt ON invocation_execution_transitions(attempt_id, sequence, id)`,
  `CREATE TABLE IF NOT EXISTS invocation_result_envelopes (
     id TEXT PRIMARY KEY,
     attempt_id TEXT NOT NULL,
     plan_id TEXT NOT NULL,
     produced_at TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS invocation_result_envelopes_attempt ON invocation_result_envelopes(attempt_id, id)`,
  `CREATE TABLE IF NOT EXISTS invocation_terminal_outcomes (
     id TEXT PRIMARY KEY,
     intent_id TEXT NOT NULL,
     attempt_id TEXT,
     plan_id TEXT,
     kind TEXT NOT NULL,
     terminal_at TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS invocation_terminal_outcomes_intent ON invocation_terminal_outcomes(intent_id, terminal_at, id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS invocation_terminal_outcomes_attempt ON invocation_terminal_outcomes(attempt_id) WHERE attempt_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS invocation_observations_v2 (
     id TEXT PRIMARY KEY,
     subject_id TEXT NOT NULL,
     kind TEXT NOT NULL,
     observed_at TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS invocation_observations_subject ON invocation_observations_v2(subject_id, observed_at, id)`,
  `CREATE TABLE IF NOT EXISTS invocation_audit_evidence_v2 (
     id TEXT PRIMARY KEY,
     admitted_at TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS invocation_telemetry_v2 (
     id TEXT PRIMARY KEY,
     attempt_id TEXT NOT NULL,
     recorded_at TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS invocation_telemetry_attempt ON invocation_telemetry_v2(attempt_id, recorded_at, id)`,
  `CREATE TABLE IF NOT EXISTS catalog_records (
     id TEXT PRIMARY KEY,
     record_kind TEXT NOT NULL,
     record_id TEXT NOT NULL,
     revision INTEGER NOT NULL,
     source_ref TEXT NOT NULL,
     source_revision TEXT NOT NULL,
     authority_kind TEXT NOT NULL,
     authority_locus TEXT NOT NULL,
     doc TEXT NOT NULL,
     UNIQUE (record_id, revision)
   )`,
  `CREATE INDEX IF NOT EXISTS catalog_records_kind ON catalog_records(record_kind, record_id)`,
  `CREATE INDEX IF NOT EXISTS catalog_records_authority ON catalog_records(authority_locus, authority_kind)`,
  `CREATE TABLE IF NOT EXISTS catalog_residuals (
     id TEXT PRIMARY KEY,
     code TEXT NOT NULL,
     disposition TEXT NOT NULL,
     source_path TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS schema_migrations (
     version INTEGER PRIMARY KEY,
     applied_at TEXT NOT NULL
   )`,
  `DROP TABLE IF EXISTS invocation_evidence`,
  `DROP TABLE IF EXISTS invocation_attempts`,
];
