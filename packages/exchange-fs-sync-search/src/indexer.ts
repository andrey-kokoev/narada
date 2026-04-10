/**
 * Full-text search indexer
 * 
 * Builds and maintains an inverted index from normalized messages.
 * Uses simple JSON-based storage for portability.
 */

import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { SearchDocument, SearchIndex, IndexerStats, SearchOptions } from './types.js';

interface InvertedIndex {
  // term -> [document_id, frequency][]
  terms: Record<string, Array<[string, number]>>;
  // document_id -> document metadata
  documents: Record<string, SearchDocument>;
  // metadata
  meta: SearchIndex;
}

const DEFAULT_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'the', 'www', 'com', 'org',
]);

function tokenize(text: string, minLength: number, stopWords: Set<string>): string[] {
  if (!text) return [];
  
  // Lowercase and extract words
  const normalized = text.toLowerCase();
  const words = normalized.match(/\b[a-z0-9]+\b/g) || [];
  
  return words.filter(w => 
    w.length >= minLength && 
    !stopWords.has(w) &&
    !/^\d+$/.test(w), // Exclude pure numbers
  );
}

function calculateTermFrequency(terms: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const term of terms) {
    freq.set(term, (freq.get(term) || 0) + 1);
  }
  return freq;
}

export class MessageIndexer {
  private readonly options: Required<SearchOptions>;
  private index: InvertedIndex;
  private dirty = false;

  constructor(options: SearchOptions) {
    this.options = {
      indexDir: join(options.rootDir, 'search-index'),
      caseSensitive: false,
      minTermLength: 2,
      stopWords: DEFAULT_STOP_WORDS,
      ...options,
    };
    
    this.index = {
      terms: {},
      documents: {},
      meta: {
        version: 1,
        built_at: new Date().toISOString(),
        document_count: 0,
        term_count: 0,
      },
    };
  }

  private get indexPath(): string {
    return join(this.options.indexDir, 'index.json');
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.options.indexDir, { recursive: true });
  }

  /**
   * Load existing index from disk
   */
  async load(): Promise<boolean> {
    try {
      const data = await readFile(this.indexPath, 'utf8');
      this.index = JSON.parse(data) as InvertedIndex;
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return false; // No existing index
      }
      throw error;
    }
  }

  /**
   * Save index to disk
   */
  async save(): Promise<void> {
    if (!this.dirty) return;
    
    await this.ensureDir();
    const data = JSON.stringify(this.index, null, 2);
    await writeFile(this.indexPath, data);
    this.dirty = false;
  }

  /**
   * Add or update a document in the index
   */
  indexDocument(doc: SearchDocument): void {
    const docId = doc.message_id;
    
    // Remove existing document if present
    if (this.index.documents[docId]) {
      this.removeDocument(docId);
    }

    // Store document metadata
    this.index.documents[docId] = doc;

    // Index searchable fields
    const searchableText = [
      doc.subject,
      doc.body_text,
      doc.from_name,
      doc.from_email,
      ...doc.to_emails,
    ].join(' ');

    const tokens = tokenize(
      searchableText,
      this.options.minTermLength,
      this.options.stopWords,
    );
    
    const termFreq = calculateTermFrequency(tokens);

    // Add to inverted index
    for (const [term, freq] of termFreq.entries()) {
      if (!this.index.terms[term]) {
        this.index.terms[term] = [];
      }
      this.index.terms[term].push([docId, freq]);
    }

    this.index.meta.document_count++;
    this.index.meta.term_count = Object.keys(this.index.terms).length;
    this.dirty = true;
  }

  /**
   * Remove a document from the index
   */
  removeDocument(docId: string): void {
    if (!this.index.documents[docId]) return;

    // Remove from term postings
    for (const term in this.index.terms) {
      const postings = this.index.terms[term];
      const idx = postings.findIndex(p => p[0] === docId);
      if (idx !== -1) {
        postings.splice(idx, 1);
        if (postings.length === 0) {
          delete this.index.terms[term];
        }
      }
    }

    delete this.index.documents[docId];
    this.index.meta.document_count--;
    this.index.meta.term_count = Object.keys(this.index.terms).length;
    this.dirty = true;
  }

  /**
   * Build index from scratch from the messages directory
   */
  async buildFromMessages(messagesDir: string): Promise<IndexerStats> {
    const startTime = Date.now();
    
    // Clear existing index
    this.index = {
      terms: {},
      documents: {},
      meta: {
        version: 1,
        built_at: new Date().toISOString(),
        document_count: 0,
        term_count: 0,
      },
    };
    this.dirty = true;

    // Read all message directories
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
          build_duration_ms: Date.now() - startTime,
        };
      }
      throw error;
    }

    for (const entry of entries) {
      const recordPath = join(messagesDir, entry, 'record.json');
      
      try {
        const raw = await readFile(recordPath, 'utf8');
        const record = JSON.parse(raw) as Record<string, unknown>;
        
        // Extract searchable fields
        const doc: SearchDocument = {
          message_id: String(record.message_id || entry),
          subject: String(record.subject || ''),
          body_text: this.extractBodyText(record),
          from_name: String((record.from as Record<string, string>)?.name || ''),
          from_email: String((record.from as Record<string, string>)?.email || ''),
          to_emails: this.extractEmails(record.to),
          received_at: String(record.received_at || ''),
          folder_refs: Array.isArray(record.folder_refs) ? record.folder_refs as string[] : [],
          is_read: Boolean((record.flags as Record<string, boolean>)?.is_read),
          is_flagged: Boolean((record.flags as Record<string, boolean>)?.is_flagged),
        };

        this.indexDocument(doc);
      } catch {
        // Skip malformed records
        continue;
      }
    }

    await this.save();

    const stats = await this.getStats();
    return {
      ...stats,
      build_duration_ms: Date.now() - startTime,
    };
  }

  private extractBodyText(record: Record<string, unknown>): string {
    const body = record.body as Record<string, unknown>;
    if (!body) return '';
    
    // Prefer text body, fallback to stripping HTML
    if (typeof body.text === 'string') return body.text;
    if (typeof body.html === 'string') {
      return body.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  private extractEmails(recipients: unknown): string[] {
    if (!Array.isArray(recipients)) return [];
    return recipients
      .filter((r): r is Record<string, string> => typeof r === 'object' && r !== null)
      .map(r => r.email || '')
      .filter(Boolean);
  }

  /**
   * Get current index statistics
   */
  async getStats(): Promise<Omit<IndexerStats, 'build_duration_ms'>> {
    await this.save();
    
    let sizeBytes = 0;
    try {
      const data = await readFile(this.indexPath);
      sizeBytes = data.length;
    } catch {
      // Ignore
    }

    return {
      documents_indexed: this.index.meta.document_count,
      terms_indexed: this.index.meta.term_count,
      index_size_bytes: sizeBytes,
    };
  }

  /**
   * Clear the entire index
   */
  async clear(): Promise<void> {
    this.index = {
      terms: {},
      documents: {},
      meta: {
        version: 1,
        built_at: new Date().toISOString(),
        document_count: 0,
        term_count: 0,
      },
    };
    this.dirty = true;
    await this.save();
    await rm(this.options.indexDir, { recursive: true, force: true });
  }

  /**
   * Access raw index for querying
   */
  getIndex(): Readonly<InvertedIndex> {
    return this.index;
  }
}
