/**
 * Intent SQLite Store
 *
 * Durable persistence for the domain-neutral Intent boundary.
 */

import Database from "better-sqlite3";
import type { Intent, IntentStatus } from "./types.js";
import { assertValidIntent } from "./registry.js";

export interface IntentStore {
  readonly db: import("better-sqlite3").Database;
  initSchema(): void;
  admit(intent: Omit<Intent, "created_at" | "updated_at">): { intent: Intent; isNew: boolean };
  getById(intentId: string): Intent | undefined;
  getByIdempotencyKey(idempotencyKey: string): Intent | undefined;
  getPendingIntents(executorFamily?: string): Intent[];
  updateStatus(
    intentId: string,
    status: IntentStatus,
    updates?: Partial<Pick<Intent, "target_id" | "terminal_reason">>,
  ): void;
  close(): void;
}

/** Read-only view of IntentStore for observability and UI consumption */
export type IntentStoreView = Omit<
  IntentStore,
  "initSchema" | "close" | "admit" | "updateStatus"
>;

export interface SqliteIntentStoreOptions {
  dbPath: string;
}

export interface SqliteIntentStoreDbOptions {
  db: Database.Database;
}

function rowToIntent(row: Record<string, unknown>): Intent {
  return {
    intent_id: String(row.intent_id),
    intent_type: String(row.intent_type) as Intent["intent_type"],
    executor_family: String(row.executor_family),
    payload_json: String(row.payload_json),
    idempotency_key: String(row.idempotency_key),
    status: String(row.status) as IntentStatus,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    context_id: String(row.context_id),
    target_id: row.target_id ? String(row.target_id) : null,
    terminal_reason: row.terminal_reason ? String(row.terminal_reason) : null,
  };
}

export class SqliteIntentStore implements IntentStore {
  readonly db: Database.Database;
  private readonly shouldClose: boolean;

  constructor(opts: SqliteIntentStoreOptions | SqliteIntentStoreDbOptions) {
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
      create table if not exists intents (
        intent_id text primary key,
        intent_type text not null,
        executor_family text not null,
        payload_json text not null default '{}',
        idempotency_key text not null unique,
        status text not null,
        created_at text not null,
        updated_at text not null,
        context_id text not null,
        target_id text,
        terminal_reason text
      );

      create index if not exists idx_intents_status
        on intents(status);

      create index if not exists idx_intents_executor_family
        on intents(executor_family);

      create index if not exists idx_intents_context_id
        on intents(context_id);

      create index if not exists idx_intents_idempotency
        on intents(idempotency_key);
    `);
  }

  admit(intent: Omit<Intent, "created_at" | "updated_at">): { intent: Intent; isNew: boolean } {
    const checkIdempotency = this.db.prepare(
      "select * from intents where idempotency_key = ?",
    );
    const insert = this.db.prepare(`
      insert into intents (
        intent_id, intent_type, executor_family, payload_json, idempotency_key,
        status, created_at, updated_at, context_id, target_id, terminal_reason
      ) values (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)
    `);

    const tx = this.db.transaction(() => {
      const existing = checkIdempotency.get(intent.idempotency_key) as
        | Record<string, unknown>
        | undefined;
      if (existing) {
        return { intent: rowToIntent(existing), isNew: false };
      }

      assertValidIntent(intent);

      insert.run(
        intent.intent_id,
        intent.intent_type,
        intent.executor_family,
        intent.payload_json,
        intent.idempotency_key,
        intent.status,
        intent.context_id,
        intent.target_id,
        intent.terminal_reason,
      );

      const row = this.db
        .prepare("select * from intents where intent_id = ?")
        .get(intent.intent_id) as Record<string, unknown>;
      return { intent: rowToIntent(row), isNew: true };
    });

    return tx();
  }

  getById(intentId: string): Intent | undefined {
    const row = this.db
      .prepare("select * from intents where intent_id = ?")
      .get(intentId) as Record<string, unknown> | undefined;
    return row ? rowToIntent(row) : undefined;
  }

  getByIdempotencyKey(idempotencyKey: string): Intent | undefined {
    const row = this.db
      .prepare("select * from intents where idempotency_key = ?")
      .get(idempotencyKey) as Record<string, unknown> | undefined;
    return row ? rowToIntent(row) : undefined;
  }

  getPendingIntents(executorFamily?: string): Intent[] {
    const sql = executorFamily
      ? "select * from intents where status = 'admitted' and executor_family = ? order by created_at asc"
      : "select * from intents where status = 'admitted' order by created_at asc";
    const rows = executorFamily
      ? (this.db.prepare(sql).all(executorFamily) as Record<string, unknown>[])
      : (this.db.prepare(sql).all() as Record<string, unknown>[]);
    return rows.map(rowToIntent);
  }

  updateStatus(
    intentId: string,
    status: IntentStatus,
    updates?: Partial<Pick<Intent, "target_id" | "terminal_reason">>,
  ): void {
    const fields: string[] = ["status = ?", "updated_at = datetime('now')"];
    const values: (string | null)[] = [status];

    if (updates?.target_id !== undefined) {
      fields.push("target_id = ?");
      values.push(updates.target_id);
    }
    if (updates?.terminal_reason !== undefined) {
      fields.push("terminal_reason = ?");
      values.push(updates.terminal_reason);
    }

    values.push(intentId);
    this.db.prepare(`update intents set ${fields.join(", ")} where intent_id = ?`).run(...values);
  }

  close(): void {
    if (this.shouldClose) {
      this.db.close();
    }
  }
}
