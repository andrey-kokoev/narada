/**
 * Coordinator Binding Contracts
 *
 * Mailbox-to-charter attachments and invocation policies.
 *
 * Spec: .ai/tasks/20260413-007-foreman-and-charters-architecture.md
 * Spec: .ai/tasks/20260413-008-mailbox-charter-knowledge-sources.md
 */

import type { KnowledgeSourceRef } from "./knowledge.js";

export type CharterId = "support_steward" | "obligation_keeper";

export type InvocationMode = "always" | "conditional" | "manual";

/** Policy controlling when a charter is invoked for a thread */
export interface CharterInvocationPolicy {
  charter_id: CharterId;
  mode: InvocationMode;
  trigger_tags?: string[];
}

/** Canonical mailbox-to-charter binding including knowledge sources */
export interface MailboxCharterBinding {
  mailbox_id: string;
  available_charters: CharterId[];
  default_primary_charter: CharterId;
  invocation_policies: CharterInvocationPolicy[];
  knowledge_sources: Record<CharterId, KnowledgeSourceRef[]>;
}

/** Top-level coordinator configuration envelope */
export interface CoordinatorConfig {
  mailbox_bindings: Record<string, MailboxCharterBinding>;
}

/**
 * Validate a mailbox-charter binding.
 */
export function validateMailboxCharterBinding(
  binding: unknown,
): binding is MailboxCharterBinding {
  if (typeof binding !== "object" || binding === null) return false;
  const b = binding as Record<string, unknown>;

  if (typeof b.mailbox_id !== "string" || b.mailbox_id.length === 0) return false;
  if (!Array.isArray(b.available_charters)) return false;
  if (b.available_charters.length === 0) return false;
  if (
    b.available_charters.some(
      (c: unknown) => typeof c !== "string" || c.length === 0,
    )
  ) {
    return false;
  }

  if (
    typeof b.default_primary_charter !== "string" ||
    !b.available_charters.includes(b.default_primary_charter)
  ) {
    return false;
  }

  if (!Array.isArray(b.invocation_policies)) return false;
  for (const policy of b.invocation_policies as unknown[]) {
    if (typeof policy !== "object" || policy === null) return false;
    const p = policy as Record<string, unknown>;
    if (typeof p.charter_id !== "string") return false;
    if (!["always", "conditional", "manual"].includes(p.mode as string)) {
      return false;
    }
    if (
      p.trigger_tags !== undefined &&
      (!Array.isArray(p.trigger_tags) ||
        p.trigger_tags.some((t: unknown) => typeof t !== "string"))
    ) {
      return false;
    }
  }

  if (typeof b.knowledge_sources !== "object" || b.knowledge_sources === null) {
    return false;
  }

  return true;
}
