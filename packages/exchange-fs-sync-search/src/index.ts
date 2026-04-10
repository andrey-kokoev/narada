/**
 * exchange-fs-sync-search
 * 
 * Full-text search for Exchange messages using SQLite FTS5
 */

export { createSearchDb, closeSearchDb } from './db.js';
export { initSchema, dropSchema } from './schema.js';
export { Fts5Indexer } from './fts5-indexer.js';
export { Fts5QueryEngine } from './fts5-query.js';
export { SearchEngine } from './search-engine.js';

export type {
  SearchDocument,
  SearchQuery,
  SearchResult,
  IndexerStats,
  SearchConfig,
} from './types.js';

export type { Fts5IndexerOptions } from './fts5-indexer.js';
export type { Fts5QueryOptions } from './fts5-query.js';
export type { SearchEngineOptions } from './search-engine.js';
