/**
 * Normalized message types for consistent internal representation
 */

export type MailboxId = string;
export type MessageId = string;
export type EventId = string;
export type CursorToken = string;
export type SourceVersion = string;

export type EventKind = 'created' | 'updated' | 'deleted' | 'upsert' | 'delete';

export type AttachmentPolicy = 'exclude' | 'metadata_only' | 'include_content';
export type BodyPolicy = 'original' | 'best_effort' | 'plain_text_only' | 'text_only' | 'html_only' | 'text_and_html';

export const SCHEMA_VERSION = 1;

export type FolderRef = string;

export interface NormalizedAddress {
  display_name?: string;
  email?: string;
}

export interface NormalizedExtensions {
  namespaces: {
    graph?: Record<string, unknown>;
  };
}

export interface NormalizedAttachment {
  attachment_key: string;
  source_attachment_id?: string;
  ordinal: number;
  display_name: string;
  content_type?: string;
  size_bytes?: number;
  inline: boolean;
  content_id?: string;
  content_hash?: string;
  content_ref?: string;
  source_extensions?: NormalizedExtensions;
}

export interface NormalizedBody {
  body_kind: 'empty' | 'text' | 'html';
  text?: string;
  html?: string;
  preview?: string;
  content_hashes?: Record<string, string>;
  source_extensions?: NormalizedExtensions;
}

export interface MessageFlags {
  is_read: boolean;
  is_draft: boolean;
  is_flagged: boolean;
  has_attachments: boolean;
}

export interface NormalizedMessage {
  mailbox_id: MailboxId;
  message_id: MessageId;
  source_version: SourceVersion;
  conversation_id: string;
  received_at: string;
  subject?: string;
  body?: NormalizedBody;
  from?: NormalizedAddress;
  reply_to?: NormalizedAddress[];
  to: NormalizedAddress[];
  cc: NormalizedAddress[];
  bcc: NormalizedAddress[];
  folder_refs: FolderRef[];
  category_refs: string[];
  flags: MessageFlags;
  attachments: NormalizedAttachment[];
  internet_message_id?: string;
  source_extensions?: NormalizedExtensions;
}

export interface NormalizedPayload {
  schema_version: number;
  mailbox_id: MailboxId;
  message_id: MessageId;
  event_id?: EventId;
  kind?: EventKind;
  source_version?: SourceVersion;
  received_at?: string;
  observed_at?: string;
  subject?: string;
  from?: NormalizedAddress;
  sender?: NormalizedAddress;
  to?: NormalizedAddress[];
  cc?: NormalizedAddress[];
  bcc?: NormalizedAddress[];
  reply_to?: NormalizedAddress[];
  conversation_id?: string;
  category_refs?: string[];
  folder_refs?: FolderRef[];
  flags?: MessageFlags;
  body?: NormalizedBody;
  attachments?: NormalizedAttachment[];
  internet_message_id?: string;
  headers?: { values: Record<string, string[]> };
  importance?: string;
  is_read?: boolean;
  is_draft?: boolean;
  is_flagged?: boolean;
}

export interface NormalizedEvent {
  schema_version?: number;
  event_id: EventId;
  event_kind: EventKind;
  message_id: MessageId;
  source_version?: SourceVersion;
  mailbox_id: MailboxId;
  conversation_id?: string;
  source_item_id?: string;
  observed_at?: string;
  payload?: NormalizedPayload;
  received_at?: string;
}

export interface DeltaEntry {
  id: string;
  changeType: 'created' | 'updated' | 'deleted';
  message?: NormalizedMessage;
  removedMessageId?: string;
}

export interface DeltaBatch {
  entries: DeltaEntry[];
  nextDeltaToken?: string;
  nextLink?: string;
}

export interface NormalizedBatch {
  schema_version: number;
  mailbox_id: MailboxId;
  adapter_scope: AdapterScope;
  fetched_at: string;
  events: NormalizedEvent[];
  prior_cursor?: CursorToken | null;
  next_cursor?: CursorToken;
  has_more: boolean;
}

export interface AdapterScope {
  mailbox_id: MailboxId;
  included_container_refs: FolderRef[];
  included_item_kinds: string[];
  attachment_policy?: AttachmentPolicy;
  body_policy?: BodyPolicy;
}
