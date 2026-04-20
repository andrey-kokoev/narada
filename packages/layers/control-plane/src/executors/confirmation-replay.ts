/**
 * Confirmation Replay Operator
 *
 * Explicit operator that recomputes confirmation state from durable
 * execution/outbound records plus current observation, without
 * re-performing the effect.
 *
 * Boundary: Execution/Outbound → Confirmation
 * Mode: confirm
 * Effect: external-confirmation-only
 * Authority: confirm
 *
 * This is the first-class generic operator for the confirmation-replay
 * family member documented in SEMANTICS.md §2.8.
 *
 * Mail-specific reconciliation (OutboundReconciler) is one vertical
 * instance of this family; this operator generalizes across executor
 * families.
 */

import type { Logger } from "../logging/types.js";
import type { OutboundStore } from "../outbound/store.js";
import type { OutboundCommand } from "../outbound/types.js";
import type { IntentStore } from "../intent/store.js";
import type { ProcessExecutionStore } from "./store.js";
import type { ConfirmationStatus } from "./lifecycle.js";
import { ProcessConfirmationResolver } from "./confirmation.js";
import { OutboundReconciler, type MessageFinder } from "../outbound/reconciler.js";

export interface ConfirmationReplayDeps {
  processStore: ProcessExecutionStore;
  outboundStore: OutboundStore;
  intentStore: IntentStore;
  messageFinder?: MessageFinder;
  logger?: Logger;
  confirmWindowMs?: number;
}

export interface ConfirmationReplaySelection {
  /** Scope to bound the replay (mail family only; process family is not scope-filtered) */
  scopeId?: string;
  /** Specific intent IDs to replay */
  intentIds?: string[];
  /** Specific outbound IDs to replay (mail family) */
  outboundIds?: string[];
  /** Limit the number of items processed */
  limit?: number;
}

export interface ConfirmationReplayDetail {
  /** Intent ID when known */
  intent_id?: string;
  /** Execution ID for process family */
  execution_id?: string;
  /** Outbound ID for mail family */
  outbound_id?: string;
  /** Executor family */
  executor_family: string;
  /** Status before replay */
  previous_status: string;
  /** Status after replay */
  new_status: string;
  /** Human-readable evidence */
  evidence?: string;
}

export interface ConfirmationReplayResult {
  /** Total items examined */
  processed: number;
  /** Items moved to confirmed */
  confirmed: number;
  /** Items moved to confirmation_failed */
  confirmation_failed: number;
  /** Items still unconfirmed (including no-op) */
  still_unconfirmed: number;
  /** Per-item details */
  details: ConfirmationReplayDetail[];
}

export class ConfirmationReplay {
  private readonly processResolver: ProcessConfirmationResolver;
  private readonly mailReconciler: OutboundReconciler | undefined;

  constructor(private readonly deps: ConfirmationReplayDeps) {
    this.processResolver = new ProcessConfirmationResolver({
      executionStore: deps.processStore,
    });

    if (deps.messageFinder) {
      this.mailReconciler = new OutboundReconciler({
        store: deps.outboundStore,
        messageFinder: deps.messageFinder,
        logger: deps.logger,
        confirmWindowMs: deps.confirmWindowMs,
      });
    }
  }

  /**
   * Run bounded confirmation replay across executor families.
   *
   * Never re-executes effects. Only updates confirmation state when
   * confirmation can be proven from durable records + observation.
   */
  async replay(selection: ConfirmationReplaySelection): Promise<ConfirmationReplayResult> {
    const result: ConfirmationReplayResult = {
      processed: 0,
      confirmed: 0,
      confirmation_failed: 0,
      still_unconfirmed: 0,
      details: [],
    };

    const limit = selection.limit ?? 100;

    // Process family replay
    const processDetails = await this.replayProcess(selection, limit);
    for (const d of processDetails) {
      result.processed++;
      if (d.new_status === "confirmed") result.confirmed++;
      else if (d.new_status === "confirmation_failed") result.confirmation_failed++;
      else result.still_unconfirmed++;
      result.details.push(d);
    }

    const remainingLimit = Math.max(0, limit - processDetails.length);

    // Mail family replay
    if (remainingLimit > 0) {
      const mailDetails = await this.replayMail(selection, remainingLimit);
      for (const d of mailDetails) {
        result.processed++;
        if (d.new_status === "confirmed") result.confirmed++;
        else if (d.new_status === "failed_terminal" || d.new_status === "retry_wait") {
          // retry_wait is not yet terminal but has left submitted;
          // count it as confirmation_failed for aggregate purposes
          result.confirmation_failed++;
        } else result.still_unconfirmed++;
        result.details.push(d);
      }
    }

    return result;
  }

