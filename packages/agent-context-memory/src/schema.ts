import { findDeniedSourceImports } from './import-refusal.js';
import type { SchemaInitPlan, SchemaStatementDescriptor } from './types.js';

export const AGENT_CONTEXT_SCHEMA_STATEMENTS: SchemaStatementDescriptor[] = [
  {
    id: 'named_agents',
    mutating: false,
    sql: `CREATE TABLE IF NOT EXISTS named_agents (
  named_agent_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  allowed_role_names_json TEXT NOT NULL,
  verification_basis_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);`,
  },
  {
    id: 'agent_sessions',
    mutating: false,
    sql: `CREATE TABLE IF NOT EXISTS agent_sessions (
  session_id TEXT PRIMARY KEY,
  named_agent_id TEXT NOT NULL,
  role_name TEXT,
  claimed_identity TEXT,
  claimed_identity_is_authority INTEGER NOT NULL DEFAULT 0,
  verification_basis_json TEXT NOT NULL,
  started_at TEXT NOT NULL
);`,
  },
  {
    id: 'agent_checkpoints',
    mutating: false,
    sql: `CREATE TABLE IF NOT EXISTS agent_checkpoints (
  checkpoint_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  named_agent_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  captured_at TEXT NOT NULL
);`,
  },
  {
    id: 'hydration_events',
    mutating: false,
    sql: `CREATE TABLE IF NOT EXISTS hydration_events (
  hydration_id TEXT PRIMARY KEY,
  named_agent_id TEXT NOT NULL,
  checkpoint_refs_json TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  executed_by_package INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL
);`,
  },
];

export function buildAgentContextSchemaInitPlan(sourceImportRefs: string[] = []): SchemaInitPlan {
  return {
    schema: 'narada.agent_context_memory.schema_init_plan.v0',
    storage: 'sqlite_descriptor_only',
    packageOwnsSqliteDependency: false,
    packageExecutesSqliteMutation: false,
    statements: AGENT_CONTEXT_SCHEMA_STATEMENTS,
    sourceImportFindings: findDeniedSourceImports(sourceImportRefs),
  };
}
