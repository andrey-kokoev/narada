/**
 * Foreman Outbound Handoff
 *
 * Bridges foreman decisions into outbound commands while preserving
 * the authority boundary that only the outbound worker executes
 * mailbox mutations.
 *
 * Spec: .ai/tasks/20260414-008-assignment-agent-d-outbound-handoff-v2.md
 */

import type { CoordinatorStore, ForemanDecisionRow } from "../coordinator/types.js";
import type { OutboundCommand, OutboundVersion } from "../outbound/types.js";
import type { OutboundStore } from "../outbound/store.js";

export interface OutboundHandoffDeps {
  coordinatorStore: CoordinatorStore;
  outboundStore: OutboundStore;
}

export class OutboundHandoff {
  constructor(private readonly deps: OutboundHandoffDeps) {}

  /**
   * Create an outbound command from a foreman decision.
   *
   * Must be called inside a SQLite transaction (e.g., db.transaction(() => { ... })())
   * to ensure atomicity with the decision insert and work-item resolution.
   *
   * Returns the existing outbound_id if the decision was already materialized.
   */
  createCommandFromDecision(decision: ForemanDecisionRow): string {
    const existing = this.deps.coordinatorStore.getDecisionById(decision.decision_id);
    if (existing?.outbound_id) {
      return existing.outbound_id;
    }

    const outboundId = `ob_${decision.decision_id}`;

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(decision.payload_json);
    } catch {
      // Leave as empty object if payload is unparseable
    }

    const command: OutboundCommand = {
      outbound_id: outboundId,
      conversation_id: decision.conversation_id,
      mailbox_id: decision.mailbox_id,
      action_type: decision.approved_action as OutboundCommand["action_type"],
      status: "pending",
      latest_version: 1,
      created_at: decision.decided_at,
      created_by: decision.created_by,
      submitted_at: null,
      confirmed_at: null,
      blocked_reason: null,
      terminal_reason: null,
    };

    const version: OutboundVersion = {
      outbound_id: outboundId,
      version: 1,
      reply_to_message_id: (payload.reply_to_message_id as string | undefined) || null,
      to: (payload.to as string[] | undefined) || [],
      cc: (payload.cc as string[] | undefined) || [],
      bcc: (payload.bcc as string[] | undefined) || [],
      subject: (payload.subject as string | undefined) || "",
      body_text: (payload.body_text as string | undefined) || "",
      body_html: (payload.body_html as string | undefined) || "",
      idempotency_key: `${outboundId}-v1`,
      policy_snapshot_json: JSON.stringify({ participants: [] }),
      payload_json: decision.payload_json,
      created_at: decision.decided_at,
      superseded_at: null,
    };

    // Guard against partial crash retry where command exists but decision is not yet linked.
    const existingCmd = this.deps.outboundStore.getCommand(outboundId);
    if (!existingCmd) {
      try {
        this.deps.outboundStore.createCommand(command, version);
      } catch (err) {
        // If the command already exists because of a partial crash retry,
        // swallow the unique-constraint error and proceed to link.
        if (this.isUniqueConstraintError(err)) {
          const confirmedCmd = this.deps.outboundStore.getCommand(outboundId);
          if (!confirmedCmd) {
            throw err;
          }
        } else if (err instanceof Error && err.message.includes("Active unsent command already exists")) {
          // Application-level conflict: a different command is still active for this thread+action.
          // Re-throw so the caller can decide to supersede or fail.
          throw err;
        } else {
          throw err;
        }
      }
    }

    this.deps.coordinatorStore.linkDecisionToOutbound(decision.decision_id, outboundId);
    return outboundId;
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
    const decisions = this.deps.coordinatorStore.getDecisionsByConversation(conversationId, mailboxId);
    const materialized = decisions.find((d) => d.outbound_id !== null);
    if (!materialized?.outbound_id) {
      return null;
    }

    const status = this.deps.outboundStore.getCommandStatus(materialized.outbound_id);
    if (!status) {
      return null;
    }

    this.deps.coordinatorStore.updateWorkItemStatus(workItemId, "resolved", {
      resolution_outcome: "action_created",
      updated_at: new Date().toISOString(),
    });

    return materialized.outbound_id;
  }

  /**
   * Cancel all unsent outbound commands for a thread.
   * Used when a work_item is superseded by a newer revision.
   * Returns the number of commands cancelled.
   */
  cancelUnsentCommandsForThread(threadId: string, reason: string): number {
    const active = this.deps.outboundStore.getActiveCommandsForThread(threadId);
    let cancelled = 0;
    for (const cmd of active) {
      if (
        cmd.status === "pending" ||
        cmd.status === "draft_creating" ||
        cmd.status === "draft_ready" ||
        cmd.status === "blocked_policy"
      ) {
        this.deps.outboundStore.updateCommandStatus(cmd.outbound_id, "cancelled", {
          terminal_reason: reason,
        });
        this.deps.outboundStore.appendTransition({
          outbound_id: cmd.outbound_id,
          version: cmd.latest_version,
          from_status: cmd.status,
          to_status: "cancelled",
          reason,
          transition_at: new Date().toISOString(),
        });
        cancelled++;
      }
    }
    return cancelled;
  }

  private isUniqueConstraintError(err: unknown): boolean {
    return (
      err instanceof Error &&
      "code" in err &&
      (err.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || err.code === "SQLITE_CONSTRAINT_UNIQUE")
    );
  }
}
