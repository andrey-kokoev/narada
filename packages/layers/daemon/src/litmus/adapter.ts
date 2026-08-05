/**
 * Litmus Inbox Adapter
 *
 * GraphAdapter implementation that reads messages from a litmus sandbox
 * `inbox.jsonl` file instead of Microsoft Graph. Mirrors mock-adapter.ts:
 * each JSONL line ({id, conversation_id, from, subject, body, at}) is mapped
 * to a GraphDeltaMessage and normalized through the stock normalizeBatch,
 * so the full mailbox vertical (ExchangeSource -> applySourceRecord -> facts)
 * runs unchanged.
 *
 * The cursor is a JSON-encoded line offset ({ "offset": N }) so each poll
 * ingests only newly appended lines. Duplicate deliveries (at-least-once)
 * carry the same message id and are deduped downstream by the apply log.
 */

import { readFile } from "node:fs/promises";
import type { GraphDeltaMessage } from "@narada-core/control-plane";
import type {
  AdapterScope,
  AttachmentPolicy,
  BodyPolicy,
  NormalizedBatch,
} from "@narada-core/control-plane";
import type { GraphAdapter } from "@narada-core/control-plane";
import { normalizeBatch } from "@narada-core/control-plane";

export interface LitmusInboxAdapterOptions {
  /** Absolute path to the sandbox inbox.jsonl */
  inboxPath: string;
  /** Mailbox identifier */
  mailbox_id: string;
  /** Adapter scope configuration */
  adapter_scope: AdapterScope;
  /** Body content policy */
  body_policy: BodyPolicy;
  /** Attachment handling policy */
  attachment_policy: AttachmentPolicy;
  /** Whether to include full headers */
  include_headers: boolean;
  /** Function to extract folder refs from message */
  normalize_folder_ref: (graph_message: GraphDeltaMessage) => string[];
  /** Function to determine if message is flagged */
  normalize_flagged: (flag: GraphDeltaMessage["flag"]) => boolean;
  /** Optional admission filter; skipped messages never become facts. */
  filter?: (msg: LitmusInboxLine) => boolean;
}

interface LitmusInboxLine {
  id: string;
  conversation_id: string;
  from: string;
  subject?: string;
  body?: string;
  at?: number;
}

interface LitmusCursor {
  offset: number;
}

/** Deterministic ISO timestamp from a virtual tick (1s per tick, fixed epoch). */
function tickToIso(tick: number): string {
  return new Date(1_700_000_000_000 + tick * 1000).toISOString();
}

function parseCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(cursor) as LitmusCursor;
    return typeof parsed.offset === "number" && parsed.offset >= 0 ? parsed.offset : 0;
  } catch {
    return 0;
  }
}

export class LitmusInboxAdapter implements GraphAdapter {
  constructor(private readonly options: LitmusInboxAdapterOptions) {}

  async fetch_since(cursor?: string | null): Promise<NormalizedBatch> {
    const offset = parseCursor(cursor);

    let lines: string[] = [];
    try {
      const text = await readFile(this.options.inboxPath, "utf8");
      lines = text.split("\n").filter((l) => l.trim() !== "");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      // Missing inbox.jsonl behaves as an empty inbox.
    }

    const fresh = lines.slice(offset);
    const messages: GraphDeltaMessage[] = [];
    for (const line of fresh) {
      let msg: LitmusInboxLine;
      try {
        msg = JSON.parse(line) as LitmusInboxLine;
      } catch {
        // Skip unparseable lines rather than poisoning the batch.
        continue;
      }
      if (this.options.filter && !this.options.filter(msg)) {
        // Admission rules rejected this message; don't emit a fact.
        continue;
      }
      messages.push(this.toGraphMessage(msg));
    }

    const nextOffset = lines.length;

    return normalizeBatch({
      mailbox_id: this.options.mailbox_id,
      adapter_scope: this.options.adapter_scope,
      prior_cursor: cursor ?? null,
      next_cursor: JSON.stringify({ offset: nextOffset } satisfies LitmusCursor),
      fetched_at: new Date().toISOString(),
      messages,
      has_more: false,
      body_policy: this.options.body_policy,
      attachment_policy: this.options.attachment_policy,
      include_headers: this.options.include_headers,
      normalize_folder_ref: this.options.normalize_folder_ref,
      normalize_flagged: this.options.normalize_flagged,
    });
  }

  private toGraphMessage(msg: LitmusInboxLine): GraphDeltaMessage {
    const receivedAt = tickToIso(msg.at ?? 0);
    const sender = { name: msg.from, address: msg.from };

    return {
      id: msg.id,
      internetMessageId: `<litmus-${msg.id}@litmus.local>`,
      conversationId: msg.conversation_id,
      parentFolderId: this.options.adapter_scope.included_container_refs[0] ?? "inbox",
      receivedDateTime: receivedAt,
      sentDateTime: receivedAt,
      subject: msg.subject ?? null,
      body: { contentType: "text", content: msg.body ?? "" },
      bodyPreview: (msg.body ?? "").slice(0, 255),
      isRead: false,
      isDraft: false,
      importance: "normal",
      flag: { flagStatus: "notFlagged" },
      hasAttachments: false,
      from: { emailAddress: sender },
      sender: { emailAddress: sender },
      toRecipients: [
        {
          emailAddress: {
            name: this.options.mailbox_id,
            address: this.options.mailbox_id,
          },
        },
      ],
      ccRecipients: [],
      bccRecipients: [],
      replyTo: [],
      categories: [],
      changeKey: `litmus-${msg.id}`,
      createdDateTime: receivedAt,
      lastModifiedDateTime: receivedAt,
      webLink: `https://litmus.local/mail/inbox/id/${encodeURIComponent(msg.id)}`,
    };
  }
}
