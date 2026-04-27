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

function buildSnapshot(store: SqliteTaskLifecycleStore): TaskLifecycleSnapshot {
  const tableNames = listUserTables(store);
  return {
    snapshot_kind: 'task_lifecycle_snapshot',
    snapshot_version: 1,
    exported_at: new Date().toISOString(),
    tables: tableNames.map((name) => {
      const columns = listColumns(store, name);
      const order = columns.includes('task_number')
        ? 'task_number, rowid'
        : columns.includes('requested_at')
          ? 'requested_at, rowid'
          : 'rowid';
      const rows = store.db.prepare(`select * from ${quoteIdent(name)} order by ${order}`).all() as Record<string, unknown>[];
      return { name, columns, rows };
    }),
  };
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
