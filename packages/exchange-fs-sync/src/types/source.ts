/**
 * Domain-neutral Source contract
 *
 * The Source abstraction is the minimal ingress discipline for the kernel.
 * It must not contain mailbox-specific fields (mailbox_id, message_id,
 * conversation_id, folder names, or Exchange-specific event kinds).
 *
 * Cursor/checkpoint semantics:
 * - Checkpoint is opaque to the kernel; the Source defines its structure.
 * - Monotonicity: the runner commits a checkpoint only after all records
 *   returned against the prior checkpoint have been successfully applied.
 * - Replay safety: re-pulling with the same checkpoint may return the same
 *   records; deduplication is the runner's responsibility (apply-log).
 * - Duplicate-read tolerance: the Source may return overlapping records
 *   across pulls; the runner must handle this idempotently.
 */

/** Opaque checkpoint token managed by the Source implementation */
export type Checkpoint = string;

/** Provenance metadata for a source record */
export interface SourceProvenance {
  /** Source instance identifier */
  sourceId: string;
  /** Observation timestamp (ISO 8601) */
  observedAt: string;
  /** Optional source-specific version token */
  sourceVersion?: string;
}

/**
 * A single raw record emitted by a Source before kernel compilation.
 * The payload is source-specific and opaque to the kernel contract.
 */
export interface SourceRecord {
  /** Stable, unique record identifier within this source */
  recordId: string;

  /** Optional ordering hint (lexicographically sortable) */
  ordinal?: string;

  /** Opaque payload — source-specific structure */
  payload: unknown;

  /** Provenance metadata */
  provenance: SourceProvenance;
}

/**
 * Output of a Source pull operation.
 */
export interface SourceBatch {
  /** Fetched records */
  records: SourceRecord[];

  /** Checkpoint that was used for this pull */
  priorCheckpoint?: Checkpoint | null;

  /** Next checkpoint to advance to (absent if no advancement is possible) */
  nextCheckpoint?: Checkpoint;

  /** Whether the source believes more records are available */
  hasMore: boolean;

  /** Timestamp when the batch was fetched (ISO 8601) */
  fetchedAt: string;
}

/**
 * Domain-neutral ingress source.
 *
 * Implementations (e.g., ExchangeSource) wrap concrete APIs and map their
 * domain-specific batches into the neutral SourceBatch shape.
 */
export interface Source {
  /** Identity of this source instance */
  readonly sourceId: string;

  /**
   * Pull records starting from the given checkpoint.
   *
   * @param checkpoint - opaque checkpoint from a prior pull, or null/undefined for initial pull
   */
  pull(checkpoint?: Checkpoint | null): Promise<SourceBatch>;
}
