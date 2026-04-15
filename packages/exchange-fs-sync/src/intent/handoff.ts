/**
 * Intent Handoff
 *
 * Bridges foreman decisions into the domain-neutral Intent boundary,
 * then materializes mailbox-compatible outbound commands for execution.
 *
 * Invariants:
 * - Intent is admitted before any outbound command is created.
 * - Identical intent converges via idempotency_key (effect-of-once).
 * - Replay and crash recovery are safe because Intent is the durable root.
 */

import type { ForemanDecisionRow } from "../coordinator/types.js";
import type { CoordinatorStore } from "../coordinator/types.js";
import type { OutboundStore } from "../outbound/store.js";
import { computeIdempotencyKey } from "../outbound/idempotency.js";
import { OutboundHandoff } from "../foreman/handoff.js";
import type { IntentStore } from "./store.js";
import { toIntentType, toExecutorFamily } from "./types.js";

export interface IntentHandoffDeps {
  coordinatorStore: CoordinatorStore;
  intentStore: IntentStore;
  outboundStore: OutboundStore;
}

export class IntentHandoff {
  private readonly outboundHandoff: OutboundHandoff;

  constructor(private readonly deps: IntentHandoffDeps) {
    this.outboundHandoff = new OutboundHandoff({
      coordinatorStore: deps.coordinatorStore,
      outboundStore: deps.outboundStore,
    });
  }

  /**
   * Admit an intent from a foreman decision and materialize the outbound command.
   *
   * Must be called inside a SQLite transaction for atomicity.
   *
   * Returns the existing or newly created outbound_id.
   */
  admitIntentFromDecision(decision: ForemanDecisionRow): string {
    const existingDecision = this.deps.coordinatorStore.getDecisionById(decision.decision_id);
    if (existingDecision?.outbound_id) {
      return existingDecision.outbound_id;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(decision.payload_json);
    } catch {
      // Leave as empty object if payload is unparseable
    }

    const idempotencyKey = computeIdempotencyKey(
      decision.conversation_id,
      decision.approved_action,
      payload,
    );

    const intentType = toIntentType(decision.approved_action);
    const executorFamily = toExecutorFamily(decision.approved_action);
    const intentId = `int_${idempotencyKey}`;

    // Universal durable boundary: admit the intent first.
    const { intent } = this.deps.intentStore.admit({
      intent_id: intentId,
      intent_type: intentType,
      executor_family: executorFamily,
      payload_json: decision.payload_json,
      idempotency_key: idempotencyKey,
      status: "admitted",
      context_id: decision.conversation_id,
      target_id: null,
      terminal_reason: null,
    });

    // If intent already has a target, the execution artifact was materialized previously.
    if (intent.target_id) {
      if (existingDecision) {
        this.deps.coordinatorStore.linkDecisionToOutbound(decision.decision_id, intent.target_id);
      }
      return intent.target_id;
    }

    // Mailbox compatibility layer: materialize mailbox-specific outbound command.
    if (executorFamily === "mail") {
      const outboundId = this.outboundHandoff.createCommandFromDecision(decision);
      this.deps.intentStore.updateStatus(intentId, "admitted", { target_id: outboundId });
      return outboundId;
    }

    // Non-mailbox intents: the intent itself is the durable root.
    // The executor will bind target_id to the execution record later.
    if (existingDecision) {
      this.deps.coordinatorStore.linkDecisionToOutbound(decision.decision_id, intentId);
    }
    return intentId;
  }

  /**
   * Crash-recovery Path B:
   * If the decision and outbound_command were committed but the work_item
   * was never marked resolved, detect the command and resolve the work_item.
   */
  recoverWorkItemIfCommandExists(
    workItemId: string,
    conversationId: string,
    mailboxId: string,
  ): string | null {
    return this.outboundHandoff.recoverWorkItemIfCommandExists(workItemId, conversationId, mailboxId);
  }

  /**
   * Cancel all unsent outbound commands for a thread.
   * Also cancels corresponding admitted intents.
   */
  cancelUnsentCommandsForThread(threadId: string, reason: string): number {
    const cancelled = this.outboundHandoff.cancelUnsentCommandsForThread(threadId, reason);

    // Cancel any admitted intents for this thread that do not yet have a target.
    const pending = this.deps.intentStore.getPendingIntents("mail").filter(
      (intent) => intent.context_id === threadId && intent.target_id === null,
    );
    for (const intent of pending) {
      this.deps.intentStore.updateStatus(intent.intent_id, "cancelled", { terminal_reason: reason });
    }

    return cancelled;
  }
}
