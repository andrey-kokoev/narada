/**
 * SourceRecord-to-Fact compiler
 *
 * Maps any SourceRecord into a canonical Fact envelope.
 * Source-specific semantics are inferred from the payload shape;
 * the envelope remains source-neutral.
 */

import type { SourceRecord } from "../types/source.js";
import type { Fact, FactType } from "./types.js";
import { buildFactId } from "../ids/fact-id.js";

function inferFactType(record: SourceRecord): FactType {
  const payload = record.payload as Record<string, unknown> | undefined;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (payload.kind === "timer.tick") {
      return "timer.tick";
    }
    if (payload.kind === "webhook.received") {
      return "webhook.received";
    }
    if (payload.kind === "filesystem.change") {
      return "filesystem.change";
    }
    const eventKind = payload.event_kind;
    if (typeof eventKind === "string") {
      if (eventKind === "created" || eventKind === "upsert") {
        return "mail.message.discovered";
      }
      if (eventKind === "updated") {
        return "mail.message.changed";
      }
      if (eventKind === "deleted" || eventKind === "delete") {
        return "mail.message.removed";
      }
    }
  }
  return "mail.message.discovered";
}

export function sourceRecordToFact(
  record: SourceRecord,
  sourceCursor: string | null,
): Omit<Fact, "created_at"> {
  const factType = inferFactType(record);

  const provenance = {
    source_id: record.provenance.sourceId,
    source_record_id: record.recordId,
    source_version: record.provenance.sourceVersion ?? null,
    source_cursor: sourceCursor ?? null,
    observed_at: record.provenance.observedAt,
  };

  const payload = {
    record_id: record.recordId,
    ordinal: record.ordinal,
    event: record.payload,
  };

  const factId = buildFactId({
    fact_type: factType,
    provenance,
    payload,
  });

  return {
    fact_id: factId,
    fact_type: factType,
    provenance,
    payload_json: JSON.stringify(payload),
  };
}
