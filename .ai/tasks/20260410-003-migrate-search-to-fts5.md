# Task: Migrate Search from Custom JSON to SQLite FTS5

**Status:** Planned  
**Priority:** High (aligns with SQLite/RBAC architecture)  
**Estimated effort:** 4-6 hours  
**Blocked by:** SQLite setup for RBAC (can be done in parallel)

---

## Summary

Migrate `exchange-fs-sync-search` from custom in-memory JSON indexer to SQLite FTS5. This eliminates a custom component and leverages SQLite that's already planned for RBAC.

**Current**: Custom inverted index in JSON (memory-bound, ~50k doc limit)  
**Target**: SQLite FTS5 virtual table (disk-based, ~1M+ doc limit, BM25 ranking)

---

## Why FTS5 Over Custom JSON

| Aspect | Custom JSON | SQLite FTS5 |
|--------|-------------|-------------|
| **Dependencies** | 0 | **0** (SQLite already planned for RBAC) |
| **Incremental indexing** | ❌ Full rebuild | ✅ Yes, automatic |
| **Ranking** | Basic TF | ✅ BM25 (industry standard) |
| **Phrase queries** | ❌ `"exact phrase"` not supported | ✅ Supported |
| **Prefix search** | ❌ No wildcard | ✅ `project*` |
| **Boolean logic** | ❌ AND only | ✅ AND, OR, NOT |
| **Unicode** | ❌ ASCII regex | ✅ Full Unicode |
| **Stemming** | ❌ No | ✅ Porter stemmer built-in |
| **Scale** | ~50k docs (OOM risk) | ~1M+ docs |
| **Durability** | JSON file | ✅ ACID transactions |
| **Code to maintain** | ~800 lines | ~200 lines (SQL) |
| **Highlighting** | ❌ Manual truncation | ✅ `snippet()` function |

---

## Architecture Decision

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Sync CLI  │  │ Search CLI  │  │  Analytics CLI  │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘ │
│         │                │                   │          │
│         └────────────────┼───────────────────┘          │
│                          ▼                              │
│              ┌─────────────────────┐                    │
│              │   SQLite Database   │                    │
│              │   ┌───────────────┐ │                    │
│              │   │ message_search│ │ ← FTS5 virtual     │
│              │   │   (FTS5)      │ │   table            │
│              │   ├───────────────┤ │                    │
│              │   │ sender_rbac   │ │ ← RBAC table       │
│              │   │  (planned)    │ │   (planned)        │
│              │   ├───────────────┤ │                    │
│              │   │ search_history│ │ ← Optional         │
│              │   └───────────────┘ │                    │
│              └──────────┬──────────┘                    │
│                         │                               │
│              ┌──────────┴──────────┐                    │
│              │   DuckDB (optional  │                    │
│              │    analytics)       │                    │
│              └─────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌─────────────────────────────┐
              │   Filesystem (Source)       │
              │   - messages/               │
              │   - state/                  │
              │   - blobs/                  │
              └─────────────────────────────┘
```

**Principle**: Filesystem remains source of truth. SQLite is a queryable index that can be rebuilt from filesystem at any time.

---

## Implementation Phases

### Phase 1: SQLite Setup (Prerequisite)

**Files to modify/create:**
- `packages/exchange-fs-sync-search/package.json` - Add `better-sqlite3` dependency
- `packages/exchange-fs-sync-search/src/db.ts` - Database connection management

```typescript
// packages/exchange-fs-sync-search/src/db.ts
import Database from 'better-sqlite3';
import { join } from 'node:path';

export function createSearchDb(rootDir: string): Database.Database {
  const dbPath = join(rootDir, '.search.db');
  const db = new Database(dbPath);
  
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  
  return db;
}
```

**Checklist:**
- [ ] Add `better-sqlite3` to dependencies
- [ ] Verify native compilation works in CI
- [ ] Handle Alpine Linux (musl) if using Docker

---

### Phase 2: Schema Setup

**File:** `packages/exchange-fs-sync-search/src/schema.ts`

```typescript
import type Database from 'better-sqlite3';

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
      tokenize='porter unicode61',  -- Stemming + Unicode support
      content='message_content',     -- External content table (optional)
      content_rowid='rowid'
    );
    
    -- Track which messages are indexed (for incremental updates)
    CREATE TABLE IF NOT EXISTS message_index_meta (
      message_id TEXT PRIMARY KEY,
      indexed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      modified_at TEXT  -- For detecting changes
    );
    
    -- Search history (optional, for UX improvements)
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      result_count INTEGER,
      searched_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Index for fast metadata lookups
    CREATE INDEX IF NOT EXISTS idx_search_folder ON message_search(folder_refs);
    CREATE INDEX IF NOT EXISTS idx_search_date ON message_search(received_at);
  `);
}

export function dropSchema(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS message_search;
    DROP TABLE IF EXISTS message_index_meta;
    DROP TABLE IF EXISTS search_history;
  `);
}
```

**Checklist:**
- [ ] Create schema.ts with FTS5 virtual table
- [ ] Add UNINDEXED columns for metadata
- [ ] Add message_index_meta for tracking
- [ ] Test schema creation/destruction

---

### Phase 3: Fts5Indexer Implementation

**File:** `packages/exchange-fs-sync-search/src/fts5-indexer.ts`

```typescript
import type Database from 'better-sqlite3';
import type { SearchDocument, IndexerStats } from './types.js';