  private async replayProcess(
    selection: ConfirmationReplaySelection,
    limit: number,
  ): Promise<ConfirmationReplayDetail[]> {
    const details: ConfirmationReplayDetail[] = [];

    // Build query for unconfirmed process executions in terminal phase
    const db = this.deps.processStore.db;
    const conditions: string[] = [
      "confirmation_status = 'unconfirmed'",
      "phase IN ('completed', 'failed')",
    ];
    const params: (string | number)[] = [];

    if (selection.intentIds && selection.intentIds.length > 0) {
      const placeholders = selection.intentIds.map(() => "?").join(", ");
      conditions.push(`intent_id IN (${placeholders})`);
      params.push(...selection.intentIds);
    }

    const sql = `
      select execution_id, intent_id, phase, confirmation_status
      from process_executions
      where ${conditions.join(" and ")}
      limit ?
    `;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Array<{
      execution_id: string;
      intent_id: string;
      phase: string;
      confirmation_status: string;
    }>;

    for (const row of rows) {
      const previousStatus: ConfirmationStatus = row.confirmation_status as ConfirmationStatus;
      const newStatus = this.processResolver.resolve(row.intent_id);

      const execution = this.deps.processStore.getById(row.execution_id);
      const evidence =
        newStatus === "confirmed"
          ? `Process completed with exit_code ${execution?.exit_code ?? "unknown"}`
          : newStatus === "confirmation_failed"
            ? `Process failed with exit_code ${execution?.exit_code ?? "unknown"}`
            : undefined;

      details.push({
        intent_id: row.intent_id,
        execution_id: row.execution_id,
        executor_family: "process",
        previous_status: previousStatus,
        new_status: newStatus,
        evidence,
      });
    }

    return details;
  }

  private async replayMail(
    selection: ConfirmationReplaySelection,
    limit: number,
  ): Promise<ConfirmationReplayDetail[]> {
    const details: ConfirmationReplayDetail[] = [];

    if (!this.mailReconciler) {
      this.deps.logger?.warn("Mail confirmation replay skipped: no MessageFinder provided");
      return details;
    }

    // If specific outbound IDs are given, reconcile each directly.
    if (selection.outboundIds && selection.outboundIds.length > 0) {
      for (const outboundId of selection.outboundIds.slice(0, limit)) {
        const r = await this.mailReconciler.reconcileOne(outboundId);
        if (!r) continue;
        details.push({
          outbound_id: outboundId,
          executor_family: "mail",
          previous_status: r.previousStatus,
          new_status: r.newStatus,
          evidence: r.evidence,
        });
      }
      return details;
    }

    // If specific intent IDs are given, map them to outbound IDs via target_id.
    if (selection.intentIds && selection.intentIds.length > 0) {
      for (const intentId of selection.intentIds.slice(0, limit)) {
        const intent = this.deps.intentStore.getById(intentId);
        if (!intent?.target_id) continue;

        const r = await this.mailReconciler.reconcileOne(intent.target_id);
        if (!r) continue;
        details.push({
          intent_id: intentId,
          outbound_id: intent.target_id,
          executor_family: "mail",
          previous_status: r.previousStatus,
          new_status: r.newStatus,
          evidence: r.evidence,
        });
      }
      return details;
    }

    // General bounded replay: enumerate submitted commands and reconcile each once.
    const candidates = this.findAllSubmitted(selection.scopeId).slice(0, limit);
    for (const command of candidates) {
      const r = await this.mailReconciler.reconcileOne(command.outbound_id);
      if (!r) continue;

      // Resolve intent_id if possible
      const intentRow = this.deps.intentStore.db
        .prepare("select intent_id from intents where target_id = ? limit 1")
        .get(command.outbound_id) as { intent_id: string } | undefined;

      details.push({
        intent_id: intentRow?.intent_id,
        outbound_id: command.outbound_id,
        executor_family: "mail",
        previous_status: r.previousStatus,
        new_status: r.newStatus,
        evidence: r.evidence,
      });
    }

    return details;
  }

  private findAllSubmitted(scopeId?: string): OutboundCommand[] {
    const candidates = this.deps.outboundStore.fetchNextByStatus(
      "send_reply",
      ["submitted"],
      scopeId,
    );
    const nonSendActions: OutboundCommand["action_type"][] = [
      "mark_read",
      "move_message",
      "set_categories",
    ];
    for (const action of nonSendActions) {
      const more = this.deps.outboundStore.fetchNextByStatus(action, ["submitted"], scopeId);
      candidates.push(...more);
    }
    candidates.sort((a, b) => {
      const aTime = a.command.submitted_at ? new Date(a.command.submitted_at).getTime() : 0;
      const bTime = b.command.submitted_at ? new Date(b.command.submitted_at).getTime() : 0;
      return aTime - bTime;
    });
    return candidates.map((c) => c.command);
  }
}
