/**
 * FTS5 Query Engine - search using SQLite FTS5
 */

import type Database from 'better-sqlite3';
import type { SearchQuery, SearchResult, SearchDocument } from './types.js';

export interface Fts5QueryOptions {
  db: Database.Database;
}

/**
 * Build FTS5 match expression from query
 * 
 * Supports:
 * - Implicit AND: "project deadline" → project AND deadline
 * - Phrases: "exact phrase"
 * - Prefix: "proj*"
 * - Negation: "project -deadline"
 * - Column filters: subject:project, from:john
 */
function buildMatchExpression(query: SearchQuery): string {
  const parts: string[] = [];

  // Main query
  if (query.q) {
    // Map field aliases to column names
    let q = query.q
      .replace(/\bsubject:/g, 'subject:')
      .replace(/\bbody:/g, 'body_text:')
      .replace(/\bfrom:/g, 'from_email:')
      .replace(/\bto:/g, 'to_emails:');

    parts.push(`(${q})`);
  }

  // Folder filter
  if (query.folder_refs?.length) {
    const folderMatch = query.folder_refs
      .map(f => `folder_refs:"${f}"`)
      .join(' OR ');
    parts.push(`(${folderMatch})`);
  }

  // Read status filter
  if (query.is_read !== undefined) {
    parts.push(`is_read:${query.is_read ? 1 : 0}`);
  }

  // Flagged filter
  if (query.is_flagged !== undefined) {
    parts.push(`is_flagged:${query.is_flagged ? 1 : 0}`);
  }

  // If no query parts, match all documents
  if (parts.length === 0) {
    return '*';
  }

  return parts.join(' AND ');
}

export class Fts5QueryEngine {
  private db: Database.Database;

  constructor(options: Fts5QueryOptions) {
    this.db = options.db;
  }

  /**
   * Search the index
   */
  search(query: SearchQuery): SearchResult[] {
    const matchExpr = buildMatchExpression(query);

    // Use rank for BM25 scoring
    const stmt = this.db.prepare(`
      SELECT 
        message_id,
        rank as score,
        snippet(message_search, 0, '<mark>', '</mark>', '...', 32) as subject_highlight,
        snippet(message_search, 1, '<mark>', '</mark>', '...', 100) as body_highlight,
        from_name,
        from_email,
        received_at
      FROM message_search 
      WHERE message_search MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(
      matchExpr,
      query.limit || 20,
      query.offset || 0
    ) as Array<{
      message_id: string;
      score: number;
      subject_highlight: string | null;
      body_highlight: string | null;
      from_name: string;
      from_email: string;
      received_at: string;
    }>;

    return rows.map(row => {
      const highlights: Array<{ field: string; snippet: string }> = [];

      if (row.subject_highlight) {
        highlights.push({ field: 'subject', snippet: row.subject_highlight });
      }

      if (row.body_highlight) {
        highlights.push({ field: 'body', snippet: row.body_highlight });
      }

      return {
        message_id: row.message_id,
        score: Math.abs(row.score), // BM25 returns negative values
        highlights,
      };
    });
  }

  /**
   * Count total results (for pagination)
   */
  count(query: SearchQuery): number {
    const matchExpr = buildMatchExpression(query);

    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM message_search 
      WHERE message_search MATCH ?
    `);

    const result = stmt.get(matchExpr) as { count: number };
    return result.count;
  }

  /**
   * Get document by ID
   */
  getDocument(messageId: string): SearchDocument | null {
    const stmt = this.db.prepare(`
      SELECT 
        message_id,
        subject,
        body_text,
        from_name,
        from_email,
        to_emails,
        received_at,
        folder_refs,
        is_read,
        is_flagged
      FROM message_search 
      WHERE message_id = ?
    `);

    const row = stmt.get(messageId) as {
      message_id: string;
      subject: string;
      body_text: string;
      from_name: string;
      from_email: string;
      to_emails: string;
      received_at: string;
      folder_refs: string;
      is_read: number;
      is_flagged: number;
    } | null;

    if (!row) return null;

    return {
      message_id: row.message_id,
      subject: row.subject,
      body_text: row.body_text,
      from_name: row.from_name,
      from_email: row.from_email,
      to_emails: row.to_emails.split(' ').filter(Boolean),
      received_at: row.received_at,
      folder_refs: row.folder_refs.split(' ').filter(Boolean),
      is_read: Boolean(row.is_read),
      is_flagged: Boolean(row.is_flagged),
    };
  }

  /**
   * Get suggestions for autocomplete (prefix search)
   * 
   * Note: This uses a simple prefix match on the FTS5 table.
   * For production use, consider creating a vocab table:
   *   CREATE VIRTUAL TABLE message_search_vocab USING fts5vocab(message_search, row);
   */
  getSuggestions(_partial: string, _limit = 5): string[] {
    // For now, return empty array - vocab table can be added later
    // To enable: CREATE VIRTUAL TABLE message_search_vocab USING fts5vocab(message_search, row)
    return [];
  }

  /**
   * Get index statistics
   */
  getStats(): { documents_indexed: number; terms_indexed: number } {
    const docCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM message_index_meta
    `).get() as { count: number };

    let termCount = 0;
    try {
      const segInfo = this.db.prepare(`
        SELECT COUNT(*) as count FROM message_search_segdir
      `).get() as { count: number } | undefined;
      termCount = segInfo?.count || 0;
    } catch {
      // Table might be empty
    }

    return {
      documents_indexed: docCount.count,
      terms_indexed: termCount,
    };
  }

  /**
   * Log search to history
   */
  logSearch(query: string, resultCount: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO search_history (query, result_count)
      VALUES (?, ?)
    `);
    stmt.run(query, resultCount);
  }

  /**
   * Get recent searches
   */
  getRecentSearches(limit = 10): Array<{ query: string; result_count: number; searched_at: string }> {
    const stmt = this.db.prepare(`
      SELECT query, result_count, searched_at
      FROM search_history
      ORDER BY searched_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as Array<{ query: string; result_count: number; searched_at: string }>;
  }
}
