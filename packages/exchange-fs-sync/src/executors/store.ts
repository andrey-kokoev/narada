/**
 * Process Execution SQLite Store
 *
 * Durable persistence for process execution results.
 * Aligned with the unified executor lifecycle model.
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
  const phase = String(row.phase ?? row.status) as ProcessExecution["phase"];
  return {
    execution_id: String(row.execution_id),
    intent_id: String(row.intent_id),
    executor_family: String(row.executor_family ?? "process"),
    phase,
    confirmation_status: String(
      row.confirmation_status ?? "unconfirmed",
    ) as ProcessExecution["confirmation_status"],
    command: String(row.command),
    args_json: String(row.args_json),
    cwd: row.cwd ? String(row.cwd) : null,
    env_json: row.env_json ? String(row.env_json) : null,
    status: phase,
    exit_code:
      row.exit_code !== null && row.exit_code !== undefined
        ? Number(row.exit_code)
        : null,
    stdout: String(row.stdout),
    stderr: String(row.stderr),
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    confirmed_at: row.confirmed_at ? String(row.confirmed_at) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    artifact_id: row.artifact_id ? String(row.artifact_id) : null,
    result_json: String(row.result_json ?? "{}"),
    lease_expires_at: row.lease_expires_at
      ? String(row.lease_expires_at)
      : null,
    lease_runner_id: row.lease_runner_id
      ? String(row.lease_runner_id)
      : null,
    created_at: String(row.created_at),
  };
}

export class SqliteProcessExecutionStore implements ProcessExecutionStore {
  readonly db: Database.Database;
  private readonly shouldClose: boolean;

  constructor(
    opts: SqliteProcessExecutionStoreOptions | SqliteProcessExecutionStoreDbOptions,
  ) {
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
        executor_family text not null default 'process',
        phase text,
        confirmation_status text default 'unconfirmed',
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
        confirmed_at text,
        error_message text,
        artifact_id text,
        result_json text not null default '{}',
        lease_expires_at text,
        lease_runner_id text,
        created_at text not null
      );

      create index if not exists idx_process_executions_intent_id
        on process_executions(intent_id);

      create index if not exists idx_process_executions_status
        on process_executions(status);

      create index if not exists idx_process_executions_phase
        on process_executions(phase);

      create index if not exists idx_process_executions_lease_expires
        on process_executions(lease_expires_at);
    `);

    // Migrate existing databases to unified schema
    const columns = this.db
      .prepare("pragma table_info(process_executions)")
      .all() as Array<{ name: string }>;
    const names = new Set(columns.map((c) => c.name));

    if (!names.has("executor_family")) {
      this.db.prepare(
        `alter table process_executions add column executor_family text not null default 'process'`,
      ).run();
    }
    if (!names.has("phase")) {
      this.db.prepare(`alter table process_executions add column phase text`).run();
      this.db.prepare(`update process_executions set phase = status where phase is null`).run();
    }
    if (!names.has("confirmation_status")) {
      this.db.prepare(
        `alter table process_executions add column confirmation_status text default 'unconfirmed'`,
      ).run();
    }
    if (!names.has("confirmed_at")) {
      this.db.prepare(`alter table process_executions add column confirmed_at text`).run();
    }
    if (!names.has("error_message")) {
      this.db.prepare(`alter table process_executions add column error_message text`).run();
    }
    if (!names.has("artifact_id")) {
      this.db.prepare(`alter table process_executions add column artifact_id text`).run();
    }
    if (!names.has("result_json")) {
      this.db.prepare(
        `alter table process_executions add column result_json text not null default '{}'`,
      ).run();
    }
  }

  create(execution: Omit<ProcessExecution, "created_at">): void {
    this.db
      .prepare(
        `
      insert into process_executions (
        execution_id, intent_id, executor_family, phase, confirmation_status,
        command, args_json, cwd, env_json, status, exit_code, stdout, stderr,
        started_at, completed_at, confirmed_at, error_message, artifact_id, result_json,
        lease_expires_at, lease_runner_id, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
      )
      .run(
        execution.execution_id,
        execution.intent_id,
        execution.executor_family ?? "process",
        execution.phase ?? execution.status ?? "pending",
        execution.confirmation_status ?? "unconfirmed",
        execution.command,
        execution.args_json,
        execution.cwd ?? null,
        execution.env_json ?? null,
        execution.status ?? execution.phase ?? "pending",
        execution.exit_code ?? null,
        execution.stdout,
        execution.stderr,
        execution.started_at ?? null,
        execution.completed_at ?? null,
        execution.confirmed_at ?? null,
        execution.error_message ?? null,
        execution.artifact_id ?? null,
        execution.result_json ?? "{}",
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
      .prepare(
        "select * from process_executions where intent_id = ? order by created_at desc limit 1",
      )
      .get(intentId) as Record<string, unknown> | undefined;
    return row ? rowToExecution(row) : undefined;
  }

  updateStatus(
    executionId: string,
    status: ProcessExecution["status"],
    updates?: Partial<Omit<ProcessExecution, "execution_id" | "created_at" | "status">>,
  ): void {
    const fields: string[] = ["status = ?", "phase = ?"];
    const values: (string | number | null)[] = [status, status];

    if (updates?.executor_family !== undefined) {
      fields.push("executor_family = ?");
      values.push(updates.executor_family);
    }
    if (updates?.confirmation_status !== undefined) {
      fields.push("confirmation_status = ?");
      values.push(updates.confirmation_status);
    }
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
    if (updates?.confirmed_at !== undefined) {
      fields.push("confirmed_at = ?");
      values.push(updates.confirmed_at);
    }
    if (updates?.error_message !== undefined) {
      fields.push("error_message = ?");
      values.push(updates.error_message);
    }
    if (updates?.artifact_id !== undefined) {
      fields.push("artifact_id = ?");
      values.push(updates.artifact_id);
    }
    if (updates?.result_json !== undefined) {
      fields.push("result_json = ?");
      values.push(updates.result_json);
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
    this.db
      .prepare(`update process_executions set ${fields.join(", ")} where execution_id = ?`)
      .run(...values);
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
    const rows = this.db.prepare(
      `
      select * from process_executions
      where status = 'running'
        and lease_expires_at is not null
        and lease_expires_at < ?
    `,
    ).all(t) as Record<string, unknown>[];
    return rows.map(rowToExecution);
  }

  close(): void {
    if (this.shouldClose) {
      this.db.close();
    }
  }
}
