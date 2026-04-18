/**
 * FTS5 Indexer - builds and maintains the search index
 */

import type Database from 'better-sqlite3';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SearchDocument, IndexerStats } from './types.js';

export interface Fts5IndexerOptions {
  db: Database.Database;
}

/**
 * Extract body text from message record
 */
function extractBodyText(record: Record<string, unknown>): string {
  const body = record.body as Record<string, unknown>;
  if (!body) return '';

  if (typeof body.text === 'string') return body.text;
  if (typeof body.html === 'string') {
    return body.html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

/**
 * Extract emails from recipients
 */
function extractEmails(recipients: unknown): string[] {
  if (!Array.isArray(recipients)) return [];
  return recipients
    .filter((r): r is Record<string, string> => typeof r === 'object' && r !== null)
    .map(r => r.email || '')
    .filter(Boolean);
}

/**
 * Load document from filesystem
 */
async function loadDocument(recordPath: string, messageId: string): Promise<SearchDocument> {
  const raw = await readFile(recordPath, 'utf8');
  const record = JSON.parse(raw) as Record<string, unknown>;

  return {
    message_id: messageId,
    subject: String(record.subject || ''),
    body_text: extractBodyText(record),
    from_name: String((record.from as Record<string, string>)?.name || ''),
    from_email: String((record.from as Record<string, string>)?.email || ''),
    to_emails: extractEmails(record.to),
    received_at: String(record.received_at || ''),
    folder_refs: Array.isArray(record.folder_refs) ? record.folder_refs as string[] : [],
    is_read: Boolean((record.flags as Record<string, boolean>)?.is_read),
    is_flagged: Boolean((record.flags as Record<string, boolean>)?.is_flagged),
  };
}

export class Fts5Indexer {
  private db: Database.Database;

  constructor(options: Fts5IndexerOptions) {
    this.db = options.db;
  }

  /**
   * Index or update a single document
   */
  indexDocument(doc: SearchDocument): void {
    const insert = this.db.prepare(`
      INSERT INTO message_search (
        message_id, subject, body_text, from_name, from_email,
        to_emails, received_at, folder_refs, is_read, is_flagged
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET
        subject = excluded.subject,
        body_text = excluded.body_text,
        from_name = excluded.from_name,
        from_email = excluded.from_email,
        to_emails = excluded.to_emails,
        received_at = excluded.received_at,
        folder_refs = excluded.folder_refs,
        is_read = excluded.is_read,
        is_flagged = excluded.is_flagged
    `);

    const metaInsert = this.db.prepare(`
      INSERT INTO message_index_meta (message_id, indexed_at, modified_at)
      VALUES (?, datetime('now'), datetime('now'))
      ON CONFLICT(message_id) DO UPDATE SET
        indexed_at = excluded.indexed_at,
        modified_at = excluded.modified_at
    `);

    this.db.transaction(() => {
      insert.run(
        doc.message_id,
        doc.subject,
        doc.body_text,
        doc.from_name,
        doc.from_email,
        doc.to_emails.join(' '),
        doc.received_at,
        doc.folder_refs.join(' '),
        doc.is_read ? 1 : 0,
        doc.is_flagged ? 1 : 0
      );
      metaInsert.run(doc.message_id);
    })();
  }

  /**
   * Remove document from index
   */
  removeDocument(messageId: string): void {
    const deleteSearch = this.db.prepare(`
      DELETE FROM message_search WHERE message_id = ?
    `);
    const deleteMeta = this.db.prepare(`
      DELETE FROM message_index_meta WHERE message_id = ?
    `);

    this.db.transaction(() => {
      deleteSearch.run(messageId);
      deleteMeta.run(messageId);
    })();
  }

  /**
   * Build index incrementally from messages directory
   */
  async buildFromMessages(messagesDir: string): Promise<IndexerStats & { details: { added: number; updated: number; removed: number } }> {
    const startTime = Date.now();

    // Get list of already indexed messages
    const indexedRows = this.db.prepare(`
      SELECT message_id, modified_at FROM message_index_meta
    `).all() as Array<{ message_id: string; modified_at: string }>;

    const indexedMap = new Map(indexedRows.map(i => [i.message_id, i.modified_at]));

    // Scan filesystem
    let entries: string[];
    try {
      entries = await readdir(messagesDir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return {
          documents_indexed: 0,
          terms_indexed: 0,
          index_size_bytes: 0,
          build_duration_ms: 0,
          details: { added: 0, updated: 0, removed: 0 }
        };
      }
      throw error;
    }

    let added = 0;
    let updated = 0;
    let removed = 0;

    for (const entry of entries) {
      const recordPath = join(messagesDir, entry, 'record.json');
      const messageId = decodeURIComponent(entry);

      try {
        const stats = await stat(recordPath);
        const mtime = stats.mtime.toISOString();

        const existing = indexedMap.get(messageId);

        if (!existing) {
          // New message
          const doc = await loadDocument(recordPath, messageId);
          this.indexDocument(doc);
          added++;
        } else if (existing < mtime) {
          // Modified message
          const doc = await loadDocument(recordPath, messageId);
          this.indexDocument(doc);
          updated++;
        }

        indexedMap.delete(messageId); // Mark as seen
      } catch {
        // Skip invalid entries
        continue;
      }
    }

    // Remaining in indexedMap are deleted messages
    for (const messageId of indexedMap.keys()) {
      this.removeDocument(messageId);
      removed++;
    }

    // Optimize database
    this.db.exec("INSERT INTO message_search(message_search) VALUES('optimize')");

    const stats = this.getStats();
    return {
      ...stats,
      build_duration_ms: Date.now() - startTime,
      details: { added, updated, removed }
    };
  }

  /**
   * Clear entire index
   */
  clear(): void {
    this.db.exec(`DELETE FROM message_search`);
    this.db.exec(`DELETE FROM message_index_meta`);
    this.db.exec(`INSERT INTO message_search(message_search) VALUES('rebuild')`);
  }

  /**
   * Get statistics
   */
  getStats(): Omit<IndexerStats, 'build_duration_ms' | 'details'> {
    const docCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM message_index_meta
    `).get() as { count: number };

    // Estimate term count from FTS5 segments
    let termCount = 0;
    try {
      const segInfo = this.db.prepare(`
        SELECT COUNT(*) as count FROM message_search_segdir
      `).get() as { count: number } | undefined;
      termCount = segInfo?.count || 0;
    } catch {
      // FTS5 table might not have segdir if empty
    }

    return {
      documents_indexed: docCount.count,
      terms_indexed: termCount,
      index_size_bytes: 0, // Would need filesystem access
    };
  }

  /**
   * Check if a document is indexed
   */
  isIndexed(messageId: string): boolean {
    const result = this.db.prepare(`
      SELECT 1 FROM message_index_meta WHERE message_id = ?
    `).get(messageId);
    return !!result;
  }
}
