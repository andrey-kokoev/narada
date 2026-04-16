/**
 * Unified Execution Coordinator
 *
 * Provides a single kernel-level interface to query and recover
 * executions across all executor families (process, mail, and future).
 */

import type { IntentStore } from "../intent/store.js";
import type { OutboundStore } from "../outbound/store.js";
import type { ExecutionLifecycle } from "./lifecycle.js";
import type { ProcessExecutionStore } from "./store.js";
import { MailLifecycleAdapter } from "./mail-lifecycle.js";

export interface ExecutionCoordinatorDeps {
  processStore: ProcessExecutionStore;
  outboundStore: OutboundStore;
  intentStore: IntentStore;
}

export class ExecutionCoordinator {
  private readonly mailAdapter: MailLifecycleAdapter;

  constructor(private readonly deps: ExecutionCoordinatorDeps) {
    this.mailAdapter = new MailLifecycleAdapter({ outboundStore: deps.outboundStore });
  }

  /**
   * Retrieve the unified execution lifecycle for a given execution.
   *
   * For process: queries the process execution store directly.
   * For mail: projects the outbound command into the unified model.
   */
  getLifecycle(
    executionId: string,
    executorFamily: string,
    intentId?: string,
  ): ExecutionLifecycle | undefined {
    if (executorFamily === "process") {
      const ex = this.deps.processStore.getById(executionId);
      if (!ex) {
        return undefined;
      }
      return {
        execution_id: ex.execution_id,
        intent_id: ex.intent_id,
        executor_family: ex.executor_family,
        phase: ex.phase,
        confirmation_status: ex.confirmation_status,
        started_at: ex.started_at,
        completed_at: ex.completed_at,
        confirmed_at: ex.confirmed_at,
        error_message: ex.error_message,
        artifact_id: ex.artifact_id,
      };
    }

    if (executorFamily === "mail") {
      // For mail, the executionId is the outbound_id.
      // If intentId is not provided, attempt to look it up from the intent store
      // via the outbound_id stored in target_id.
      let resolvedIntentId = intentId;
      if (!resolvedIntentId) {
        const intent = this.deps.intentStore.db
          .prepare("select intent_id from intents where target_id = ? limit 1")
          .get(executionId) as { intent_id: string } | undefined;
        resolvedIntentId = intent?.intent_id;
      }
      if (!resolvedIntentId) {
        return undefined;
      }
      return this.mailAdapter.getLifecycle(executionId, resolvedIntentId);
    }

    return undefined;
  }

  /**
   * Recover stale executions for the process family.
   *
   * Mail stale execution recovery remains handled by the generalized
   * scheduler/lease layer (Task 044). This method ensures the same
   * semantic outcome: stale running executions become failed and
   * their intents are reset for retry.
   */
  recoverStaleExecutions(now?: string): ExecutionLifecycle[] {
    const recovered = this.deps.processStore.recoverStaleExecutions(now);
    return recovered.map((ex) => ({
      execution_id: ex.execution_id,
      intent_id: ex.intent_id,
      executor_family: ex.executor_family,
      phase: ex.phase,
      confirmation_status: ex.confirmation_status,
      started_at: ex.started_at,
      completed_at: ex.completed_at,
      confirmed_at: ex.confirmed_at,
      error_message: ex.error_message,
      artifact_id: ex.artifact_id,
    }));
  }
}
