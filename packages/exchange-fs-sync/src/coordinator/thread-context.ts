/**
 * Thread Context Hydration
 *
 * Reads the compiler's filesystem views for a given conversation and revision,
 * returning a NormalizedThreadContext suitable for the foreman.
 *
 * Spec: .ai/tasks/20260414-013-impl-conversation-records-and-revisions.md
 */

import { readFile, readdir, readlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { NormalizedMessage } from "../types/normalized.js";
import type { NormalizedThreadContext } from "./mail-compat-types.js";

function safeSegment(value: string): string {
  return encodeURIComponent(value);
}

export interface ThreadContextHydratorOptions {
  /** Root data directory where messages/ and views/ live. */
  rootDir: string;
}

export class ThreadContextHydrator {
  private readonly messagesDir: string;
  private readonly viewsDir: string;
  private readonly byThreadDir: string;

  constructor(opts: ThreadContextHydratorOptions) {
    this.messagesDir = join(opts.rootDir, "messages");
    this.viewsDir = join(opts.rootDir, "views");
    this.byThreadDir = join(this.viewsDir, "by-thread");
  }

  /**
   * Hydrate thread context from the compiler's filesystem views.
   *
   * Reads `views/by-thread/{conversation_id}/members/` symlinks,
   * resolves each to its `messages/{message_id}/record.json`,
   * and returns the parsed messages sorted by `received_at` ascending.
   */
  async hydrate(
    conversationId: string,
    mailboxId: string,
    revisionOrdinal: number,
  ): Promise<NormalizedThreadContext> {
    const messages: NormalizedMessage[] = [];
    const threadDir = join(this.byThreadDir, safeSegment(conversationId), "members");

    let entries: string[] = [];
    try {
      entries = await readdir(threadDir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        // Thread view does not exist yet; return empty context.
        return {
          conversation_id: conversationId,
          mailbox_id: mailboxId,
          revision_id: `${conversationId}:rev:${revisionOrdinal}`,
          messages,
        };
      }
      throw error;
    }

    for (const entry of entries) {
      const linkPath = join(threadDir, entry);
      let messageId: string;
      try {
        const linkTarget = await readlink(linkPath);
        // linkTarget is relative: ../../messages/{message_id}
        const resolved = resolve(threadDir, linkTarget);
        // Derive message_id from the basename of the resolved messages path
        const parts = resolved.split("/");
        messageId = decodeURIComponent(parts[parts.length - 1]!);
      } catch {
        // If readlink fails, the entry may not be a symlink (or was cleaned up).
        // Try to treat the entry name as the message id.
        messageId = decodeURIComponent(entry);
      }

      const recordPath = join(this.messagesDir, safeSegment(messageId), "record.json");
      try {
        const raw = await readFile(recordPath, "utf8");
        const record = JSON.parse(raw) as NormalizedMessage;
        messages.push(record);
      } catch {
        // Best-effort: if the record is missing or malformed, skip it.
        // Integrity checker handles persistent data issues.
      }
    }

    messages.sort((a, b) => {
      const aTime = a.received_at ? new Date(a.received_at).getTime() : 0;
      const bTime = b.received_at ? new Date(b.received_at).getTime() : 0;
      return aTime - bTime;
    });

    return {
      conversation_id: conversationId,
      mailbox_id: mailboxId,
      revision_id: `${conversationId}:rev:${revisionOrdinal}`,
      messages,
    };
  }
}
