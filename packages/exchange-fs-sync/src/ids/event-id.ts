import { createHash } from "node:crypto";
import type {
  EventId,
  EventKind,
  MessageId,
  NormalizedPayload,
  SourceVersion,
} from "../types/normalized.js";

function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Deterministic JSON stringify:
 * - sorts object keys
 * - stable for identical semantic payloads
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();

  const entries = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`,
  );

  return `{${entries.join(",")}}`;
}

/**
 * Hash of normalized payload (semantic identity)
 */
export function hashNormalizedPayload(
  payload: NormalizedPayload,
): string {
  const stable = stableStringify(payload);
  return sha256(stable);
}

export interface BuildEventIdInput {
  scope_id: string;
  message_id: MessageId;
  event_kind: EventKind;
  source_version?: SourceVersion;
  payload?: NormalizedPayload;
}

/**
 * Event identity rules:
 *
 * upsert:
 *   prefer source_version (Graph changeKey)
 *   fallback to payload hash
 *
 * delete:
 *   source_version OR message_id (no payload)
 *
 * final form:
 *   evt_<sha256(material)>
 */
export function buildEventId(input: BuildEventIdInput): EventId {
  const base: Record<string, unknown> = {
    scope_id: input.scope_id,
    message_id: input.message_id,
    event_kind: input.event_kind,
  };

  if (input.event_kind === "created" || input.event_kind === "updated" || input.event_kind === "upsert") {
    if (input.source_version) {
      base.source_version = input.source_version;
    } else if (input.payload) {
      base.payload_hash = hashNormalizedPayload(input.payload);
    } else {
      throw new Error("created/updated/upsert event requires source_version or payload");
    }
  }

  if (input.event_kind === "deleted" || input.event_kind === "delete") {
    base.source_version = input.source_version ?? null;
  }

  const material = stableStringify(base);
  const digest = sha256(material);

  return `evt_${digest}`;
}

export function computeEventId(input: BuildEventIdInput): EventId;
export function computeEventId(input: BuildEventIdInput | {
  scope_id: string;
  message_id: MessageId;
  event_kind: EventKind;
  source_version?: SourceVersion;
  payload?: NormalizedPayload;
}): EventId;
export function computeEventId(input: BuildEventIdInput): EventId {
  return buildEventId(input);
}
