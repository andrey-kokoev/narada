import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { openTaskLifecycleStore, type SqliteTaskLifecycleStore } from '../lib/task-lifecycle-store.js';

export interface TaskLifecycleSnapshotOptions {
  cwd?: string;
  output?: string;
  input?: string;
  format?: CliFormat;
  store?: SqliteTaskLifecycleStore;
}

export interface TaskLifecycleInspectSnapshotOptions {
  cwd?: string;
  input?: string;
  raw?: boolean;
  format?: CliFormat;
}

interface SnapshotTable {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

interface TaskLifecycleSnapshot {
  snapshot_kind: 'task_lifecycle_snapshot';
  snapshot_version: 1;
  exported_at: string;
  tables: SnapshotTable[];
}

interface SnapshotFinding {
  finding_id: string;
  severity: 'info' | 'warning' | 'error';
  summary: string;
  facts: Record<string, unknown>;
  suggested_repair: string | null;
}

const EXCLUDED_TABLES = new Set(['sqlite_sequence']);

export async function taskLifecycleExportCommand(options: TaskLifecycleSnapshotOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const output = resolve(cwd, options.output ?? join('.ai', 'task-lifecycle-snapshot.json'));
  const store = options.store ?? openTaskLifecycleStore(cwd);
  try {
    const snapshot = buildSnapshot(store);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(
        {
          status: 'success',
          output,
          table_count: snapshot.tables.length,
          row_count: snapshot.tables.reduce((sum, table) => sum + table.rows.length, 0),
        },
        [
          `Task lifecycle snapshot exported: ${output}`,
          `Tables: ${snapshot.tables.length}`,
          `Rows: ${snapshot.tables.reduce((sum, table) => sum + table.rows.length, 0)}`,
        ],
        options.format ?? 'auto',
      ),
    };
  } finally {
    if (!options.store) store.db.close();
  }
}

export async function taskLifecycleImportCommand(options: TaskLifecycleSnapshotOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const input = resolve(cwd, options.input ?? join('.ai', 'task-lifecycle-snapshot.json'));
  await mkdir(join(cwd, '.ai'), { recursive: true });
  const store = options.store ?? openTaskLifecycleStore(cwd);
  try {
    const raw = await readFile(input, 'utf8');
    const snapshot = JSON.parse(raw) as TaskLifecycleSnapshot;
    validateSnapshot(snapshot);
    store.initSchema();
    applySnapshot(store, snapshot);
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(
        {
          status: 'success',
          input,
          table_count: snapshot.tables.length,
          row_count: snapshot.tables.reduce((sum, table) => sum + table.rows.length, 0),
        },
        [
          `Task lifecycle snapshot imported: ${input}`,
          `Tables: ${snapshot.tables.length}`,
          `Rows: ${snapshot.tables.reduce((sum, table) => sum + table.rows.length, 0)}`,
        ],
        options.format ?? 'auto',
      ),
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: error instanceof Error ? error.message : String(error) },
    };
  } finally {
    if (!options.store) store.db.close();
  }
}

export async function taskLifecycleInspectSnapshotCommand(
  options: TaskLifecycleInspectSnapshotOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const input = resolve(cwd, options.input ?? join('.ai', 'task-lifecycle-snapshot.json'));
  try {
    const raw = await readFile(input, 'utf8');
    const snapshot = JSON.parse(raw) as TaskLifecycleSnapshot;
    validateSnapshot(snapshot);
    const tableSummaries = snapshot.tables.map((table) => ({
      name: table.name,
      column_count: table.columns.length,
      row_count: table.rows.length,
    }));
    const rowCount = tableSummaries.reduce((sum, table) => sum + table.row_count, 0);
    const findings = inspectSnapshotFindings(snapshot, input);
    const result = {
      status: 'success',
      schema: 'https://narada.dev/schemas/task-lifecycle-snapshot-inspect/v1',
      input,
      raw_included: Boolean(options.raw),
      table_count: snapshot.tables.length,
      row_count: rowCount,
      tables: tableSummaries,
      findings,
      known_bulky_artifacts: [
        '.ai/task-lifecycle-snapshot.json',
        '.ai/mutation-evidence/**',
        '.ai/inbox-envelopes/**',
      ],
      architect_loop_guidance: 'Use this compact helper before rg/cat on task lifecycle snapshots or mutation evidence. Raw source evidence is available only with --raw.',
      suggested_repair: findings[0]?.suggested_repair ?? null,
      raw_snapshot: options.raw ? snapshot : undefined,
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(
        result,
        [
          `Snapshot: ${input}`,
          `Tables: ${snapshot.tables.length}`,
          `Rows: ${rowCount}`,
          `Findings: ${findings.length}`,
          `Raw included: ${options.raw ? 'yes (--raw)' : 'no'}`,
          `Suggested repair: ${findings[0]?.suggested_repair ?? 'none'}`,
        ],
        options.format ?? 'auto',
      ),
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        input,
        error: error instanceof Error ? error.message : String(error),
        guidance: 'Run narada task lifecycle export --output .ai/task-lifecycle-snapshot.json, then inspect the snapshot through this compact helper.',
      },
    };
  }
}

function buildSnapshot(store: SqliteTaskLifecycleStore): TaskLifecycleSnapshot {
  const tableNames = listUserTables(store);
  const tables = tableNames.map((name) => {
    const columns = listColumns(store, name);
    const order = columns.includes('task_number')
      ? 'task_number, rowid'
      : columns.includes('requested_at')
        ? 'requested_at, rowid'
        : 'rowid';
    const rows = store.db.prepare(`select * from ${quoteIdent(name)} order by ${order}`).all() as Record<string, unknown>[];
    return { name, columns, rows };
  });
  return {
    snapshot_kind: 'task_lifecycle_snapshot',
    snapshot_version: 1,
    exported_at: deriveSnapshotTimestamp(tables),
    tables,
  };
}

