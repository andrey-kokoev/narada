/**
 * Database connection management for FTS5 search
 */

import Database from 'better-sqlite3';
import { join } from 'node:path';

export interface DatabaseOptions {
  rootDir: string;
  databasePath?: string;
}

/**
 * Create and configure the search database
 */
export function createSearchDb(options: DatabaseOptions): Database.Database {
  const dbPath = options.databasePath || join(options.rootDir, '.search.db');
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  return db;
}

/**
 * Close database connection safely
 */
export function closeSearchDb(db: Database.Database): void {
  try {
    db.close();
  } catch {
    // Ignore close errors
  }
}
