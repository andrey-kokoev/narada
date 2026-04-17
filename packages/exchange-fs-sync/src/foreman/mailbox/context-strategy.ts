/**
 * Mailbox Context Formation Strategy
 *
 * Mail-vertical essential — this strategy explicitly parses mail-shaped facts
 * (conversation_id, thread_id) and projects them into the neutral PolicyContext
 * contract. It is the canonical mail-vertical adapter.
 */

import type { Fact } from "../../facts/types.js";
import type { PolicyContext, ContextFormationStrategy } from "../context.js";

function makeRevisionId(contextId: string, ordinal: number): string {
  return `${contextId}:rev:${ordinal}`;
}

export class MailboxContextStrategy implements ContextFormationStrategy {
  formContexts(
    facts: Fact[],
    scopeId: string,
    options?: {
      getLatestRevisionOrdinal?: (contextId: string) => number | null;
    },
  ): PolicyContext[] {
    const groups = new Map<string, { kinds: Set<string>; facts: Fact[] }>();

    for (const fact of facts) {
      let contextId: string | undefined;
      let kind = "new_message";

      try {
        const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
        const event = payload.event as Record<string, unknown> | undefined;

        if (event && typeof event === "object") {
          const convId = event.conversation_id ?? event.thread_id;
          if (typeof convId === "string") {
            contextId = convId;
          }

          const eventKind = event.event_kind;
          if (eventKind === "deleted" || eventKind === "delete" || eventKind === "removed") {
            kind = "moved";
          }
        }
      } catch {
        // Unparseable payload — skip
        continue;
      }

      if (!contextId) {
        continue;
      }

      const group = groups.get(contextId) ?? { kinds: new Set<string>(), facts: [] };
      group.kinds.add(kind);
      group.facts.push(fact);
      groups.set(contextId, group);
    }

    const now = new Date().toISOString();
    const contexts: PolicyContext[] = [];

    for (const [contextId, group] of groups) {
      const previousOrdinal = options?.getLatestRevisionOrdinal?.(contextId) ?? null;
      const currentOrdinal = (previousOrdinal ?? 0) + 1;

      contexts.push({
        context_id: contextId,
        scope_id: scopeId,
        revision_id: makeRevisionId(contextId, currentOrdinal),
        previous_revision_ordinal: previousOrdinal,
        current_revision_ordinal: currentOrdinal,
        change_kinds: Array.from(group.kinds),
        facts: group.facts,
        synced_at: now,
      });
    }

    return contexts;
  }
}
