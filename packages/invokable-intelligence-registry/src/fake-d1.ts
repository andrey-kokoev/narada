/**
 * A D1-API-compatible wrapper over node:sqlite. Lets the D1 adapter run
 * the shared conformance suite locally without miniflare/Wrangler, and is
 * exported for downstream packages' tests (e.g. the Cloudflare carrier).
 */

import { DatabaseSync } from "node:sqlite";

import type { D1DatabaseLike, D1PreparedStatementLike } from "./d1-store.js";

interface FakeStatement extends D1PreparedStatementLike {
  readonly __sql: string;
  readonly __params: unknown[];
}

export interface FakeD1Database extends D1DatabaseLike {
  close(): void;
}

export function createFakeD1(path: string): FakeD1Database {
  const db = new DatabaseSync(path);

  const make = (sql: string, params: unknown[]): FakeStatement => ({
    __sql: sql,
    __params: params,
    bind(...next: unknown[]) {
      return make(sql, next);
    },
    async all<T = unknown>() {
      return { results: db.prepare(sql).all(...(params as never[])) as T[] };
    },
    async first<T = unknown>() {
      return ((db.prepare(sql).get(...(params as never[])) ?? null) as T | null);
    },
    async run() {
      const info = db.prepare(sql).run(...(params as never[]));
      return { success: true, meta: { changes: Number(info.changes) } };
    },
  });

  return {
    prepare(sql: string) {
      return make(sql, []);
    },
    async batch(statements: D1PreparedStatementLike[]) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const results: unknown[] = [];
        for (const statement of statements) {
          results.push(await (statement as FakeStatement).run());
        }
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}
