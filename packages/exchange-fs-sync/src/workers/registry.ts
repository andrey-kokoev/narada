/**
 * Worker Registry
 *
 * Explicit worker identities, concurrency policy enforcement,
 * and dispatch coordination for executor families.
 */

import type { WorkerIdentity, WorkerFn, WorkerExecutionResult } from "./types.js";

export interface RegisteredWorker {
  identity: WorkerIdentity;
  fn: WorkerFn;
}

export interface WorkerRegistry {
  register(worker: RegisteredWorker): void;
  getWorker(workerId: string): RegisteredWorker | undefined;
  listWorkers(): WorkerIdentity[];
  execute(workerId: string): Promise<WorkerExecutionResult>;
  isRunning(workerId: string): boolean;
}

interface InFlightState {
  promise: Promise<WorkerExecutionResult>;
  hasPendingLatest: boolean;
}

export class DefaultWorkerRegistry implements WorkerRegistry {
  private readonly workers = new Map<string, RegisteredWorker>();
  private readonly inFlight = new Map<string, InFlightState>();

  register(worker: RegisteredWorker): void {
    this.workers.set(worker.identity.worker_id, worker);
  }

  getWorker(workerId: string): RegisteredWorker | undefined {
    return this.workers.get(workerId);
  }

  listWorkers(): WorkerIdentity[] {
    return Array.from(this.workers.values()).map((w) => w.identity);
  }

  isRunning(workerId: string): boolean {
    return this.inFlight.has(workerId);
  }

  async execute(workerId: string): Promise<WorkerExecutionResult> {
    const registered = this.workers.get(workerId);
    if (!registered) {
      throw new Error(`Worker not registered: ${workerId}`);
    }

    const policy = registered.identity.concurrency_policy;
    const existing = this.inFlight.get(workerId);

    if (policy === "parallel") {
      return this.runWorker(workerId, registered.fn);
    }

    if (policy === "drop_if_running" && existing) {
      return { processed: false };
    }

    if (policy === "latest_wins" && existing) {
      existing.hasPendingLatest = true;
      // Wait for the in-flight execution to complete, then the follow-up
      // will be handled by the caller or by our own chaining.
      const result = await existing.promise;
      // If no pending latest was queued while we waited, just return the last result.
      if (!this.inFlight.get(workerId)?.hasPendingLatest) {
        return result;
      }
      // Otherwise, we need to execute again. But we must clear the pending flag
      // and start a new execution. This path is naturally handled by the caller
      // re-invoking execute(); here we just return a signal that more work may exist.
      return { processed: result.processed };
    }

    // singleton (default)
    if (existing) {
      return existing.promise;
    }

    return this.runWorker(workerId, registered.fn);
  }

  private runWorker(workerId: string, fn: WorkerFn): Promise<WorkerExecutionResult> {
    const state: InFlightState = {
      promise: fn().then(
        (result) => {
          this.cleanupInFlight(workerId, state);
          return result;
        },
        (error) => {
          this.cleanupInFlight(workerId, state);
          throw error;
        },
      ),
      hasPendingLatest: false,
    };

    this.inFlight.set(workerId, state);
    return state.promise;
  }

  private cleanupInFlight(workerId: string, state: InFlightState): void {
    const current = this.inFlight.get(workerId);
    if (current === state) {
      this.inFlight.delete(workerId);
    }
  }
}

/**
 * Drain a worker by repeatedly executing it until no more work is processed.
 * Respects the worker's concurrency policy per invocation.
 */
export async function drainWorker(
  registry: WorkerRegistry,
  workerId: string,
): Promise<{ totalProcessed: number; executionIds: string[] }> {
  let totalProcessed = 0;
  const executionIds: string[] = [];

  let processed = true;
  while (processed) {
    const result = await registry.execute(workerId);
    processed = result.processed;
    if (processed) {
      totalProcessed++;
      if (result.execution_id) {
        executionIds.push(result.execution_id);
      }
    }
  }

  return { totalProcessed, executionIds };
}
