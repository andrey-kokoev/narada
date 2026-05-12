import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  buildTaskAdmissionWriteRequest,
  buildTaskDbAdapterConformanceContract,
  buildTaskDbAdapterExecutionRequest,
  buildTaskDbInitPlan,
  initializeSiteTaskLifecycle,
  runNeutralTaskDbAdapterConformance,
  type TaskAdmissionWriteOperation,
  type TaskCandidate,
  type TaskDbSchemaStatement,
} from '../../../packages/site-task-lifecycle/src/index.ts';

const siteRoot = resolve('D:/code/narada');
const taskDbPath = join(siteRoot, '.ai', 'task-lifecycle.db');
const adapterId = 'narada-proper.adapter.task-0003.sqlite3-cli.v0';
const recordedAt = '2026-05-10T14:20:00.000-05:00';
const admittedBy = { identityId: 'narada-proper.architect', role: 'architect' };

const candidate: TaskCandidate = {
  schema: 'narada.site_task_lifecycle.task_candidate.v0',
  taskId: 'narada-proper.task-0003',
  title: 'Execute admitted task-0001 live task-lifecycle setup increment',
  sourceSite: 'narada-proper',
  sourceRef: 'OSM:osm_20260510_141620_083_98aa2fc4',
  receivedAt: recordedAt,
  summary: 'Local live execution increment for initializer, concrete adapter, DB mutation, and MCP smoke evidence.',
  status: 'pending_admission',
  evidenceRefs: [
    'OSM:osm_20260510_141620_083_98aa2fc4',
    '.narada/tasks/task-0003-live-task-lifecycle-setup-execution.md',
    '.narada/admission/decisions/task-0003-live-setup-execution-admission.md',
  ],
  requestedBy: 'narada-proper.architect',
  rejectedSourceFindings: [],
};

const initResult = await initializeSiteTaskLifecycle({
  siteRoot,
  siteId: 'narada-proper',
  initializedBy: 'narada-proper.architect',
  roster: [
    admittedBy,
    { identityId: 'narada-proper.builder', role: 'builder' },
    { identityId: 'narada-proper.reviewer', role: 'reviewer' },
  ],
  sourceImportRefs: [],
  now: recordedAt,
});

const initPlan = buildTaskDbInitPlan(taskDbPath);
const adapterExecutionRequest = buildTaskDbAdapterExecutionRequest(taskDbPath);
const writeRequest = buildTaskAdmissionWriteRequest({
  taskDbPath,
  candidate,
  admittedBy,
  admittedAt: recordedAt,
});
const conformanceContract = buildTaskDbAdapterConformanceContract({
  adapterId,
  admittedBy,
  admittedAt: recordedAt,
});
const conformanceResult = await runNeutralTaskDbAdapterConformance(
  {
    adapterId,
    async executeSchemaStatement(): Promise<void> {},
    async executeAdmissionWriteOperation(): Promise<void> {},
  },
  conformanceContract,
  writeRequest,
  recordedAt,
);

await mkdir(dirname(taskDbPath), { recursive: true });
for (const statement of initPlan.statements) {
  sqlite(statement.sql);
}
for (const operation of writeRequest.operations) {
  executeAdmissionWriteOperation(operation);
}

const readback = {
  tables: sqliteQuery("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"),
  taskRecords: sqliteQuery('SELECT task_id, status, source_site, source_ref FROM task_records ORDER BY task_id;'),
  evidenceRefs: sqliteQuery('SELECT task_id, evidence_ref, evidence_kind FROM task_evidence_refs ORDER BY task_id, evidence_ref;'),
  admissionEvents: sqliteQuery('SELECT event_id, task_id, event_type FROM task_admission_events ORDER BY event_id;'),
};

const mcpCapabilityPath = join(siteRoot, '.ai', 'mcp', 'site-task-lifecycle-mcp.json');
await mkdir(dirname(mcpCapabilityPath), { recursive: true });
await writeFile(mcpCapabilityPath, `${JSON.stringify({
  schema: 'narada.site_task_lifecycle.mcp_registration_evidence.v0',
  surface_id: 'narada-proper.surface.task-0001.live-task-lifecycle-mcp-registration.v0',
  status: 'registered_file_backed_capability_evidence',
  site_id: 'narada-proper',
  site_root: siteRoot,
  package: '@narada2/site-task-lifecycle',
  transport_command: 'node_modules/.bin/narada-mcp.cmd --site-root D:\\\\code\\\\narada --site-id narada-proper',
  tools_expected: [
    'site_task_lifecycle.plan_init',
    'site_task_lifecycle.build_admission_contract',
    'site_task_lifecycle.project_inbox_envelope',
    'site_task_lifecycle.build_task_db_init_plan',
    'site_task_lifecycle.build_task_admission_write_request',
    'site_task_lifecycle.build_mcp_runtime_binding_request',
    'site_task_lifecycle.build_receiving_site_setup_plan',
    'site_task_lifecycle.build_live_execution_admission_checklist',
  ],
  adapter_id: adapterId,
  task_db_path: taskDbPath,
  live_transport_smoke_required: true,
  source_state_imported: false,
  recorded_at: recordedAt,
}, null, 2)}\n`, 'utf8');

const resultPath = join(siteRoot, '.narada', 'execution', 'task-0003', 'result.json');
await writeFile(resultPath, `${JSON.stringify({
  schema: 'narada.task_0003.live_setup_result.v0',
  status: 'partial_live_execution_completed',
  siteRoot,
  initResult,
  adapterId,
  adapterExecutionRequest,
  initPlan,
  conformanceContract,
  conformanceResult,
  writeRequest,
  readback,
  mcpCapabilityPath,
  packageOwnsSqliteDependency: false,
  packageExecutedSqliteMutation: false,
  sourceStateImported: false,
  recordedAt,
}, null, 2)}\n`, 'utf8');

function executeAdmissionWriteOperation(operation: TaskAdmissionWriteOperation): void {
  if (operation.kind === 'insert_task_record') {
    sqlite([
      'INSERT OR IGNORE INTO task_records (task_id, title, source_site, source_ref, status, received_at, summary, created_at)',
      'VALUES ($task_id, $title, $source_site, $source_ref, $status, $received_at, $summary, $created_at);',
    ].join(' '), operation.parameters);
    return;
  }
  if (operation.kind === 'insert_evidence_ref') {
    sqlite([
      'INSERT OR IGNORE INTO task_evidence_refs (task_id, evidence_ref, evidence_kind)',
      'VALUES ($task_id, $evidence_ref, $evidence_kind);',
    ].join(' '), operation.parameters);
    return;
  }
  if (operation.kind === 'record_admission_event') {
    sqlite([
      'INSERT OR IGNORE INTO task_admission_events (event_id, task_id, event_type, recorded_at, payload_json)',
      'VALUES ($event_id, $task_id, $event_type, $recorded_at, $payload_json);',
    ].join(' '), operation.parameters);
  }
}

function sqlite(sql: string, params: Record<string, string> = {}): void {
  execFileSync('sqlite3.exe', [taskDbPath, bindParams(sql, params)], { stdio: 'pipe' });
}

function sqliteQuery(sql: string): string[] {
  const output = execFileSync('sqlite3.exe', ['-json', taskDbPath, sql], { encoding: 'utf8' });
  return output.trim().length > 0 ? JSON.parse(output) as string[] : [];
}

function bindParams(sql: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (statement, [key, value]) => statement.replaceAll(`$${key}`, sqlLiteral(value)),
    sql,
  );
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
