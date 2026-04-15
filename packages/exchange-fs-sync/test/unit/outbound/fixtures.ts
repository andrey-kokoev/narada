import type {
  OutboundCommand,
  OutboundVersion,
  ManagedDraft,
  OutboundStatus,
  OutboundActionType,
} from "../../../src/outbound/types.js";

export function createOutboundCommand(
  overrides: Partial<OutboundCommand> & { outbound_id?: string } = {},
): OutboundCommand {
  const now = new Date().toISOString();
  return {
    outbound_id: overrides.outbound_id ?? "outbound-001",
    conversation_id: "thread-001",
    mailbox_id: "mailbox-001",
    action_type: "send_reply",
    status: "pending",
    latest_version: 1,
    created_at: now,
    created_by: "agent",
    submitted_at: null,
    confirmed_at: null,
    blocked_reason: null,
    terminal_reason: null,
    idempotency_key: overrides.idempotency_key ?? `key-${overrides.outbound_id ?? "outbound-001"}`,
    ...overrides,
  };
}

export function createOutboundVersion(
  overrides: Partial<OutboundVersion> & { outbound_id?: string; version?: number } = {},
): OutboundVersion {
  const now = new Date().toISOString();
  return {
    outbound_id: overrides.outbound_id ?? "outbound-001",
    version: overrides.version ?? 1,
    reply_to_message_id: "msg-001",
    to: ["customer@example.com"],
    cc: [],
    bcc: [],
    subject: "Re: Issue",
    body_text: "Hello",
    body_html: "<p>Hello</p>",
    idempotency_key: `key-${overrides.version ?? 1}`,
    policy_snapshot_json: "{}",
    payload_json: "{}",
    created_at: now,
    superseded_at: null,
    ...overrides,
  };
}

export function createManagedDraft(
  overrides: Partial<ManagedDraft> & { outbound_id?: string; version?: number } = {},
): ManagedDraft {
  const now = new Date().toISOString();
  return {
    outbound_id: overrides.outbound_id ?? "outbound-001",
    version: overrides.version ?? 1,
    draft_id: "draft-001",
    etag: null,
    internet_message_id: null,
    header_outbound_id_present: false,
    body_hash: "hash-body",
    recipients_hash: "hash-recipients",
    subject_hash: "hash-subject",
    created_at: now,
    last_verified_at: null,
    invalidated_reason: null,
    ...overrides,
  };
}
