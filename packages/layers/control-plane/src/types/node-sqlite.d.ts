/**
 * Minimal type declarations for node:sqlite.
 *
 * node:sqlite is an experimental Node 22+ API. These declarations are local
 * until the package upgrades to @types/node ^22 or the API stabilizes.
 */

declare module "node:sqlite" {
  export interface StatementSync {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
