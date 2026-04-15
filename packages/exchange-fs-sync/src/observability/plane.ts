/**
 * Observation Plane
 *
 * A read-only, derived view over all durable kernel state.
 *
 * Invariants:
 * - Every observation is reconstructible from durable stores.
 * - No observation is used for correctness decisions.
 * - Rotating or deleting logs does not affect observation accuracy.
 */

import type { CoordinatorStore } from "../coordinator/types.js";
import type { OutboundStore } from "../outbound/store.js";
import type { ProcessExecutionStore } from "../executors/store.js";
import type { IntentStore } from "../intent/store.js";
import type { WorkerRegistry } from "../workers/registry.js";
import type { ObservationPlaneSnapshot } from "./types.js";
import { buildObservationPlaneSnapshot } from "./queries.js";

export interface ObservationPlaneDeps {
  registry: WorkerRegistry;
  coordinatorStore: CoordinatorStore;
  outboundStore: OutboundStore;
  intentStore: IntentStore;
  executionStore: ProcessExecutionStore;
}

export class ObservationPlane {
  constructor(private readonly deps: ObservationPlaneDeps) {}

  /**
   * Capture a full snapshot of the system state.
   * This is entirely derived from durable stores and worker registry metadata.
   */
  snapshot(mailboxId?: string): ObservationPlaneSnapshot {
    return buildObservationPlaneSnapshot(
      this.deps.registry,
      this.deps.coordinatorStore,
      this.deps.outboundStore,
      this.deps.intentStore,
      this.deps.executionStore,
      mailboxId,
    );
  }
}
