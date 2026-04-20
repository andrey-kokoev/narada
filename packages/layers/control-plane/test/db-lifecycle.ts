/**
 * Test Database Lifecycle Helper
 *
 * Tracks in-memory better-sqlite3 databases created during tests and ensures
 * they are closed before process exit. This mitigates the known V8 fatal
 * crash that can occur when better-sqlite3 native destructors run during
 * process teardown.
 *
 * Usage: Replace `new Database(":memory:")` with `createTestDb()` in tests.
 */

import Database from "better-sqlite3";

const trackedDbs = new Set<Database.Database>();

export function createTestDb(path = ":memory:"): Database.Database {
  const db = new Database(path);
  trackedDbs.add(db);

  const originalClose = db.close.bind(db);
  db.close = function (this: Database.Database, ...args: []): void {
    trackedDbs.delete(db);
    return originalClose.apply(this, args);
  };

  return db;
}

export function closeAllTestDatabases(): void {
  for (const db of trackedDbs) {
    try {
      db.close();
    } catch {
      // Ignore errors during bulk close
    }
  }
  trackedDbs.clear();
}

export function getTrackedDatabaseCount(): number {
  return trackedDbs.size;
}
