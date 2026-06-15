/**
 * Test Database Lifecycle Helper
 *
 * Tracks in-memory databases created during tests and ensures they are closed
 * before process exit. Uses the project's node:sqlite Database wrapper.
 */

import Database from "../src/sqlite/database.js";

const trackedDbs = new Set<Database>();

export function createTestDb(path = ":memory:"): Database {
  const db = new Database(path);
  trackedDbs.add(db);

  const originalClose = db.close.bind(db);
  db.close = function (this: Database, ...args: []): void {
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
