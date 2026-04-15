/**
 * Outbound Idempotency Key
 *
 * Deterministic key generation for the effect-of-once boundary.
 *
 * Invariant: identical intent → identical idempotency key.
 */

import { createHash } from "node:crypto";

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Compute a deterministic idempotency key for an outbound intent.
 *
 * The key is derived from:
 * - conversation_id (canonical identity)
 * - action_type
 * - canonical payload (stable JSON ordering)
 *
 * This guarantees that retries, replays, or crashes producing the same
 * logical intent will converge to the same key.
 */
export function computeIdempotencyKey(
  conversationId: string,
  actionType: string,
  payload: unknown,
): string {
  const canonicalPayload = stableStringify(payload);
  const input = `${conversationId}:${actionType}:${canonicalPayload}`;
  return sha256(input).slice(0, 32);
}

/**
 * Deterministic JSON stringify for payload canonicalization.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}
