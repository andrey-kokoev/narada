/**
 * Confirmation Resolver Algebra
 *
 * Equalizes confirmation semantics across executor families.
 *
 * Invariant: Execution completion ≠ confirmation.
 * Confirmation is a distinct, durable, replay-safe step.
 */

import type { IntentStore } from "../intent/store.js";
import type { OutboundStore } from "../outbound/store.js";
import type { ProcessExecutionStore } from "./store.js";
import type { ConfirmationStatus } from "./lifecycle.js";
import { mapOutboundStatusToConfirmation } from "./lifecycle.js";

export interface ConfirmationResolver {
  /**
   * Resolve the confirmation status for an intent.
   *
   * For process: reads the execution record and durably persists
   * the derived confirmation_status.
   *
   * For mail: projects the outbound command status into the unified
   * confirmation model (read-only; mail confirmation is already durable
   * in the outbound store).
   *
   * @param intentId - the intent to resolve confirmation for
   * @returns the current confirmation status
   */
  resolve(intentId: string): ConfirmationStatus;
}

export interface ProcessConfirmationResolverDeps {
  executionStore: ProcessExecutionStore;
}

/**
 * Process family confirmation resolver.
 *
 * Reconciles confirmation from the durable execution record.
 * Idempotent: repeated calls produce the same result without mutation.
 */
export class ProcessConfirmationResolver implements ConfirmationResolver {
  constructor(private readonly deps: ProcessConfirmationResolverDeps) {}

  resolve(intentId: string): ConfirmationStatus {
    const execution = this.deps.executionStore.getByIntentId(intentId);
    if (!execution) {
      return "unconfirmed";
    }

    // Idempotent short-circuit
    if (execution.confirmation_status !== "unconfirmed") {
      return execution.confirmation_status;
    }

    // Only terminal phases are eligible for confirmation
    if (execution.phase !== "completed" && execution.phase !== "failed") {
      return "unconfirmed";
    }

    const confirmedAt = new Date().toISOString();
    const status: ConfirmationStatus =
      execution.phase === "completed" && execution.exit_code === 0
        ? "confirmed"
        : "confirmation_failed";

    this.deps.executionStore.updateStatus(execution.execution_id, execution.phase, {
      confirmation_status: status,
      confirmed_at: confirmedAt,
    });

    return status;
  }
}

export interface MailConfirmationResolverDeps {
  outboundStore: OutboundStore;
  intentStore: IntentStore;
}

/**
 * Mail family confirmation resolver.
 *
 * Projects the outbound command status into the unified confirmation model.
 * Mail confirmation is externally driven (Graph API), so this resolver is
 * read-only with respect to the outbound store.
 */
export class MailConfirmationResolver implements ConfirmationResolver {
  constructor(private readonly deps: MailConfirmationResolverDeps) {}

  resolve(intentId: string): ConfirmationStatus {
    const intent = this.deps.intentStore.getById(intentId);
    if (!intent?.target_id) {
      return "unconfirmed";
    }

    const command = this.deps.outboundStore.getCommand(intent.target_id);
    if (!command) {
      return "unconfirmed";
    }

    return mapOutboundStatusToConfirmation(command.status);
  }
}

export interface CompositeConfirmationResolverDeps {
  processResolver: ConfirmationResolver;
  mailResolver: ConfirmationResolver;
}

/**
 * Family-dispatching confirmation resolver.
 */
export class CompositeConfirmationResolver implements ConfirmationResolver {
  constructor(private readonly deps: CompositeConfirmationResolverDeps) {}

  resolve(intentId: string, executorFamily?: string): ConfirmationStatus {
    if (executorFamily === "process") {
      return this.deps.processResolver.resolve(intentId);
    }
    if (executorFamily === "mail") {
      return this.deps.mailResolver.resolve(intentId);
    }
    return "unconfirmed";
  }
}
