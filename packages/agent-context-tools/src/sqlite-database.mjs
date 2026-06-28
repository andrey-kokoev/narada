import { existsSync } from 'node:fs';

const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  if (args[0] === 'ExperimentalWarning' && String(warning).includes('SQLite')) return;
  return originalEmitWarning.call(process, warning, ...args);
};

const { DatabaseSync } = await import('node:sqlite');

process.emitWarning = originalEmitWarning;

export const DEFAULT_BUSY_TIMEOUT_MS = 5000;

export default class Database {
  #db;

  constructor(path, options = {}) {
    if (options.fileMustExist && !existsSync(path)) {
      throw new Error(`sqlite_database_not_found: ${path}`);
    }
    this.#db = new DatabaseSync(path, {
      readOnly: options.readonly === true || options.readOnly === true,
    });
    const busyTimeoutMs = Number(options.busyTimeoutMs ?? options.busy_timeout_ms ?? DEFAULT_BUSY_TIMEOUT_MS);
    if (Number.isFinite(busyTimeoutMs) && busyTimeoutMs >= 0) {
      this.#db.exec(`PRAGMA busy_timeout = ${Math.trunc(busyTimeoutMs)}`);
    }
  }

  exec(sql) {
    return this.#db.exec(sql);
  }

  prepare(sql) {
    return this.#db.prepare(sql);
  }

  close() {
    return this.#db.close();
  }

  transaction(fn) {
    return (...args) => {
      this.#db.exec('BEGIN');
      try {
        const result = fn(...args);
        this.#db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this.#db.exec('ROLLBACK');
        } catch {
          // Preserve the original transaction failure.
        }
        throw error;
      }
    };
  }
}
