/**
 * Lease Scanner
 *
 * Stand-alone stale lease recovery for use on scheduler startup
 * or as a background maintenance task.
 *
 * Spec: .ai/tasks/20260414-015-impl-scheduler-and-leases.md
 */

import type { CoordinatorStore } from "../coordinator/types.js";

export interface LeaseScanner {
  recoverStaleLeases(now?: string): { leaseId: string; workItemId: string }[];
}

export function createLeaseScanner(store: CoordinatorStore): LeaseScanner {
  return {
    recoverStaleLeases(now?: string) {
      return store.recoverStaleLeases(now ?? new Date().toISOString());
    },
  };
}
