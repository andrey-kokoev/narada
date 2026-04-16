/**
 * Mail Execution Lifecycle Adapter
 *
 * Presents mailbox outbound commands through the unified executor
 * lifecycle model without duplicating storage.
 */

import type { OutboundStore } from "../outbound/store.js";
import type { OutboundCommand } from "../outbound/types.js";
import type { ExecutionLifecycle } from "./lifecycle.js";
import {
  mapOutboundStatusToPhase,
  mapOutboundStatusToConfirmation,
} from "./lifecycle.js";

/**
 * Map an outbound command to the unified execution lifecycle view.
 *
 * The outbound store IS the durable source of truth for mail execution.
 * This function is a pure, reconstructible projection.
 */
export function outboundCommandToExecutionLifecycle(
  command: OutboundCommand,
  intentId: string,
): ExecutionLifecycle {
  return {
    execution_id: command.outbound_id,
    intent_id: intentId,
    executor_family: "mail",
    phase: mapOutboundStatusToPhase(command.status),
    confirmation_status: mapOutboundStatusToConfirmation(command.status),
    started_at: command.created_at,
    completed_at: command.submitted_at,
    confirmed_at: command.confirmed_at,
    error_message: command.terminal_reason,
    artifact_id: command.outbound_id,
  };
}

export interface MailLifecycleQueryDeps {
  outboundStore: OutboundStore;
}

/**
 * Read-only adapter for querying mail execution lifecycle.
 */
export class MailLifecycleAdapter {
  constructor(private readonly deps: MailLifecycleQueryDeps) {}

  getLifecycle(outboundId: string, intentId: string): ExecutionLifecycle | undefined {
    const command = this.deps.outboundStore.getCommand(outboundId);
    if (!command) {
      return undefined;
    }
    return outboundCommandToExecutionLifecycle(command, intentId);
  }

  getLifecycleByCommand(command: OutboundCommand, intentId: string): ExecutionLifecycle {
    return outboundCommandToExecutionLifecycle(command, intentId);
  }
}
