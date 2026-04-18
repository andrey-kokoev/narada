import type { GraphDeltaMessage } from "../types/graph.js";
import type {
  AttachmentPolicy,
  BodyPolicy,
  MailboxId,
  NormalizedExtensions,
  NormalizedPayload,
} from "../types/normalized.js";
import { SCHEMA_VERSION } from "../types/normalized.js";
import { normalizeAttachments } from "./attachments.js";
import { normalizeRecipient, normalizeRecipientList } from "./addresses.js";
import { normalizeBody } from "./body.js";

export interface NormalizeMessageInput {
  mailbox_id: MailboxId;
  message_id?: string;
  graph_message: GraphDeltaMessage;
  body_policy: BodyPolicy;
  attachment_policy: AttachmentPolicy;
  include_headers: boolean;
  normalize_folder_ref: (graph_message: GraphDeltaMessage) => string[];
  normalize_flagged: (flag: GraphDeltaMessage["flag"]) => boolean;
}

function sortStrings(values?: string[]): string[] {
  if (!values?.length) {
    return [];
  }

  return [...values].sort((a, b) => a.localeCompare(b));
}

function normalizeImportance(
  value?: string,
): "low" | "normal" | "high" | undefined {
  if (value === "low" || value === "normal" || value === "high") {
    return value;
  }

  return undefined;
}

function normalizeHeaders(
  headers?: GraphDeltaMessage["internetMessageHeaders"],
) {
  if (!headers?.length) {
    return undefined;
  }

  const values: Record<string, string[]> = {};

  for (const header of headers) {
    const name = header.name?.trim().toLowerCase();
    const value = header.value?.trim();

    if (!name || value === undefined) {
      continue;
    }

    values[name] ??= [];
    values[name].push(value);
  }

  const keys = Object.keys(values).sort((a, b) => a.localeCompare(b));
  if (!keys.length) {
    return undefined;
  }

  return {
    values: Object.fromEntries(keys.map((key) => [key, values[key]])),
  };
}

function buildSourceExtensions(
  message: GraphDeltaMessage,
): NormalizedExtensions | undefined {
  const graph: Record<string, unknown> = {};

  if (message.id !== undefined) graph.raw_id = message.id;
  if (message.changeKey !== undefined) graph.change_key = message.changeKey;
  if (message.parentFolderId !== undefined) {
    graph.parent_folder_id = message.parentFolderId;
  }
  if (message.webLink !== undefined) graph.web_link = message.webLink;
  if (message.inferenceClassification !== undefined) {
    graph.inference_classification = message.inferenceClassification;
  }
  if (message.flag !== undefined) graph.flag = message.flag;
  if (message.uniqueBody !== undefined) graph.unique_body = message.uniqueBody;

  if (!Object.keys(graph).length) {
    return undefined;
  }

  return {
    namespaces: {
      graph,
    },
  };
}

export function normalizeMessageToPayload(
  input: NormalizeMessageInput,
): NormalizedPayload {
  const {
    mailbox_id,
    graph_message,
    body_policy,
    attachment_policy,
    include_headers,
    normalize_folder_ref,
    normalize_flagged,
  } = input;
  const message_id = input.message_id ?? graph_message.id;

  const from = normalizeRecipient(graph_message.from);
  const sender = normalizeRecipient(graph_message.sender);
  const headers = include_headers
    ? normalizeHeaders(graph_message.internetMessageHeaders)
    : undefined;
  const sourceExtensions = buildSourceExtensions(graph_message);
  const importance = normalizeImportance(graph_message.importance);

  const payload: NormalizedPayload = {
    schema_version: SCHEMA_VERSION,
    mailbox_id,
    message_id,
    ...(graph_message.conversationId
      ? { conversation_id: graph_message.conversationId }
      : {}),
    ...(graph_message.internetMessageId
      ? { internet_message_id: graph_message.internetMessageId }
      : {}),
    subject: graph_message.subject ?? "",
    ...(from ? { from } : {}),
    ...(sender ? { sender } : {}),
    reply_to: normalizeRecipientList(graph_message.replyTo),
    to: normalizeRecipientList(graph_message.toRecipients),
    cc: normalizeRecipientList(graph_message.ccRecipients),
    bcc: normalizeRecipientList(graph_message.bccRecipients),
    ...(graph_message.sentDateTime
      ? { sent_at: graph_message.sentDateTime }
      : {}),
    ...(graph_message.receivedDateTime
      ? { received_at: graph_message.receivedDateTime }
      : {}),
    ...(graph_message.createdDateTime
      ? { created_at: graph_message.createdDateTime }
      : {}),
    ...(graph_message.lastModifiedDateTime
      ? { last_modified_at: graph_message.lastModifiedDateTime }
      : {}),
    folder_refs: normalize_folder_ref(graph_message),
    category_refs: sortStrings(graph_message.categories),
    flags: {
      is_read: Boolean(graph_message.isRead),
      is_draft: Boolean(graph_message.isDraft),
      is_flagged: normalize_flagged(graph_message.flag),
      has_attachments: Boolean(graph_message.hasAttachments),
      ...(importance ? { importance } : {}),
    },
    ...(headers ? { headers } : {}),
    body: normalizeBody(
      graph_message.body,
      body_policy,
      graph_message.bodyPreview,
    ),
    attachments: normalizeAttachments(
      graph_message.attachments,
      attachment_policy,
    ),
    ...(sourceExtensions ? { source_extensions: sourceExtensions } : {}),
  };

  return payload;
}


// Alias for backward compatibility with tests
export { normalizeMessageToPayload as normalizeMessage };
