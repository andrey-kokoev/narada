/**
 * Search query engine
 * 
 * Provides full-text search over the inverted index.
 * Supports boolean AND queries and basic filtering.
 */

import type { SearchQuery, SearchResult, SearchDocument, SearchOptions } from './types.js';
import { MessageIndexer } from './indexer.js';

interface ScoredDocument {
  message_id: string;
  score: number;
  doc: SearchDocument;
  term_matches: Map<string, number>;
}

export class SearchEngine {
  private indexer: MessageIndexer;

  constructor(options: SearchOptions) {
    this.indexer = new MessageIndexer(options);
  }

  /**
   * Load existing index
   */
  async load(): Promise<boolean> {
    return this.indexer.load();
  }

  /**
   * Build index from messages directory
   */
  async build(messagesDir: string) {
    return this.indexer.buildFromMessages(messagesDir);
  }

  /**
   * Search the index
   */
  search(query: SearchQuery): SearchResult[] {
    const index = this.indexer.getIndex();

    // Tokenize query
    const queryTerms = this.tokenize(query.q ?? "");
    if (queryTerms.length === 0) {
      return [];
    }

    // Find documents matching ALL query terms (AND logic)
    const candidateScores = new Map<string, ScoredDocument>();

    for (const term of queryTerms) {
      const postings = index.terms[term] || [];
      
      for (const [docId, freq] of postings) {
        const doc = index.documents[docId];
        if (!doc) continue;

        // Apply filters
        if (!this.matchesFilters(doc, query)) {
          continue;
        }

        let scored = candidateScores.get(docId);
        if (!scored) {
          scored = {
            message_id: docId,
            score: 0,
            doc,
            term_matches: new Map(),
          };
          candidateScores.set(docId, scored);
        }
        
        // Simple TF scoring
        scored.term_matches.set(term, freq);
      }
    }

    // Calculate final scores and filter for documents with ALL terms
    const results: ScoredDocument[] = [];
    for (const scored of candidateScores.values()) {
      if (scored.term_matches.size === queryTerms.length) {
        // Score is sum of term frequencies with field boost
        let score = 0;
        for (const [term, freq] of scored.term_matches.entries()) {
          const fieldBoost = this.calculateFieldBoost(term, scored.doc, query.fields);
          score += freq * fieldBoost;
        }
        scored.score = score;
        results.push(scored);
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 20;
    const paginated = results.slice(offset, offset + limit);

    // Generate results with highlights
    return paginated.map(r => ({
      message_id: r.message_id,
      score: r.score,
      highlights: this.generateHighlights(r.doc, r.term_matches),
    }));
  }

  private tokenize(text: string): string[] {
    if (!text) return [];
    const normalized = text.toLowerCase();
    const words = normalized.match(/\b[a-z0-9]+\b/g) || [];
    return words.filter(w => w.length >= 2);
  }

  private matchesFilters(doc: SearchDocument, query: SearchQuery): boolean {
    // Folder filter
    if (query.folder_refs?.length) {
      const hasFolder = query.folder_refs.some(f => doc.folder_refs.includes(f));
      if (!hasFolder) return false;
    }

    // Read status filter
    if (query.is_read !== undefined) {
      if (doc.is_read !== query.is_read) return false;
    }

    // Flagged filter
    if (query.is_flagged !== undefined) {
      if (doc.is_flagged !== query.is_flagged) return false;
    }

    // Date range filter
    if (query.date_from || query.date_to) {
      const receivedDate = new Date(doc.received_at);
      if (query.date_from && receivedDate < new Date(query.date_from)) {
        return false;
      }
      if (query.date_to && receivedDate > new Date(query.date_to)) {
        return false;
      }
    }

    return true;
  }

  private calculateFieldBoost(
    term: string,
    doc: SearchDocument,
    fields?: SearchQuery['fields'],
  ): number {
    if (!fields || fields.length === 0) {
      // Default: subject gets 2x boost
      const inSubject = doc.subject.toLowerCase().includes(term);
      return inSubject ? 2.0 : 1.0;
    }

    let boost = 1.0;
    const termLower = term.toLowerCase();

    for (const field of fields) {
      switch (field) {
        case 'subject':
          if (doc.subject.toLowerCase().includes(termLower)) boost += 2.0;
          break;
        case 'body':
          if (doc.body_text.toLowerCase().includes(termLower)) boost += 1.0;
          break;
        case 'from':
          if (doc.from_email.toLowerCase().includes(termLower) ||
              doc.from_name.toLowerCase().includes(termLower)) {
            boost += 1.5;
          }
          break;
        case 'to':
          if (doc.to_emails.some(e => e.toLowerCase().includes(termLower))) {
            boost += 1.0;
          }
          break;
      }
    }

    return boost;
  }

  private generateHighlights(
    doc: SearchDocument,
    termMatches: Map<string, number>,
  ): Array<{ field: string; snippet: string }> {
    const highlights: Array<{ field: string; snippet: string }> = [];
    const terms = Array.from(termMatches.keys());

    // Subject highlight
    if (terms.some(t => doc.subject.toLowerCase().includes(t))) {
      highlights.push({
        field: 'subject',
        snippet: this.truncate(doc.subject, 100),
      });
    }

    // Body highlight
    const bodySnippet = this.extractSnippet(doc.body_text, terms);
    if (bodySnippet) {
      highlights.push({
        field: 'body',
        snippet: bodySnippet,
      });
    }

    return highlights;
  }

  private extractSnippet(text: string, terms: string[]): string | null {
    if (!text) return null;
    
    const textLower = text.toLowerCase();
    
    // Find first occurrence of any term
    let firstPos = -1;
    for (const term of terms) {
      const pos = textLower.indexOf(term);
      if (pos !== -1 && (firstPos === -1 || pos < firstPos)) {
        firstPos = pos;
      }
    }
    
    if (firstPos === -1) return null;

    // Extract context around the match
    const contextSize = 80;
    const start = Math.max(0, firstPos - contextSize / 2);
    const end = Math.min(text.length, firstPos + contextSize);
    
    let snippet = text.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    
    return snippet;
  }

  private truncate(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  }

  /**
   * Get document by ID
   */
  getDocument(messageId: string): SearchDocument | null {
    const index = this.indexer.getIndex();
    return index.documents[messageId] || null;
  }

  /**
   * Get index statistics
   */
  async getStats() {
    return this.indexer.getStats();
  }
}
