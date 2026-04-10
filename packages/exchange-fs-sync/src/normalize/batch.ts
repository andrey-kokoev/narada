
import type { GraphDeltaMessage } from "../types/graph.js";
import type {
  AdapterScope,
  AttachmentPolicy,
  BodyPolicy,
  MailboxId,
  NormalizedBatch,
  NormalizedEvent,
} from "../types/normalized.js";
import { SCHEMA_VERSION } from "../types/normalized.js";
import { normalizeDeltaEntry } from "./delta-entry.js";

export interface NormalizeBatchInput {
  mailbox_id: MailboxId;
  adapter_scope: AdapterScope;
  prior_cursor?: string | null;
  next_cursor: string;
  fetched_at: string;
  observed_at?: string;
  messages: GraphDeltaMessage[];
  has_more: boolean;
  body_policy: BodyPolicy;
  attachment_policy: AttachmentPolicy;
  include_headers: boolean;
  normalize_folder_ref: (parentFolderId?: string) => string[];
  normalize_flagged: (flag: GraphDeltaMessage["flag"]) => boolean;
  classify_removed_as_delete?: (message: GraphDeltaMessage) => boolean;
}

function dedupeEventsById(events: NormalizedEvent[]): NormalizedEvent[] {
  const byId = new Map<string, NormalizedEvent>();

  for (const event of events) {
    byId.set(event.event_id, event);
  }

  return [...byId.values()].sort((a, b) => a.event_id.localeCompare(b.event_id));
}

export function normalizeBatch(input: NormalizeBatchInput): NormalizedBatch {
  const observed_at = input.observed_at ?? input.fetched_at;

  const events = input.messages.map((graph_message) =>
    normalizeDeltaEntry({
      mailbox_id: input.mailbox_id,
      graph_message,
      observed_at,
      body_policy: input.body_policy,
      attachment_policy: input.attachment_policy,
      include_headers: input.include_headers,
      normalize_folder_ref: input.normalize_folder_ref,
      normalize_flagged: input.normalize_flagged,
      classify_removed_as_delete: input.classify_removed_as_delete,
    }),
  );

  return {
    schema_version: SCHEMA_VERSION,
    mailbox_id: input.mailbox_id,
    adapter_scope: input.adapter_scope,
    ...(input.prior_cursor !== undefined ? { prior_cursor: input.prior_cursor } : {}),
    next_cursor: input.next_cursor,
    fetched_at: input.fetched_at,
    has_more: input.has_more,
    events: dedupeEventsById(events),
  };
}
