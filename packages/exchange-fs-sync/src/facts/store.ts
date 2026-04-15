/**
 * SQLite Fact Store
 *
 * Durable, append-safe, duplicate-resistant persistence for canonical facts.
 */

import Database from "better-sqlite3";
import type { Fact, FactStore, FactType, FactProvenance } from "./types.js";

function rowToFact(row: Record<string, unknown>): Fact {
  return {
    fact_id: String(row.fact_id),
    fact_type: String(row.fact_type) as FactType,
    provenance: JSON.parse(String(row.provenance_json)) as FactProvenance,
    payload_json: String(row.payload_json),
    created_at: String(row.created_at),
  };
}

export interface SqliteFactStoreOptions {
  db: Database.Database;
}

export class SqliteFactStore implements FactStore {
  readonly db: Database.Database;

  constructor(opts: SqliteFactStoreOptions) {
    this.db = opts.db;
  }

  initSchema(): void {
    this.db.exec(`
      create table if not exists facts (
        fact_id text primary key,
        fact_type text not null,
        source_id text not null,
        source_record_id text not null,
        source_version text,
        source_cursor text,
        provenance_json text not null,
        payload_json text not null,
        created_at text not null default (datetime('now'))
      );

      create index if not exists idx_facts_source_record
        on facts(source_id, source_record_id);

      create index if not exists idx_facts_source_cursor
        on facts(source_id, source_cursor, created_at);

      create index if not exists idx_facts_type
        on facts(fact_type, created_at);
    `);
  }

  ingest(fact: Omit<Fact, "created_at">): { fact: Fact; isNew: boolean } {
    const existing = this.db
      .prepare("select * from facts where fact_id = ?")
      .get(fact.fact_id) as Record<string, unknown> | undefined;

    if (existing) {
      return { fact: rowToFact(existing), isNew: false };
    }

    this.db
      .prepare(
        `insert into facts (
          fact_id, fact_type, source_id, source_record_id, source_version,
          source_cursor, provenance_json, payload_json, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(
        fact.fact_id,
        fact.fact_type,
        fact.provenance.source_id,
        fact.provenance.source_record_id,
        fact.provenance.source_version ?? null,
        fact.provenance.source_cursor ?? null,
        JSON.stringify(fact.provenance),
        fact.payload_json,
      );

    const row = this.db
      .prepare("select * from facts where fact_id = ?")
      .get(fact.fact_id) as Record<string, unknown>;
    return { fact: rowToFact(row), isNew: true };
  }

  getById(factId: string): Fact | undefined {
    const row = this.db
      .prepare("select * from facts where fact_id = ?")
      .get(factId) as Record<string, unknown> | undefined;
    return row ? rowToFact(row) : undefined;
  }

  getBySourceRecord(sourceId: string, sourceRecordId: string): Fact | undefined {
    const row = this.db
      .prepare("select * from facts where source_id = ? and source_record_id = ?")
      .get(sourceId, sourceRecordId) as Record<string, unknown> | undefined;
    return row ? rowToFact(row) : undefined;
  }

  getFactsForCursor(sourceId: string, sourceCursor: string): Fact[] {
    const rows = this.db
      .prepare(
        "select * from facts where source_id = ? and source_cursor = ? order by created_at asc",
      )
      .all(sourceId, sourceCursor) as Record<string, unknown>[];
    return rows.map(rowToFact);
  }

  close(): void {
    this.db.close();
  }
}
