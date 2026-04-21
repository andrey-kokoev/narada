import Database from "better-sqlite3";

export class MockSqlStorageCursor<T extends Record<string, SqlStorageValue>> implements SqlStorageCursor<T> {
  private index = 0;
  constructor(private rows: T[]) {}
  next(): { done?: false; value: T } | { done: true; value?: never } {
    if (this.index < this.rows.length) return { done: false, value: this.rows[this.index++]! };
    return { done: true };
  }
  toArray(): T[] { return this.rows; }
  one(): T | undefined { return this.rows[0]; }
  raw<U extends SqlStorageValue[]>(): IterableIterator<U> {
    return this.rows.map(r => Object.values(r) as U)[Symbol.iterator]();
  }
  get columnNames(): string[] { return this.rows.length > 0 ? Object.keys(this.rows[0]!) : []; }
  get rowsRead(): number { return this.rows.length; }
  get rowsWritten(): number { return 0; }
  [Symbol.iterator](): IterableIterator<T> { return this.rows[Symbol.iterator](); }
}

export class MockSqlStorage implements SqlStorage {
  private readonly db: Database.Database;
  constructor(db: Database.Database) { this.db = db; }
  get databaseSize(): number { return 0; }
  exec<T extends Record<string, SqlStorageValue>>(query: string, ...bindings: unknown[]): SqlStorageCursor<T> {
    const stmt = this.db.prepare(query);
    if (!query.trim().match(/^select\b/i)) {
      stmt.run(...bindings);
      return new MockSqlStorageCursor<T>([]) as unknown as SqlStorageCursor<T>;
    }
    const rows = stmt.all(...bindings) as T[];
    return new MockSqlStorageCursor<T>(rows) as unknown as SqlStorageCursor<T>;
  }
}

export function createMockState(db: Database.Database): DurableObjectState {
  const sql = new MockSqlStorage(db);
  return {
    storage: { sql, get: async () => undefined, put: async () => {}, delete: async () => {}, list: async () => new Map(), transaction: async (fn: () => Promise<void>) => fn() },
    waitUntil: () => {},
    id: { toString: () => "mock-do-id" } as DurableObjectId,
    acceptWebSocket: () => {}, getWebSockets: () => [], getTags: () => [], abort: () => {}, attachment: undefined,
  } as unknown as DurableObjectState;
}
