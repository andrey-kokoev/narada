/**
 * Mailbox-Specific Context Materializer
 *
 * Mail-vertical essential: reads the compiler's mail-specific filesystem views
 * and message store, then projects them into the charter runtime envelope.
 *
 * Generic charter envelope code must not depend on this module directly.
 * It should be injected as a ContextMaterializer where needed.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { PolicyContext } from "../../foreman/context.js";
import type { NormalizedMessage } from "../../types/normalized.js";
import { FileMessageStore } from "../../persistence/messages.js";
import type { ContextMaterializer } from "../envelope.js";

function safeSegment(value: string): string {
  return encodeURIComponent(value);
}

interface KnowledgeSource {
  name: string;
  content: string;
}

async function loadKnowledgeSources(rootDir: string): Promise<KnowledgeSource[]> {
  const knowledgeDir = join(rootDir, "knowledge");
  const sources: KnowledgeSource[] = [];
  try {
    const entries = await readdir(knowledgeDir);
    for (const entry of entries) {
      if (entry.endsWith(".md")) {
        const content = await readFile(join(knowledgeDir, entry), "utf-8");
        sources.push({ name: entry, content });
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
  return sources;
}

async function loadCampaignIntakeProjection(rootDir: string, contextId: string): Promise<unknown | null> {
  const candidates = [
    join(rootDir, "state", "campaign-intake", `${safeSegment(contextId)}.json`),
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(await readFile(candidate, "utf-8")) as unknown;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        continue;
      }
    }
  }
  return null;
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

function routedConversationId(contextId: string): string | null {
  const separator = contextId.indexOf(":");
  if (separator <= 0 || separator === contextId.length - 1) {
    return null;
  }
  return contextId.slice(separator + 1);
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
    private db?: Database.Database,
  ) {}

  async materialize(context: PolicyContext): Promise<unknown> {
    const conversationIds = new Set<string>([context.context_id]);
    if (context.change_kinds.some((kind) => kind.startsWith("operation_intake"))) {
      const sourceConversationId = routedConversationId(context.context_id);
      if (sourceConversationId) {
        conversationIds.add(sourceConversationId);
      }
    }
    for (const link of context.mail_context_links ?? []) {
      conversationIds.add(link.source_conversation_id);
    }
    for (const fact of context.facts ?? []) {
      const conversationId = conversationIdFromFact(fact);
      if (conversationId) conversationIds.add(conversationId);
    }
    for (const conversationId of this.linkedConversationIds(context.context_id)) {
      conversationIds.add(conversationId);
    }

    const messageIds = new Set<string>();
    for (const conversationId of conversationIds) {
      for (const messageId of await getThreadMessageIds(this.rootDir, conversationId)) {
        messageIds.add(messageId);
      }
    }
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

    const knowledgeSources = await loadKnowledgeSources(this.rootDir);
    const campaignIntake = await loadCampaignIntakeProjection(this.rootDir, context.context_id);

    return {
      messages,
      knowledge_sources: knowledgeSources,
      ...(campaignIntake ? { campaign_intake: campaignIntake } : {}),
    };
  }

  private linkedConversationIds(contextId: string): string[] {
    if (!this.db) return [];
    try {
      const rows = this.db
        .prepare(`select source_conversation_id from context_mail_thread_links where context_id = ?`)
        .all(contextId) as Array<{ source_conversation_id: string }>;
      return rows.map((row) => row.source_conversation_id);
    } catch {
      return [];
    }
  }
}

function conversationIdFromFact(fact: { payload_json: string }): string | null {
  try {
    const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
    const event = payload.event as Record<string, unknown> | undefined;
    const normalizedPayload = event?.payload as Record<string, unknown> | undefined;
    return typeof event?.conversation_id === "string"
      ? event.conversation_id
      : typeof normalizedPayload?.conversation_id === "string"
        ? normalizedPayload.conversation_id
        : null;
  } catch {
    return null;
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
      ? (msg.body as { text?: string }).text ?? null
      : null;
  const bodyPreview =
    typeof msg.body === "object" && msg.body && "preview" in msg.body
      ? (msg.body as { preview?: string }).preview ?? null
      : null;
  const mapAddr = (a: { email?: string; display_name?: string }): { email: string | null; name: string | null } => ({
    email: a.email ?? null,
    name: a.display_name ?? null,
  });
  return {
    ...msg,
    internet_message_id: (r.internet_message_id as string | undefined) ?? null,
    body_preview: (r.body_preview as string | undefined) ?? bodyPreview ?? bodyText,
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
