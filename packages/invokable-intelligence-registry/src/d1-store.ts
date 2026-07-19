/**
 * Cloudflare D1 embodiment of the registry store (remote authority loci).
 * Speaks the D1 binding API; nothing Cloudflare-specific leaks into the
 * shared core.
 */

import { RegistryStoreCore } from "./core.js";
import type { SqlExecutor, SqlStatement } from "./store.js";

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

class D1Executor implements SqlExecutor {
  constructor(private readonly db: D1DatabaseLike) {}

  async run(sql: string, ...params: unknown[]): Promise<void> {
    await this.db.prepare(sql).bind(...params).run();
  }

  async get<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return this.db.prepare(sql).bind(...params).first<T>();
  }

  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    const { results } = await this.db.prepare(sql).bind(...params).all<T>();
    return results;
  }

  async transact(statements: SqlStatement[]): Promise<void> {
    await this.db.batch(statements.map(({ sql, params }) => this.db.prepare(sql).bind(...params)));
  }
}

export class D1RegistryStore extends RegistryStoreCore {
  private constructor(db: D1DatabaseLike) {
    super(new D1Executor(db), "cloudflare-d1");
  }

  /** Open (and migrate) a store over a D1 database binding. */
  static async open(db: D1DatabaseLike): Promise<D1RegistryStore> {
    const store = new D1RegistryStore(db);
    await store.migrate();
    return store;
  }
}
