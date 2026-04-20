/**
 * Cross-vertical context ID extraction from fact payloads.
 *
 * This module is intentionally vertical-aware: it knows the standard payload
 * shapes for all supported verticals (mail, timer, webhook, filesystem) so
 * that generic kernel code can filter facts by context without embedding
 * vertical knowledge in the fact store itself.
 *
 * Because it references vertical-specific field names (conversation_id,
 * thread_id, etc.), it is allowlisted in scripts/control-plane-lint.ts.
 */

import type { Fact } from "./types.js";

/** Field names that may contain a context ID in a fact payload event object. */
const CONTEXT_ID_FIELDS = [
  "conversation_id",
  "thread_id",
  "schedule_id",
  "endpoint_id",
  "watch_id",
] as const;

/**
 * Extract the context identifier from a fact's payload, if present.
 * Returns `undefined` when no recognized context field is found.
 */
export function extractContextId(fact: Fact): string | undefined {
  try {
    const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
    const event = payload.event as Record<string, unknown> | undefined;
    if (event && typeof event === "object") {
      for (const field of CONTEXT_ID_FIELDS) {
        const value = event[field];
        if (typeof value === "string") {
          return value;
        }
      }
    }
  } catch {
    // Unparseable payload — no context ID
  }
  return undefined;
}
