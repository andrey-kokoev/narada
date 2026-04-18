/**
 * Mailbox-Specific Context Materializer
 *
 * Mail-vertical essential: reads the compiler's mail-specific filesystem views
 * and message store, then projects them into the charter runtime envelope.
 *
 * Generic charter envelope code must not depend on this module directly.
 * It should be injected as a ContextMaterializer where needed.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { PolicyContext } from "../../foreman/context.js";
import type { NormalizedMessage } from "../../types/normalized.js";
import { FileMessageStore } from "../../persistence/messages.js";
import type { ContextMaterializer } from "../envelope.js";

function safeSegment(value: string): string {
  return encodeURIComponent(value);
}

async function getThreadMessageIds(rootDir: string, conversationId: string): Promise<string[]> {
  const membersDir = join(rootDir, "views", "by-thread", safeSegment(conversationId), "members");
  try {
    const entries = await readdir(membersDir);
    return entries.map((e) => decodeURIComponent(e));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Mailbox-specific context materializer.
 *
 * Reads thread messages from the filesystem view and returns them
 * inside the opaque context_materialization payload.
 */
export class MailboxContextMaterializer implements ContextMaterializer {
  constructor(
    private rootDir: string,
    private messageStore: FileMessageStore,
  ) {}

  async materialize(context: PolicyContext): Promise<unknown> {
    const messageIds = await getThreadMessageIds(this.rootDir, context.context_id);
    const messages: NormalizedMessage[] = [];
    for (const messageId of messageIds) {
      const record = await this.messageStore.readRecord(messageId);
      if (record && typeof record === "object") {
        messages.push(normalizeMessageForEnvelope(record as NormalizedMessage));
      }
    }

    messages.sort((a, b) => {
      const ta = a.received_at ?? "";
      const tb = b.received_at ?? "";
      return ta.localeCompare(tb);
    });

    return { messages };
  }
}

/**
 * Canonical projection from Narada message model into charter runtime model.
 *
 * This is the normative boundary between the compiler's filesystem state and the
 * charter runtime envelope. Any field mapping or default-value injection must be
 * explicit and stable.
 */
export function normalizeMessageForEnvelope(msg: NormalizedMessage): NormalizedMessage {
  const r = msg as unknown as Record<string, unknown>;
  const bodyText =
    typeof msg.body === "object" && msg.body && "text" in msg.body
      ? (msg.body as { text?: string }).text?.slice(0, 200) ?? null
      : null;
  const mapAddr = (a: { email?: string; display_name?: string }): { email: string | null; name: string | null } => ({
    email: a.email ?? null,
    name: a.display_name ?? null,
  });
  return {
    ...msg,
    internet_message_id: (r.internet_message_id as string | undefined) ?? null,
    body_preview: (r.body_preview as string | undefined) ?? bodyText,
    from: Array.isArray(msg.from) ? msg.from.map(mapAddr) : msg.from ? [mapAddr(msg.from)] : [],
    to: (msg.to ?? []).map(mapAddr),
    cc: (msg.cc ?? []).map(mapAddr),
    bcc: (msg.bcc ?? []).map(mapAddr),
    sent_at: (r.sent_at as string | undefined) ?? null,
    is_draft: msg.flags?.is_draft ?? false,
    is_read: msg.flags?.is_read ?? false,
    categories: msg.category_refs ?? [],
    parent_folder_id: (r.parent_folder_id as string | undefined) ?? null,
    importance: (r.importance as "low" | "normal" | "high" | undefined) ?? null,
  } as NormalizedMessage;
}
