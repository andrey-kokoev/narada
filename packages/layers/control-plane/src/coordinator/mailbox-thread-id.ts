/**
 * Thread Identity Derivation
 *
 * Rule: thread_id === conversation_id (Exchange conversationId).
 *
 * Spec: .ai/do-not-open/tasks/20260413-012-coordinator-state-and-foreman-handoff.md
 */

import type { NormalizedMessage } from "../types/normalized.js";

/**
 * Derive the canonical thread_id from a normalized message.
 * This is exactly the Exchange conversation_id.
 *
 * CLASSIFICATION: mail-vertical essential — this is a pure mail-vertical
 * identity rule. It has no meaning outside the Exchange/Graph mailbox vertical.
 */
export function deriveThreadId(normalizedMessage: NormalizedMessage): string {
  return normalizedMessage.conversation_id;
}
