import RuntimeDatabase, { type RunResult } from "@narada-core/sqlite";

type BindArgs = unknown[];

export type { RunResult } from "@narada-core/sqlite";

export interface Statement {
  all(...args: BindArgs): unknown[];
  get(...args: BindArgs): unknown;
  run(...args: BindArgs): RunResult;
  pluck(): Statement;
}

export default class Database {
  private readonly db: RuntimeDatabase;

  constructor(path: string) {
    this.db = new RuntimeDatabase(path);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): Statement {
    return this.db.prepare(sql) as Statement;
  }

  pragma(source: string): unknown {
    return this.db.pragma(source);
  }

  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult {
    return this.db.transaction(fn);
  }

  close(): void {
    this.db.close();
  }
}

export namespace Database {
  export type Database = import("./database.js").default;
  export type Statement = import("./database.js").Statement;
  export type RunResult = import("./database.js").RunResult;
}