function deriveSnapshotTimestamp(tables: SnapshotTable[]): string {
  let latest: string | null = null;
  for (const table of tables) {
    const timestampColumns = table.columns.filter((column) => column.endsWith('_at'));
    for (const row of table.rows) {
      for (const column of timestampColumns) {
        const value = row[column];
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
          if (latest === null || value > latest) latest = value;
        }
      }
    }
  }
  return latest ?? '1970-01-01T00:00:00.000Z';
}

function applySnapshot(store: SqliteTaskLifecycleStore, snapshot: TaskLifecycleSnapshot): void {
  const currentTables = listUserTables(store);
  store.db.pragma('foreign_keys = off');
  const transaction = store.db.transaction(() => {
    for (const tableName of [...currentTables].reverse()) {
      store.db.prepare(`delete from ${quoteIdent(tableName)}`).run();
    }
    for (const table of snapshot.tables) {
      if (table.rows.length === 0) continue;
      const columns = table.columns.map(quoteIdent).join(', ');
      const placeholders = table.columns.map(() => '?').join(', ');
      const insert = store.db.prepare(`insert into ${quoteIdent(table.name)} (${columns}) values (${placeholders})`);
      for (const row of table.rows) {
        insert.run(...table.columns.map((column) => row[column] ?? null));
      }
    }
  });
  try {
    transaction();
  } finally {
    store.db.pragma('foreign_keys = on');
  }
}

function validateSnapshot(snapshot: TaskLifecycleSnapshot): void {
  if (snapshot.snapshot_kind !== 'task_lifecycle_snapshot' || snapshot.snapshot_version !== 1) {
    throw new Error('Invalid task lifecycle snapshot header');
  }
  for (const table of snapshot.tables) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table.name)) throw new Error(`Invalid table name: ${table.name}`);
    for (const column of table.columns) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) throw new Error(`Invalid column name: ${column}`);
    }
  }
}

function inspectSnapshotFindings(snapshot: TaskLifecycleSnapshot, input: string): SnapshotFinding[] {
  const findings: SnapshotFinding[] = [];
  const lifecycleByTaskId = new Map<string, Record<string, unknown>>();
  const lifecycleByTaskNumber = new Map<number, Record<string, unknown>>();
  const activeAssignmentsByTaskId = new Map<string, Record<string, unknown>[]>();

  for (const row of tableRows(snapshot, 'task_lifecycle')) {
    const taskId = typeof row.task_id === 'string' ? row.task_id : null;
    const taskNumber = typeof row.task_number === 'number' ? row.task_number : null;
    if (taskId) lifecycleByTaskId.set(taskId, row);
    if (taskNumber !== null) lifecycleByTaskNumber.set(taskNumber, row);
  }

  for (const row of tableRows(snapshot, 'task_assignments')) {
    if (row.released_at !== null && row.released_at !== undefined) continue;
    const taskId = typeof row.task_id === 'string' ? row.task_id : null;
    if (!taskId) continue;
    activeAssignmentsByTaskId.set(taskId, [...(activeAssignmentsByTaskId.get(taskId) ?? []), row]);
  }

  for (const row of tableRows(snapshot, 'agent_roster')) {
    if (row.status !== 'working') continue;
    const taskNumber = typeof row.task_number === 'number' ? row.task_number : null;
    const lifecycle = taskNumber === null ? null : lifecycleByTaskNumber.get(taskNumber) ?? null;
    const activeAssignments = lifecycle && typeof lifecycle.task_id === 'string'
      ? activeAssignmentsByTaskId.get(lifecycle.task_id) ?? []
      : [];
    const assignmentMatchesRoster = activeAssignments.some((assignment) => assignment.agent_id === row.agent_id);
    if (lifecycle?.status === 'claimed' && assignmentMatchesRoster) continue;
    findings.push({
      finding_id: `snapshot_stale_roster_${String(row.agent_id)}_${taskNumber ?? 'none'}`,
      severity: 'warning',
      summary: 'Roster says agent is working, but lifecycle/assignment evidence does not confirm an active claim.',
      facts: {
        path: input,
        agent_id: row.agent_id,
        roster_status: row.status,
        roster_task_number: taskNumber,
        lifecycle_status: lifecycle?.status ?? null,
        active_assignment_agents: activeAssignments.map((assignment) => assignment.agent_id),
      },
      suggested_repair: taskNumber === null
        ? 'narada task reconcile record --by <id>'
        : `narada task reconcile guide --task ${taskNumber} --by <id>`,
    });
  }

  return findings.slice(0, 20);
}

function tableRows(snapshot: TaskLifecycleSnapshot, name: string): Record<string, unknown>[] {
  return snapshot.tables.find((table) => table.name === name)?.rows ?? [];
}

function listUserTables(store: SqliteTaskLifecycleStore): string[] {
  const rows = store.db.prepare(`
    select name from sqlite_master
    where type = 'table' and name not like 'sqlite_%'
    order by name
  `).all() as Array<{ name: string }>;
  return rows.map((row) => row.name).filter((name) => !EXCLUDED_TABLES.has(name));
}

function listColumns(store: SqliteTaskLifecycleStore, tableName: string): string[] {
  const rows = store.db.prepare(`pragma table_info(${quoteIdent(tableName)})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function quoteIdent(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error(`Invalid SQL identifier: ${value}`);
  return `"${value}"`;
}
