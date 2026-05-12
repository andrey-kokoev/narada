import { findDeniedSourceImports } from './import-refusal.js';
import type { TaskDbInitPlan, TaskDbSchemaStatement } from './types.js';

export const TASK_DB_SCHEMA_STATEMENTS: TaskDbSchemaStatement[] = [
  {
    name: 'task_records',
    sql: [
      'CREATE TABLE IF NOT EXISTS task_records (',
      '  task_id TEXT PRIMARY KEY,',
      '  title TEXT NOT NULL,',
      '  source_site TEXT NOT NULL,',
      '  source_ref TEXT NOT NULL,',
      '  status TEXT NOT NULL,',
      '  received_at TEXT NOT NULL,',
      '  summary TEXT NOT NULL,',
      '  created_at TEXT NOT NULL',
      ');',
    ].join('\n'),
  },
  {
    name: 'task_evidence_refs',
    sql: [
      'CREATE TABLE IF NOT EXISTS task_evidence_refs (',
      '  task_id TEXT NOT NULL,',
      '  evidence_ref TEXT NOT NULL,',
      '  evidence_kind TEXT NOT NULL,',
      '  PRIMARY KEY (task_id, evidence_ref),',
      '  FOREIGN KEY (task_id) REFERENCES task_records(task_id)',
      ');',
    ].join('\n'),
  },
  {
    name: 'task_admission_events',
    sql: [
      'CREATE TABLE IF NOT EXISTS task_admission_events (',
      '  event_id TEXT PRIMARY KEY,',
      '  task_id TEXT NOT NULL,',
      '  event_type TEXT NOT NULL,',
      '  recorded_at TEXT NOT NULL,',
      '  payload_json TEXT NOT NULL,',
      '  FOREIGN KEY (task_id) REFERENCES task_records(task_id)',
      ');',
    ].join('\n'),
  },
];

export function buildTaskDbInitPlan(taskDbPath: string, sourceImportRefs: string[] = []): TaskDbInitPlan {
  return {
    schema: 'narada.site_task_lifecycle.task_db_init_plan.v0',
    taskDbPath,
    statements: TASK_DB_SCHEMA_STATEMENTS,
    deniedSourceImports: [
      'source task lifecycle databases',
      'source task history',
      'source inbox databases and envelopes',
      'source rosters',
      'source checkpoints and agent-context databases',
      'source operator-surface bindings',
      'PC-locus runtime state',
      'secrets and credentials',
    ],
    sourceImportFindings: findDeniedSourceImports(sourceImportRefs),
  };
}
