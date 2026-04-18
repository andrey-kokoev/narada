/**
 * Observation module shared types
 *
 * These types are part of the observation/control surface and are owned by
 * the observation module. They must not create an import cycle back to
 * daemon core files (service.ts, etc.).
 */

export type WakeReason = "manual" | "retry" | "poll";

export const WAKE_PRIORITY: Record<WakeReason, number> = {
  manual: 3,
  retry: 2,
  poll: 1,
};
