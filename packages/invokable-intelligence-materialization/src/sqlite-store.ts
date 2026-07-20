import { DatabaseSync } from "node:sqlite";
import { MaterializationStoreCore } from "./core.js";
import type { MaterializationMutationResult, MaterializationSqlExecutor, MaterializationSqlStatement } from "./store.js";

class SqliteMaterializationExecutor implements MaterializationSqlExecutor {
  constructor(private readonly db: DatabaseSync) {}
  async get<T>(sql: string, ...params: unknown[]): Promise<T | null> { return (this.db.prepare(sql).get(...(params as never[])) ?? null) as T | null; }
  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> { return this.db.prepare(sql).all(...(params as never[])) as T[]; }
  async transact(statements: MaterializationSqlStatement[]): Promise<MaterializationMutationResult[]> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map(({ sql, params }) => ({ changes: Number(this.db.prepare(sql).run(...(params as never[])).changes) }));
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async close(): Promise<void> { this.db.close(); }
}

export class SqliteMaterializationStore extends MaterializationStoreCore {
  private constructor(db: DatabaseSync) { super(new SqliteMaterializationExecutor(db), "node-sqlite"); }
  static async open(path: string): Promise<SqliteMaterializationStore> {
    const store = new SqliteMaterializationStore(new DatabaseSync(path));
    await store.migrate();
    return store;
  }
}