export class Fts5Indexer {
  private db: Database.Database;
  
  constructor(db: Database.Database) {
    this.db = db;
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
   * Build index from messages directory (incremental)
   */
  async buildFromMessages(messagesDir: string): Promise<IndexerStats> {
    const startTime = Date.now();
    
    // Get list of already indexed messages with timestamps
    const indexed = this.db.prepare(`
      SELECT message_id, modified_at FROM message_index_meta
    `).all() as Array<{ message_id: string; modified_at: string }>;
    
    const indexedMap = new Map(indexed.map(i => [i.message_id, i.modified_at]));
    
    // Scan filesystem for changes
    const entries = await readdir(messagesDir);
    let added = 0, updated = 0, removed = 0;
    
    for (const entry of entries) {
      const recordPath = join(messagesDir, entry, 'record.json');
      const messageId = decodeURIComponent(entry);
      
      try {
        const stat = await stat(recordPath);
        const mtime = stat.mtime.toISOString();
        
        const existing = indexedMap.get(messageId);
        
        if (!existing) {
          // New message
          const doc = await this.loadDocument(recordPath, messageId);
          this.indexDocument(doc);
          added++;
        } else if (existing < mtime) {
          // Modified message
          const doc = await this.loadDocument(recordPath, messageId);
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
    this.db.exec('INSERT INTO message_search(message_search) VALUES(\'optimize\')');
    
    return {
      documents_indexed: added + updated,
      terms_indexed: this.getTermCount(),
      index_size_bytes: this.getIndexSize(),
      build_duration_ms: Date.now() - startTime,
      details: { added, updated, removed }
    };
  }
  
  private getTermCount(): number {
    // FTS5 doesn't expose term count directly
    // Estimate from segment info
    const result = this.db.prepare(`
      SELECT count(*) as count FROM message_search WHERE rowid IN (
        SELECT rowid FROM message_search LIMIT 1
      )
    `).get() as { count: number };
    return result?.count || 0;
  }
  
  private getIndexSize(): number {
    // Get actual file size
    // Implementation depends on platform
    return 0; // TODO
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
  getStats(): Omit<IndexerStats, 'build_duration_ms'> {
    const docCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM message_index_meta
    `).get() as { count: number };
    
    return {
      documents_indexed: docCount.count,
      terms_indexed: 0, // FTS5 doesn't expose this easily
      index_size_bytes: 0, // Would need filesystem access
    };
  }
  
  private async loadDocument(recordPath: string, messageId: string): Promise<SearchDocument> {
    // Same extraction logic as current indexer
    const raw = await readFile(recordPath, 'utf8');
    const record = JSON.parse(raw);
    
    return {
      message_id: messageId,
      subject: String(record.subject || ''),
      body_text: this.extractBodyText(record),
      from_name: String(record.from?.name || ''),
      from_email: String(record.from?.email || ''),
      to_emails: this.extractEmails(record.to),
      received_at: String(record.received_at || ''),
      folder_refs: Array.isArray(record.folder_refs) ? record.folder_refs : [],
      is_read: Boolean(record.flags?.is_read),
      is_flagged: Boolean(record.flags?.is_flagged),
    };
  }
  
  private extractBodyText(record: Record<string, unknown>): string {
    const body = record.body as Record<string, unknown>;
    if (!body) return '';
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
}
```

**Checklist:**
- [ ] Implement Fts5Indexer class
- [ ] Add incremental indexing (compare mtimes)
- [ ] Add batch transaction support
- [ ] Add optimize/rebuild commands

---

### Phase 4: Fts5QueryEngine Implementation

**File:** `packages/exchange-fs-sync-search/src/fts5-query.ts`

```typescript
import type Database from 'better-sqlite3';
import type { SearchQuery, SearchResult, SearchDocument } from './types.js';

export class Fts5QueryEngine {
  private db: Database.Database;
  
  constructor(db: Database.Database) {
    this.db = db;
  }
  
  search(query: SearchQuery): SearchResult[] {
    const matchExpr = this.buildMatchExpression(query);
    
    // Use rank for BM25 scoring
    const stmt = this.db.prepare(`
      SELECT 
        message_id,
        rank as score,
        -- Highlight matches
        snippet(message_search, 0, '<mark>', '</mark>', '...', 32) as subject_highlight,
        snippet(message_search, 1, '<mark>', '</mark>', '...', 100) as body_highlight,
        -- Include metadata
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
      subject_highlight: string;
      body_highlight: string;
      from_name: string;
      from_email: string;
      received_at: string;
    }>;
    
    return rows.map(row => ({
      message_id: row.message_id,
      score: Math.abs(row.score), // BM25 returns negative values (lower is better in SQLite)
      highlights: [
        { field: 'subject', snippet: row.subject_highlight },
        { field: 'body', snippet: row.body_highlight },
      ].filter(h => h.snippet),
      meta: {
        from: `${row.from_name} <${row.from_email}>`,
        date: row.received_at,
      }
    }));
  }
  
  /**
   * Build FTS5 match expression from query
   * 
   * Supports:
   * - Implicit AND: "project deadline" → project AND deadline
   * - Explicit AND/OR: "project AND deadline", "project OR meeting"
   * - Phrases: "exact phrase"
   * - Prefix: "proj*"
   * - Negation: "project -deadline"
   * - Column filters: subject:project, from:john
   */
  private buildMatchExpression(query: SearchQuery): string {
    const parts: string[] = [];
    
    // Main query (pass through, user can use FTS5 syntax)
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
    
    // Date range filter
    if (query.date_from || query.date_to) {
      // FTS5 doesn't support range queries directly
      // We'll filter in application layer or use auxiliary function
      // For now, document limitation
    }
    
    return parts.join(' AND ');
  }
  
  /**
   * Get suggestions for autocomplete
   */
  getSuggestions(partial: string, limit = 5): string[] {
    // FTS5 doesn't have built-in suggest
    // Could query recent searches or use prefix search
    const stmt = this.db.prepare(`
      SELECT DISTINCT term FROM message_search_vocab
      WHERE term LIKE ?
      ORDER BY doc_count DESC
      LIMIT ?
    `);
    
    // Note: Requires fts5vocab extension
    const rows = stmt.all(`${partial}%`, limit) as Array<{ term: string }>;
    return rows.map(r => r.term);
  }
  
  /**
   * Get document by ID
   */
  getDocument(messageId: string): SearchDocument | null {
    const stmt = this.db.prepare(`
      SELECT * FROM message_search WHERE message_id = ?
    `);
    return stmt.get(messageId) as SearchDocument | null;
  }
  
  /**
   * Get query explanation (for debugging)
   */
  explain(query: SearchQuery): string {
    const matchExpr = this.buildMatchExpression(query);
    return this.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT * FROM message_search WHERE message_search MATCH ?
    `).all(matchExpr) as unknown as string;
  }
}
```

**Checklist:**
- [ ] Implement Fts5QueryEngine with BM25 ranking
- [ ] Use `snippet()` for highlighting
- [ ] Build FTS5 match expression with column filters
- [ ] Add query explanation for debugging

---

### Phase 5: CLI Updates

**File:** `packages/exchange-fs-sync-search/src/index.ts` (update)

Key changes:
1. Use new Fts5Indexer and Fts5QueryEngine
2. Support FTS5 query syntax in help text
3. Add `--explain` flag for debugging
4. Add `--rebuild` flag to force full rebuild

```typescript
// New command: rebuild (force full)
async function rebuildIndex(configPath: string): Promise<void> {
  console.log('[search] Rebuilding index from scratch...');
  const config = await loadConfig({ path: configPath });
  const db = createSearchDb(config.root_dir);
  
  const indexer = new Fts5Indexer(db);
  indexer.clear(); // Full wipe
  
  const stats = await indexer.buildFromMessages(join(config.root_dir, 'messages'));
  console.log('[search] Index rebuilt:');
  console.log(`  Documents: ${stats.documents_indexed}`);
  console.log(`  Added: ${stats.details?.added || 0}`);
  console.log(`  Updated: ${stats.details?.updated || 0}`);
  console.log(`  Removed: ${stats.details?.removed || 0}`);
}

// Update search command to show BM25 explanation
if (args.explain) {
  console.log('Query:', query.q);
  console.log('FTS5 expression:', engine.explain(query));
  return;
}
```

**Updated help text:**
```
Query Syntax (FTS5):
  project deadline       - Both words (AND)
  "project deadline"     - Exact phrase
  project OR deadline    - Either word
  project -deadline      - project but not deadline
  project*               - Prefix search
  subject:project        - In subject only
  from:john              - From specific sender
  
Examples:
  # Complex query
  exchange-fs-sync-search search 'subject:urgent (meeting OR call) -cancelled'
```

---

### Phase 6: Migration Strategy

**Backward Compatibility:**

```typescript
// packages/exchange-fs-sync-search/src/search-engine.ts
export class SearchEngine {
  private backend: 'fts5' | 'json' | 'auto';
  private fts5Engine?: Fts5QueryEngine;
  private jsonEngine?: SearchEngine; // Legacy
  
  constructor(options: SearchOptions & { backend?: 'fts5' | 'json' | 'auto' }) {
    this.backend = options.backend || 'auto';
    
    if (this.backend === 'auto') {
      // Check if FTS5 index exists
      const dbPath = join(options.rootDir, '.search.db');
      this.backend = existsSync(dbPath) ? 'fts5' : 'json';
    }
    
    if (this.backend === 'fts5') {
      const db = createSearchDb(options.root_dir);
      initSchema(db);
      this.fts5Engine = new Fts5QueryEngine(db);
    } else {
      this.jsonEngine = new LegacySearchEngine(options);
    }
  }
  
  async search(query: SearchQuery): Promise<SearchResult[]> {
    if (this.fts5Engine) {
      return this.fts5Engine.search(query);
    }
    return this.jsonEngine!.search(query);
  }
  
  async migrateToFts5(): Promise<void> {
    if (this.backend === 'fts5') return;
    
    console.log('[search] Migrating from JSON to FTS5...');
    // Load JSON index, save to FTS5
    // ...
    this.backend = 'fts5';
  }
}
```

**Migration CLI command:**
```bash
exchange-fs-sync-search migrate --from json --to fts5
```

---

## Testing Plan

### Unit Tests
- [ ] Schema creation/destruction
- [ ] Document indexing
- [ ] Incremental updates (detect changes)
- [ ] Query parsing and match expression building
- [ ] BM25 ranking order
- [ ] Highlight generation

### Integration Tests
- [ ] Index 1000 messages, query performance <100ms
- [ ] Update message, verify index reflects change
- [ ] Delete message, verify removed from index
- [ ] Concurrent read during write (WAL mode)

### Migration Tests
- [ ] Migrate existing JSON index to FTS5
- [ ] Verify search results identical (or better)
- [ ] Rollback plan if needed

---

## Performance Benchmarks

Target metrics:

| Metric | JSON | FTS5 Target | Notes |
|--------|------|-------------|-------|
| Index 10k msgs | 30s | 10s | 3x faster with batch inserts |
| Query latency | 50ms | <10ms | BM25 vs custom TF |
| Memory (10k) | 500MB | 50MB | Disk-based vs in-memory |
| Memory (100k) | OOM | 100MB | FTS5 scales |
| Incremental | N/A (full) | <1s | Only changed docs |
| Disk usage | 50MB | 100MB | Tradeoff for features |

---

## Rollback Plan

If FTS5 migration fails:

1. **Code level**: Keep `SearchEngine` interface, swap implementations
2. **Data level**: JSON index can be regenerated from filesystem anytime
3. **User level**: CLI flag `--backend json` forces old implementation

```bash
# Emergency rollback
exchange-fs-sync-search search --backend json "query"
```

---

## Files to Create/Modify

### New Files
```
packages/exchange-fs-sync-search/
├── src/
│   ├── db.ts                    # Database connection
│   ├── schema.ts                # Schema setup
│   ├── fts5-indexer.ts          # FTS5 indexer
│   ├── fts5-query.ts            # FTS5 query engine
│   └── legacy/                  # Move old implementations
│       ├── indexer.ts
│       └── query.ts
```

### Modified Files
```
packages/exchange-fs-sync-search/
├── package.json                 # Add better-sqlite3
├── src/
│   ├── index.ts                 # Update CLI commands
│   └── types.ts                 # Add backend option
└── README.md                    # Document FTS5 syntax
```

---

## References

- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [BM25 Algorithm](https://en.wikipedia.org/wiki/Okapi_BM25)
- [Porter Stemmer](https://tartarus.org/martin/PorterStemmer/)

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2024-04-10 | Use FTS5 over custom | SQLite already planned, strictly better features |
| 2024-04-10 | Use `better-sqlite3` | Synchronous API, faster for read-heavy workloads |
| 2024-04-10 | Enable WAL mode | Better concurrency for daemon + CLI access |
| 2024-04-10 | Porter stemmer | Built-in, good balance of speed/quality |
| 2024-04-10 | Keep JSON as fallback | Migration safety, can remove in v2 |
