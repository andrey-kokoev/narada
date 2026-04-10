
import type { GraphDeltaMessage } from "../types/graph.js";
import type {
  AttachmentPolicy,
  BodyPolicy,
  MailboxId,
  NormalizedEvent,
} from "../types/normalized.js";
import { SCHEMA_VERSION } from "../types/normalized.js";
import { buildEventId } from "../ids/event-id.js";
import { normalizeMessageToPayload } from "./message.js";

export interface NormalizeDeltaEntryInput {
  mailbox_id: MailboxId;
  graph_message: GraphDeltaMessage;
  observed_at: string;
  body_policy: BodyPolicy;
  attachment_policy: AttachmentPolicy;
  include_headers: boolean;
  normalize_folder_ref: (parentFolderId?: string) => string[];
  normalize_flagged: (flag: GraphDeltaMessage["flag"]) => boolean;
  classify_removed_as_delete?: (message: GraphDeltaMessage) => boolean;
}

function resolveMessageId(graphMessage: GraphDeltaMessage): string {
  const id = graphMessage.id?.trim();

  if (!id) {
    throw new Error("Graph delta entry is missing id");
  }

  return id;
}

function buildDeleteEvent(input: NormalizeDeltaEntryInput): NormalizedEvent {
  const { mailbox_id, graph_message, observed_at } = input;
  const message_id = resolveMessageId(graph_message);
  const source_version = graph_message.changeKey?.trim();

  const event_id = buildEventId({
    mailbox_id,
    message_id,
    event_kind: "delete",
    source_version,
  });

  return {
    schema_version: SCHEMA_VERSION,
    event_id,
    mailbox_id,
    message_id,
    ...(graph_message.conversationId
      ? { conversation_id: graph_message.conversationId }
      : {}),
    source_item_id: message_id,
    ...(source_version ? { source_version } : {}),
    event_kind: "delete",
    observed_at,
  };
}

function buildUpsertEvent(input: NormalizeDeltaEntryInput): NormalizedEvent {
  const {
    mailbox_id,
    graph_message,
    observed_at,
    body_policy,
    attachment_policy,
    include_headers,
    normalize_folder_ref,
    normalize_flagged,
  } = input;

  const message_id = resolveMessageId(graph_message);

  const payload = normalizeMessageToPayload({
    mailbox_id,
    message_id,
    graph_message,
    body_policy,
    attachment_policy,
    include_headers,
    normalize_folder_ref,
    normalize_flagged,
  });

  const source_version = graph_message.changeKey?.trim();

  const event_id = buildEventId({
    mailbox_id,
    message_id,
    event_kind: "upsert",
    source_version,
    payload,
  });

  return {
    schema_version: SCHEMA_VERSION,
    event_id,
    mailbox_id,
    message_id,
    ...(graph_message.conversationId
      ? { conversation_id: graph_message.conversationId }
      : {}),
    source_item_id: message_id,
    ...(source_version ? { source_version } : {}),
    event_kind: "upsert",
    observed_at,
    payload,
  };
}

export function normalizeDeltaEntry(
  input: NormalizeDeltaEntryInput,
): NormalizedEvent {
  const removed = input.graph_message["@removed"];

  if (removed) {
    const shouldDelete =
      input.classify_removed_as_delete?.(input.graph_message) ?? true;

    if (!shouldDelete) {
      throw new Error(
        `Removed delta entry ${input.graph_message.id ?? "<unknown>"} cannot be classified as delete`,
      );
    }

    return buildDeleteEvent(input);
  }

  return buildUpsertEvent(input);
}
