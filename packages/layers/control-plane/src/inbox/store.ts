import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import {
  createInboxEnvelope,
  promoteInboxEnvelope,
  type CreateInboxEnvelopeOptions,
  type InboxEnvelope,
  type InboxEnvelopeStatus,
  type InboxPromotion,
} from './types.js';

export interface InboxStore {
  insert<TPayload>(options: CreateInboxEnvelopeOptions<TPayload>): InboxEnvelope<TPayload>;
  get(envelopeId: string): InboxEnvelope | null;
  list(options?: { status?: InboxEnvelopeStatus; limit?: number }): InboxEnvelope[];
  promote(envelopeId: string, promotion: InboxPromotion): InboxEnvelope;
  close(): void;
}

interface InboxEnvelopeRow {
  envelope_id: string;
  received_at: string;
  source_json: string;
  kind: string;
  authority_json: string;
  payload_json: string;
  status: string;
  promotion_json: string | null;
}

export function defaultInboxDbPath(cwd: string): string {
  return join(cwd, '.ai', 'inbox.db');
}

export class SqliteInboxStore implements InboxStore {
  readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.initSchema();
  }

  insert<TPayload>(options: CreateInboxEnvelopeOptions<TPayload>): InboxEnvelope<TPayload> {
    const envelope = createInboxEnvelope(options);
    this.db.prepare(`
      insert into inbox_envelopes (
        envelope_id, received_at, source_json, kind, authority_json,
        payload_json, status, promotion_json
      ) values (?, ?, ?, ?, ?, ?, ?, null)
    `).run(
      envelope.envelope_id,
      envelope.received_at,
      JSON.stringify(envelope.source),
      envelope.kind,
      JSON.stringify(envelope.authority),
      JSON.stringify(envelope.payload),
      envelope.status,
    );
    return envelope;
  }

  get(envelopeId: string): InboxEnvelope | null {
    const row = this.db
      .prepare(`select * from inbox_envelopes where envelope_id = ?`)
      .get(envelopeId) as InboxEnvelopeRow | undefined;
    return row ? rowToEnvelope(row) : null;
  }

  list(options: { status?: InboxEnvelopeStatus; limit?: number } = {}): InboxEnvelope[] {
    const limit = Math.max(1, Math.min(options.limit ?? 20, 200));
    const rows = options.status
      ? this.db
        .prepare(`select * from inbox_envelopes where status = ? order by received_at desc limit ?`)
        .all(options.status, limit)
      : this.db
        .prepare(`select * from inbox_envelopes order by received_at desc limit ?`)
        .all(limit);
    return (rows as InboxEnvelopeRow[]).map(rowToEnvelope);
  }

  promote(envelopeId: string, promotion: InboxPromotion): InboxEnvelope {
    const existing = this.get(envelopeId);
    if (!existing) {
      throw new Error(`Inbox envelope not found: ${envelopeId}`);
    }
    const promoted = promoteInboxEnvelope(existing, promotion);
    this.db.prepare(`
      update inbox_envelopes
      set status = ?, promotion_json = ?
      where envelope_id = ?
    `).run(promoted.status, JSON.stringify(promoted.promotion), envelopeId);
    return promoted;
  }

  close(): void {
    this.db.close();
  }

  private initSchema(): void {
    this.db.exec(`
      create table if not exists inbox_envelopes (
        envelope_id text primary key,
        received_at text not null,
        source_json text not null,
        kind text not null,
        authority_json text not null,
        payload_json text not null,
        status text not null,
        promotion_json text
      );

      create index if not exists idx_inbox_envelopes_status_received
        on inbox_envelopes(status, received_at desc);
    `);
  }
}

function rowToEnvelope(row: InboxEnvelopeRow): InboxEnvelope {
  return {
    envelope_id: row.envelope_id,
    received_at: row.received_at,
    source: JSON.parse(row.source_json) as InboxEnvelope['source'],
    kind: row.kind as InboxEnvelope['kind'],
    authority: JSON.parse(row.authority_json) as InboxEnvelope['authority'],
    payload: JSON.parse(row.payload_json) as InboxEnvelope['payload'],
    status: row.status as InboxEnvelopeStatus,
    promotion: row.promotion_json ? JSON.parse(row.promotion_json) as InboxEnvelope['promotion'] : undefined,
  };
}
