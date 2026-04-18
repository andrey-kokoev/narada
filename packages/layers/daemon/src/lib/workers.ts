/**
 * Canonical worker IDs for outbound mail operations.
 *
 * These IDs are used both when registering workers into the WorkerRegistry
 * and when draining them during dispatch. Keeping them in a single constant
 * prevents a typo or rename from leaving a worker registered but never drained.
 */
export const OUTBOUND_WORKER_IDS = [
  "send_reply",
  "non_send_actions",
  "outbound_reconciler",
] as const;

export type OutboundWorkerId = (typeof OUTBOUND_WORKER_IDS)[number];
