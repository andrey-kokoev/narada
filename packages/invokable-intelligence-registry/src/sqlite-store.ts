/**
 * node:sqlite embodiment of the registry store (local authority loci).
 */

import { DatabaseSync } from "node:sqlite";

import { RegistryStoreCore } from "./core.js";
import type { SqlExecutor, SqlStatement } from "./store.js";

class SqliteExecutor implements SqlExecutor {
  constructor(private readonly db: DatabaseSync) {}

  async run(sql: string, ...params: unknown[]): Promise<void> {
    this.db.prepare(sql).run(...(params as never[]));
  }

  async get<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    const row = this.db.prepare(sql).get(...(params as never[]));
    return (row ?? null) as T | null;
  }

  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  async transact(statements: SqlStatement[]): Promise<void> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const { sql, params } of statements) {
        this.db.prepare(sql).run(...(params as never[]));
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

export class SqliteRegistryStore extends RegistryStoreCore {
  private constructor(private readonly db: DatabaseSync) {
    super(new SqliteExecutor(db), "node-sqlite");
  }

  /** Open (and migrate) a store at `path`, or ":memory:". */
  static async open(path: string): Promise<SqliteRegistryStore> {
    const store = new SqliteRegistryStore(new DatabaseSync(path));
    await store.migrate();
    return store;
  }

  override async close(): Promise<void> {
    this.db.close();
  }
}
