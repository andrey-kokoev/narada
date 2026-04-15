/**
 * ExchangeSource — Exchange-specific Source implementation
 *
 * Wraps a GraphAdapter and maps NormalizedBatch into the domain-neutral
 * SourceBatch shape. All mailbox-specific concepts remain inside the
 * payload; the kernel contract sees only opaque records.
 */

import type { GraphAdapter } from "../../types/runtime.js";
import type { NormalizedEvent } from "../../types/normalized.js";
import type { Checkpoint, Source, SourceBatch, SourceRecord } from "../../types/source.js";

export interface ExchangeSourceOptions {
  /** Underlying Exchange adapter */
  adapter: GraphAdapter;
  /** Source instance identity */
  sourceId: string;
}

export class ExchangeSource implements Source {
  readonly sourceId: string;
  private readonly adapter: GraphAdapter;

  constructor(opts: ExchangeSourceOptions) {
    this.sourceId = opts.sourceId;
    this.adapter = opts.adapter;
  }

  async pull(checkpoint?: Checkpoint | null): Promise<SourceBatch> {
    const batch = await this.adapter.fetch_since(checkpoint ?? null);
    const fetchedAt = batch.fetched_at;

    const records: SourceRecord[] = batch.events.map((event: NormalizedEvent) =>
      this.toSourceRecord(event, fetchedAt),
    );

    return {
      records,
      priorCheckpoint: batch.prior_cursor ?? checkpoint ?? null,
      nextCheckpoint: batch.next_cursor ?? undefined,
      hasMore: batch.has_more,
      fetchedAt,
    };
  }

  private toSourceRecord(event: NormalizedEvent, fetchedAt: string): SourceRecord {
    return {
      recordId: event.event_id,
      ordinal: event.observed_at ?? event.received_at ?? fetchedAt,
      payload: event,
      provenance: {
        sourceId: this.sourceId,
        observedAt: event.observed_at ?? fetchedAt,
        sourceVersion: event.source_version,
      },
    };
  }
}
