/**
 * Database schema for FTS5 search
 */

import type Database from 'better-sqlite3';

/**
 * Initialize the FTS5 schema
 */
export function initSchema(db: Database.Database): void {
  db.exec(`
    -- FTS5 virtual table for full-text search
    CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(
      -- Content columns (tokenized)
      subject,
      body_text,
      from_name,
      from_email,
      to_emails,
      
      -- Metadata columns (UNINDEXED - stored but not tokenized)
      message_id UNINDEXED,
      received_at UNINDEXED,
      folder_refs UNINDEXED,
      is_read UNINDEXED,
      is_flagged UNINDEXED,
      
      -- Configuration
      tokenize='porter unicode61',
      content='',
      content_rowid='rowid'
    );
    
    -- Track which messages are indexed (for incremental updates)
    CREATE TABLE IF NOT EXISTS message_index_meta (
      message_id TEXT PRIMARY KEY,
      indexed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      modified_at TEXT
    );
    
    -- Search history (optional, for UX improvements)
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      result_count INTEGER,
      searched_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Drop all search tables (for complete rebuild)
 */
export function dropSchema(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS message_search;
    DROP TABLE IF EXISTS message_index_meta;
    DROP TABLE IF EXISTS search_history;
  `);
}

/**
 * Optimize the FTS5 index
 */
export function optimizeIndex(db: Database.Database): void {
  db.exec("INSERT INTO message_search(message_search) VALUES('optimize')");
}

/**
 * Rebuild the FTS5 index
 */
export function rebuildIndex(db: Database.Database): void {
  db.exec("INSERT INTO message_search(message_search) VALUES('rebuild')");
}
