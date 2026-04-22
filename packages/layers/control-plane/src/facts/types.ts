/**
 * Fact envelope types
 *
 * Facts are the canonical durable and replay-stable boundary of the kernel.
 * They are source-neutral at the envelope level; source-specific semantics
 * live inside the payload_json.
 */

export type FactType =
  | "mail.message.discovered"
  | "mail.message.changed"
  | "mail.message.removed"
  // Email marketing Operation:
  | "campaign.request.discovered"
  // Future expansion points:
  | "timer.tick"
  | "filesystem.change"
  | "webhook.received";

export interface FactProvenance {
  /** Source instance that produced this fact */
  source_id: string;
  /** Stable record identifier within the source */
  source_record_id: string;
  /** Optional source-specific version token */
  source_version?: string | null;
  /** Checkpoint / cursor context from the source pull */
  source_cursor?: string | null;
  /** When the source observed the record (ISO 8601) */
  observed_at: string;
}

export interface Fact {
  /** Deterministic, replay-stable fact identity */
  fact_id: string;
  /** Canonical fact classification */
  fact_type: FactType;
  /** Provenance metadata */
  provenance: FactProvenance;
  /** Opaque JSON payload — source-specific structure */
  payload_json: string;
  /** Ingestion timestamp (ISO 8601) */
  created_at: string;
}

export interface FactStore {
  readonly db: import("better-sqlite3").Database;
  initSchema(): void;
  /** Idempotent insert — returns existing fact if already present */
  ingest(fact: Omit<Fact, "created_at">): { fact: Fact; isNew: boolean };
  getById(factId: string): Fact | undefined;
  getBySourceRecord(sourceId: string, sourceRecordId: string): Fact | undefined;
  getFactsForCursor(sourceId: string, sourceCursor: string): Fact[];
  /** Return facts that have not yet been admitted to the control plane */
  getUnadmittedFacts(sourceId?: string, limit?: number): Fact[];
  /** Mark facts as admitted (idempotent) */
  markAdmitted(factIds: string[]): void;
  /** Query stored facts for a scope with optional filters */
  getFactsByScope(
    scopeId: string,
    selector?: import('../types/selector.js').Selector,
  ): Fact[];
  close(): void;
}

/** Read-only view of FactStore for observability and UI consumption */
export type FactStoreView = Omit<
  FactStore,
  "initSchema" | "close" | "ingest" | "markAdmitted"
>;
