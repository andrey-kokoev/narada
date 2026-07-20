import { MaterializationStoreCore } from "./core.js";
import type { MaterializationMutationResult, MaterializationSqlExecutor, MaterializationSqlStatement } from "./store.js";

export interface D1PreparedStatementLike {
  bind(...params: unknown[]): D1PreparedStatementLike;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown[]>;
}

const changes = (result: unknown): number => {
  if (!result || typeof result !== "object") return 0;
  const meta = (result as { meta?: { changes?: unknown } }).meta;
  return typeof meta?.changes === "number" ? meta.changes : 0;
};

class D1MaterializationExecutor implements MaterializationSqlExecutor {
  constructor(private readonly db: D1DatabaseLike) {}
  async get<T>(sql: string, ...params: unknown[]): Promise<T | null> { return this.db.prepare(sql).bind(...params).first<T>(); }
  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> { return (await this.db.prepare(sql).bind(...params).all<T>()).results; }
  async transact(statements: MaterializationSqlStatement[]): Promise<MaterializationMutationResult[]> {
    return (await this.db.batch(statements.map(({ sql, params }) => this.db.prepare(sql).bind(...params)))).map((result) => ({ changes: changes(result) }));
  }
  async close(): Promise<void> {}
}

export class D1MaterializationStore extends MaterializationStoreCore {
  private constructor(db: D1DatabaseLike) { super(new D1MaterializationExecutor(db), "cloudflare-d1"); }
  static async open(db: D1DatabaseLike): Promise<D1MaterializationStore> {
    const store = new D1MaterializationStore(db);
    await store.migrate();
    return store;
  }
}
