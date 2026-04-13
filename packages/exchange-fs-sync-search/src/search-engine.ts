/**
 * Unified Search Engine
 * 
 * Provides a consistent API over FTS5 (primary) with fallback handling
 */

import type Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createSearchDb, closeSearchDb } from './db.js';
import { initSchema } from './schema.js';
import { Fts5Indexer } from './fts5-indexer.js';
import { Fts5QueryEngine } from './fts5-query.js';
import type { SearchDocument, SearchQuery, SearchResult, IndexerStats } from './types.js';

export interface SearchEngineOptions {
  rootDir: string;
  databasePath?: string;
}

export class SearchEngine {
  private rootDir: string;
  private db: Database.Database | null = null;
  private indexer: Fts5Indexer | null = null;
  private queryEngine: Fts5QueryEngine | null = null;
  private initialized = false;

  constructor(options: SearchEngineOptions) {
    this.rootDir = options.rootDir;
  }

  /**
   * Initialize the search engine (idempotent)
   */
  initialize(): void {
    if (this.initialized) return;

    this.db = createSearchDb({ rootDir: this.rootDir });
    initSchema(this.db);

    this.indexer = new Fts5Indexer({ db: this.db });
    this.queryEngine = new Fts5QueryEngine({ db: this.db });

    this.initialized = true;
  }

  /**
   * Check if index exists
   */
  indexExists(): boolean {
    const dbPath = join(this.rootDir, '.search.db');
    return existsSync(dbPath);
  }

  /**
   * Build or update the index from messages directory
   */
  async build(messagesDir: string): Promise<IndexerStats & { details: { added: number; updated: number; removed: number } }> {
    this.initialize();
    if (!this.indexer) throw new Error('Search engine not initialized');

    return this.indexer.buildFromMessages(messagesDir);
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.initialize();
    if (!this.indexer) throw new Error('Search engine not initialized');

    this.indexer.clear();
  }

  /**
   * Search the index
   */
  search(query: SearchQuery): SearchResult[] {
    this.initialize();
    if (!this.queryEngine) throw new Error('Search engine not initialized');

    return this.queryEngine.search(query);
  }

  /**
   * Get total count for a query (for pagination)
   */
  count(query: SearchQuery): number {
    this.initialize();
    if (!this.queryEngine) throw new Error('Search engine not initialized');

    return this.queryEngine.count(query);
  }

  /**
   * Get document by ID
   */
  getDocument(messageId: string): SearchDocument | null {
    this.initialize();
    if (!this.queryEngine) throw new Error('Search engine not initialized');

    return this.queryEngine.getDocument(messageId);
  }

  /**
   * Get search suggestions
   */
  getSuggestions(partial: string, limit?: number): string[] {
    this.initialize();
    if (!this.queryEngine) throw new Error('Search engine not initialized');

    return this.queryEngine.getSuggestions(partial, limit);
  }

  /**
   * Get index statistics
   */
  getStats(): { documents_indexed: number; terms_indexed: number; index_exists: boolean } {
    const exists = this.indexExists();
    
    if (!exists) {
      return { documents_indexed: 0, terms_indexed: 0, index_exists: false };
    }

    this.initialize();
    if (!this.queryEngine) throw new Error('Search engine not initialized');

    const stats = this.queryEngine.getStats();
    return { ...stats, index_exists: true };
  }

  /**
   * Log a search query
   */
  logSearch(query: string, resultCount: number): void {
    this.initialize();
    if (!this.queryEngine) throw new Error('Search engine not initialized');

    this.queryEngine.logSearch(query, resultCount);
  }

  /**
   * Get recent searches
   */
  getRecentSearches(limit?: number): Array<{ query: string; result_count: number; searched_at: string }> {
    this.initialize();
    if (!this.queryEngine) throw new Error('Search engine not initialized');

    return this.queryEngine.getRecentSearches(limit);
  }

  /**
   * Close the search engine and release resources
   */
  close(): void {
    if (this.db) {
      closeSearchDb(this.db);
      this.db = null;
    }
    this.indexer = null;
    this.queryEngine = null;
    this.initialized = false;
  }
}
