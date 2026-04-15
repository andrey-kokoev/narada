/**
 * Process Execution SQLite Store
 *
 * Durable persistence for process execution results.
 */

import Database from "better-sqlite3";
import type { ProcessExecution } from "./types.js";

export interface ProcessExecutionStore {
  readonly db: import("better-sqlite3").Database;
  initSchema(): void;
  create(execution: Omit<ProcessExecution, "created_at">): void;
  getById(executionId: string): ProcessExecution | undefined;
  getByIntentId(intentId: string): ProcessExecution | undefined;
  updateStatus(
    executionId: string,
    status: ProcessExecution["status"],
    updates?: Partial<
      Omit<ProcessExecution, "execution_id" | "created_at" | "status">
    >,
  ): void;
  recoverStaleExecutions(now?: string): ProcessExecution[];
  close(): void;
}

export interface SqliteProcessExecutionStoreOptions {
  dbPath: string;
}

export interface SqliteProcessExecutionStoreDbOptions {
  db: Database.Database;
}

function rowToExecution(row: Record<string, unknown>): ProcessExecution {
  return {
    execution_id: String(row.execution_id),
    intent_id: String(row.intent_id),
    command: String(row.command),
    args_json: String(row.args_json),
    cwd: row.cwd ? String(row.cwd) : null,
    env_json: row.env_json ? String(row.env_json) : null,
    status: String(row.status) as ProcessExecution["status"],
    exit_code: row.exit_code !== null && row.exit_code !== undefined ? Number(row.exit_code) : null,
    stdout: String(row.stdout),
    stderr: String(row.stderr),
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    lease_expires_at: row.lease_expires_at ? String(row.lease_expires_at) : null,
    lease_runner_id: row.lease_runner_id ? String(row.lease_runner_id) : null,
    created_at: String(row.created_at),
  };
}

export class SqliteProcessExecutionStore implements ProcessExecutionStore {
  readonly db: Database.Database;
  private readonly shouldClose: boolean;

  constructor(opts: SqliteProcessExecutionStoreOptions | SqliteProcessExecutionStoreDbOptions) {
    if ("db" in opts) {
      this.db = opts.db;
      this.shouldClose = false;
    } else {
      this.db = new Database(opts.dbPath);
      this.shouldClose = true;
    }
  }

  initSchema(): void {
    this.db.exec(`
      create table if not exists process_executions (
        execution_id text primary key,
        intent_id text not null,
        command text not null,
        args_json text not null default '[]',
        cwd text,
        env_json text,
        status text not null,
        exit_code integer,
        stdout text not null default '',
        stderr text not null default '',
        started_at text,
        completed_at text,
        lease_expires_at text,
        lease_runner_id text,
        created_at text not null
      );

      create index if not exists idx_process_executions_intent_id
        on process_executions(intent_id);

      create index if not exists idx_process_executions_status
        on process_executions(status);

      create index if not exists idx_process_executions_lease_expires
        on process_executions(lease_expires_at);
    `);
  }

  create(execution: Omit<ProcessExecution, "created_at">): void {
    this.db.prepare(`
      insert into process_executions (
        execution_id, intent_id, command, args_json, cwd, env_json,
        status, exit_code, stdout, stderr, started_at, completed_at,
        lease_expires_at, lease_runner_id, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      execution.execution_id,
      execution.intent_id,
      execution.command,
      execution.args_json,
      execution.cwd ?? null,
      execution.env_json ?? null,
      execution.status,
      execution.exit_code ?? null,
      execution.stdout,
      execution.stderr,
      execution.started_at ?? null,
      execution.completed_at ?? null,
      execution.lease_expires_at ?? null,
      execution.lease_runner_id ?? null,
    );
  }

  getById(executionId: string): ProcessExecution | undefined {
    const row = this.db
      .prepare("select * from process_executions where execution_id = ?")
      .get(executionId) as Record<string, unknown> | undefined;
    return row ? rowToExecution(row) : undefined;
  }

  getByIntentId(intentId: string): ProcessExecution | undefined {
    const row = this.db
      .prepare("select * from process_executions where intent_id = ? order by created_at desc limit 1")
      .get(intentId) as Record<string, unknown> | undefined;
    return row ? rowToExecution(row) : undefined;
  }

  updateStatus(
    executionId: string,
    status: ProcessExecution["status"],
    updates?: Partial<Omit<ProcessExecution, "execution_id" | "created_at" | "status">>,
  ): void {
    const fields: string[] = ["status = ?"];
    const values: (string | number | null)[] = [status];

    if (updates?.command !== undefined) {
      fields.push("command = ?");
      values.push(updates.command);
    }
    if (updates?.args_json !== undefined) {
      fields.push("args_json = ?");
      values.push(updates.args_json);
    }
    if (updates?.cwd !== undefined) {
      fields.push("cwd = ?");
      values.push(updates.cwd);
    }
    if (updates?.env_json !== undefined) {
      fields.push("env_json = ?");
      values.push(updates.env_json);
    }
    if (updates?.exit_code !== undefined) {
      fields.push("exit_code = ?");
      values.push(updates.exit_code);
    }
    if (updates?.stdout !== undefined) {
      fields.push("stdout = ?");
      values.push(updates.stdout);
    }
    if (updates?.stderr !== undefined) {
      fields.push("stderr = ?");
      values.push(updates.stderr);
    }
    if (updates?.started_at !== undefined) {
      fields.push("started_at = ?");
      values.push(updates.started_at);
    }
    if (updates?.completed_at !== undefined) {
      fields.push("completed_at = ?");
      values.push(updates.completed_at);
    }
    if (updates?.lease_expires_at !== undefined) {
      fields.push("lease_expires_at = ?");
      values.push(updates.lease_expires_at);
    }
    if (updates?.lease_runner_id !== undefined) {
      fields.push("lease_runner_id = ?");
      values.push(updates.lease_runner_id);
    }

    values.push(executionId);
    this.db.prepare(`update process_executions set ${fields.join(", ")} where execution_id = ?`).run(...values);
  }

  /**
   * Recover stale running executions:
   * - status = 'running'
   * - lease_expires_at is not null and lease_expires_at < now
   *
   * Returns the list of recovered execution records.
   */
  recoverStaleExecutions(now?: string): ProcessExecution[] {
    const t = now ?? new Date().toISOString();
    const rows = this.db.prepare(`
      select * from process_executions
      where status = 'running'
        and lease_expires_at is not null
        and lease_expires_at < ?
    `).all(t) as Record<string, unknown>[];
    return rows.map(rowToExecution);
  }

  close(): void {
    if (this.shouldClose) {
      this.db.close();
    }
  }
}
