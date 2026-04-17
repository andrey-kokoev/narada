/**
 * Mailbox-vertical observability types.
 *
 * These types are structurally isolated from generic observability.
 * Generic modules must not depend on them.
 */

import type { OutboundStatus } from "../outbound/types.js";
import type { OutboundHandoffSummary } from "./types.js";

/** Mail execution transition for audit trail */
export interface MailExecutionTransition {
  transition_id: number;
  from_status: OutboundStatus;
  to_status: OutboundStatus;
  reason: string | null;
  created_at: string;
}

/** Mail execution detail for operator drill-down */
export interface MailExecutionDetail {
  outbound_id: string;
  intent_id: string;
  conversation_id: string;
  mailbox_id: string;
  action_type: string;
  status: OutboundStatus;
  latest_version: number;
  idempotency_key: string;
  submitted_at: string | null;
  confirmed_at: string | null;
  blocked_reason: string | null;
  terminal_reason: string | null;
  created_at: string;
  transitions: MailExecutionTransition[];
  latest_version_detail: {
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body_text_preview: string;
  } | null;
}

/** Mailbox-vertical conversation summary with mail-specific timing */
export interface MailboxConversationSummary {
  context_id: string;
  scope_id: string;
  status: string;
  primary_charter: string;
  assigned_agent: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Mailbox-vertical view — sits above the kernel-neutral shell */
export interface MailboxVerticalView {
  scope_id: string;
  conversations: MailboxConversationSummary[];
  outbound: OutboundHandoffSummary[];
  outputs: {
    output_id: string;
    context_id: string;
    charter_id: string;
    summary: string;
    analyzed_at: string;
  }[];
}
