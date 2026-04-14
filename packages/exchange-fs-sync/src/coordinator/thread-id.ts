/**
 * Thread Identity Derivation
 *
 * Rule: thread_id === conversation_id (Exchange conversationId).
 *
 * Spec: .ai/tasks/20260413-012-coordinator-state-and-foreman-handoff.md
 */

import type { NormalizedMessage } from "../types/normalized.js";

/**
 * Derive the canonical thread_id from a normalized message.
 * This is exactly the Exchange conversation_id.
 */
export function deriveThreadId(normalizedMessage: NormalizedMessage): string {
  return normalizedMessage.conversation_id;
}
