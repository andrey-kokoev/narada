/**
 * Versioned relational schema for the intelligence registry. Portable
 * across node:sqlite and Cloudflare D1 (both SQLite dialects): positional
 * params only, no RETURNING, no engine-specific features.
 */

export const REGISTRY_SCHEMA_VERSION = 1;

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
  `CREATE TABLE IF NOT EXISTS invocation_attempts (
     id TEXT PRIMARY KEY,
     plan_id TEXT NOT NULL,
     state TEXT NOT NULL,
     started_at TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS invocation_attempts_plan ON invocation_attempts(plan_id)`,
  `CREATE TABLE IF NOT EXISTS invocation_evidence (
     id TEXT PRIMARY KEY,
     attempt_id TEXT NOT NULL,
     recorded_at TEXT NOT NULL,
     doc TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS invocation_evidence_attempt ON invocation_evidence(attempt_id)`,
  `CREATE TABLE IF NOT EXISTS schema_migrations (
     version INTEGER PRIMARY KEY,
     applied_at TEXT NOT NULL
   )`,
];
