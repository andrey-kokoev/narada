/**
 * Policy Context Formation
 *
 * Domain-neutral context formation boundary between fact ingestion and
 * foreman policy admission. Mailbox-specific and timer-specific shaping
 * live in vertical strategies, not the kernel.
 */

import type { Fact } from "../facts/types.js";

export interface PolicyContext {
  /** Domain-neutral context identifier (was conversation_id) */
  context_id: string;
  /** Scope / mailbox / tenant identifier */
  scope_id: string;
  /** Revision identifier: format {context_id}:rev:{ordinal} */
  revision_id: string;
  /** Previous known revision ordinal from durable state */
  previous_revision_ordinal: number | null;
  /** Proposed current revision ordinal */
  current_revision_ordinal: number;
  /** Change classifications (e.g. "new_message", "moved") */
  change_kinds: string[];
  /** Facts that contributed to this context */
  facts: Fact[];
  /** Admission timestamp (ISO 8601) */
  synced_at: string;
}

export interface ContextFormationStrategy {
  formContexts(
    facts: Fact[],
    scopeId: string,
    options?: {
      getLatestRevisionOrdinal?: (contextId: string) => number | null;
    },
  ): PolicyContext[];
}

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

export class TimerContextStrategy implements ContextFormationStrategy {
  formContexts(
    facts: Fact[],
    scopeId: string,
    options?: {
      getLatestRevisionOrdinal?: (contextId: string) => number | null;
    },
  ): PolicyContext[] {
    const groups = new Map<string, Fact[]>();

    for (const fact of facts) {
      if (fact.fact_type !== "timer.tick") {
        continue;
      }

      let scheduleId: string | undefined;

      try {
        const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
        const event = payload.event as Record<string, unknown> | undefined;
        if (event && typeof event === "object" && typeof event.schedule_id === "string") {
          scheduleId = event.schedule_id;
        }
      } catch {
        continue;
      }

      if (!scheduleId) {
        continue;
      }

      const contextId = `timer:${scheduleId}`;
      const group = groups.get(contextId) ?? [];
      group.push(fact);
      groups.set(contextId, group);
    }

    const now = new Date().toISOString();
    const contexts: PolicyContext[] = [];

    for (const [contextId, groupFacts] of groups) {
      const previousOrdinal = options?.getLatestRevisionOrdinal?.(contextId) ?? null;
      const currentOrdinal = (previousOrdinal ?? 0) + 1;

      contexts.push({
        context_id: contextId,
        scope_id: scopeId,
        revision_id: makeRevisionId(contextId, currentOrdinal),
        previous_revision_ordinal: previousOrdinal,
        current_revision_ordinal: currentOrdinal,
        change_kinds: ["new_fact"],
        facts: groupFacts,
        synced_at: now,
      });
    }

    return contexts;
  }
}

export class WebhookContextStrategy implements ContextFormationStrategy {
  formContexts(
    facts: Fact[],
    scopeId: string,
    options?: {
      getLatestRevisionOrdinal?: (contextId: string) => number | null;
    },
  ): PolicyContext[] {
    const groups = new Map<string, Fact[]>();

    for (const fact of facts) {
      if (fact.fact_type !== "webhook.received") {
        continue;
      }

      let endpointId: string | undefined;

      try {
        const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
        const event = payload.event as Record<string, unknown> | undefined;
        if (event && typeof event === "object" && typeof event.endpoint_id === "string") {
          endpointId = event.endpoint_id;
        }
      } catch {
        continue;
      }

      if (!endpointId) {
        continue;
      }

      const contextId = `webhook:${endpointId}`;
      const group = groups.get(contextId) ?? [];
      group.push(fact);
      groups.set(contextId, group);
    }

    const now = new Date().toISOString();
    const contexts: PolicyContext[] = [];

    for (const [contextId, groupFacts] of groups) {
      const previousOrdinal = options?.getLatestRevisionOrdinal?.(contextId) ?? null;
      const currentOrdinal = (previousOrdinal ?? 0) + 1;

      contexts.push({
        context_id: contextId,
        scope_id: scopeId,
        revision_id: makeRevisionId(contextId, currentOrdinal),
        previous_revision_ordinal: previousOrdinal,
        current_revision_ordinal: currentOrdinal,
        change_kinds: ["new_fact"],
        facts: groupFacts,
        synced_at: now,
      });
    }

    return contexts;
  }
}

export class FilesystemContextStrategy implements ContextFormationStrategy {
  formContexts(
    facts: Fact[],
    scopeId: string,
    options?: {
      getLatestRevisionOrdinal?: (contextId: string) => number | null;
    },
  ): PolicyContext[] {
    const groups = new Map<string, Fact[]>();

    for (const fact of facts) {
      if (fact.fact_type !== "filesystem.change") {
        continue;
      }

      let watchId: string | undefined;

      try {
        const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
        const event = payload.event as Record<string, unknown> | undefined;
        if (event && typeof event === "object" && typeof event.watch_id === "string") {
          watchId = event.watch_id;
        }
      } catch {
        continue;
      }

      if (!watchId) {
        continue;
      }

      const contextId = `fs:${watchId}`;
      const group = groups.get(contextId) ?? [];
      group.push(fact);
      groups.set(contextId, group);
    }

    const now = new Date().toISOString();
    const contexts: PolicyContext[] = [];

    for (const [contextId, groupFacts] of groups) {
      const previousOrdinal = options?.getLatestRevisionOrdinal?.(contextId) ?? null;
      const currentOrdinal = (previousOrdinal ?? 0) + 1;

      contexts.push({
        context_id: contextId,
        scope_id: scopeId,
        revision_id: makeRevisionId(contextId, currentOrdinal),
        previous_revision_ordinal: previousOrdinal,
        current_revision_ordinal: currentOrdinal,
        change_kinds: ["new_fact"],
        facts: groupFacts,
        synced_at: now,
      });
    }

    return contexts;
  }
}
