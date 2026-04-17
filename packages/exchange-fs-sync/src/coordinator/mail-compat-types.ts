/**
 * Mailbox-era compatibility types
 *
 * These types are structurally isolated from generic/kernel-facing types.
 * New generic code must not depend on them.
 */

import type { NormalizedMessage } from "../types/normalized.js";
import type { CoordinatorStore, ContextRecord } from "./types.js";

/** Canonical thread state as seen by the coordinator (mailbox vertical legacy). */
export interface ThreadRecord {
  conversation_id: string;
  mailbox_id: string;
  primary_charter: string;
  secondary_charters_json: string;
  status: string;
  assigned_agent: string | null;
  last_message_at: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_analyzed_at: string | null;
  last_triaged_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Control-plane conversation metadata (v2) — mail-vertical compatibility naming. */
export interface ConversationRecord {
  conversation_id: string;
  mailbox_id: string;
  primary_charter: string;
  secondary_charters_json: string;
  status: "active" | "archived" | "deleted";
  assigned_agent: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_analyzed_at: string | null;
  last_triaged_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Revision ordinal tracking for deterministic conversation snapshots (mailbox naming). */
export interface ConversationRevision {
  revision_record_id: number;
  conversation_id: string;
  ordinal: number;
  observed_at: string;
  trigger_event_id: string | null;
}

/** Thread context hydrated from the compiler's filesystem views (mailbox naming). */
export interface NormalizedThreadContext {
  conversation_id: string;
  mailbox_id: string;
  revision_id: string;
  messages: NormalizedMessage[];
}

/**
 * Compatibility extension of CoordinatorStore for the mail vertical.
 *
 * Generic modules must not depend on this interface.
 */
export interface MailCompatCoordinatorStore extends CoordinatorStore {
  // Threads (legacy — deprecated in favor of context records)
  upsertThread(record: ThreadRecord): void;
  getThread(threadId: string, mailboxId: string): ThreadRecord | undefined;

  // Conversation record compatibility wrappers
  upsertConversationRecord(record: ConversationRecord): void;
  getConversationRecord(conversationId: string): ConversationRecord | undefined;
}

/** Convert a neutral ContextRecord into a mail-compatible ConversationRecord. */
export function contextRecordToConversationRecord(record: ContextRecord): ConversationRecord {
  return {
    conversation_id: record.context_id,
    mailbox_id: record.scope_id,
    primary_charter: record.primary_charter,
    secondary_charters_json: record.secondary_charters_json,
    status: record.status,
    assigned_agent: record.assigned_agent,
    last_message_at: record.last_message_at,
    last_inbound_at: record.last_inbound_at,
    last_outbound_at: record.last_outbound_at,
    last_analyzed_at: record.last_analyzed_at,
    last_triaged_at: record.last_triaged_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}
