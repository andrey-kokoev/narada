/**
 * Search types and interfaces
 */

export interface SearchDocument {
  message_id: string;
  subject: string;
  body_text: string;
  from_name: string;
  from_email: string;
  to_emails: string[];
  received_at: string;
  folder_refs: string[];
  is_read: boolean;
  is_flagged: boolean;
}

export interface SearchIndex {
  version: number;
  built_at: string;
  document_count: number;
  term_count: number;
}

export interface SearchResult {
  message_id: string;
  score: number;
  highlights: {
    field: string;
    snippet: string;
  }[];
}

export interface SearchQuery {
  q: string;
  fields?: ('subject' | 'body' | 'from' | 'to')[];
  folder_refs?: string[];
  is_read?: boolean;
  is_flagged?: boolean;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface SearchOptions {
  rootDir: string;
  indexDir?: string;
  caseSensitive?: boolean;
  minTermLength?: number;
  stopWords?: Set<string>;
}

export interface IndexerStats {
  documents_indexed: number;
  terms_indexed: number;
  index_size_bytes: number;
  build_duration_ms: number;
}
