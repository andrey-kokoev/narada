/**
 * Foreman Facade Implementation
 *
 * Implements work opening, supersession, evaluation validation,
 * arbitration, and atomic outbound handoff.
 *
 * Spec: .ai/tasks/20260414-014-impl-foreman-core.md
 */

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  ForemanFacade,
  SyncCompletionSignal,
  WorkOpeningResult,
  ChangedConversation,
  ResolveWorkItemRequest,
  ResolutionResult,
  EvaluationEnvelope,
  CharterOutputEnvelope,
  CharterInvocationEnvelope,
} from "./types.js";
import { validateCharterOutput } from "./validation.js";
import { governEvaluation } from "./governance.js";
import { IntentHandoff } from "../intent/handoff.js";
import type {
  CoordinatorStore,
  ConversationRecord,
  WorkItem,
  Evaluation,
  AgentSession,
} from "../coordinator/types.js";
import type { OutboundStore } from "../outbound/store.js";
import type { IntentStore } from "../intent/store.js";
import type { RuntimePolicy } from "../config/types.js";

export interface ForemanFacadeDeps {
  coordinatorStore: CoordinatorStore;
  outboundStore: OutboundStore;
  intentStore: IntentStore;
  db: Database.Database;
  foremanId: string;
  getRuntimePolicy: (mailboxId: string) => RuntimePolicy;
}

export interface ForemanFacadeOptions {
  /** Maximum retries for a work item before terminal failure (default: 3) */
  maxRetries?: number;
}

function makeRevisionId(conversationId: string, ordinal: number): string {
  return `${conversationId}:rev:${ordinal}`;
}

export class DefaultForemanFacade implements ForemanFacade {
  private readonly handoff: IntentHandoff;

  constructor(private readonly deps: ForemanFacadeDeps) {
    this.handoff = new IntentHandoff({
      coordinatorStore: deps.coordinatorStore,
      intentStore: deps.intentStore,
      outboundStore: deps.outboundStore,
    });
  }

  async onSyncCompleted(signal: SyncCompletionSignal): Promise<WorkOpeningResult> {
    const result: WorkOpeningResult = {
      opened: [],
      superseded: [],
      nooped: [],
    };

    for (const changed of signal.changed_conversations) {
      const conversationId = changed.conversation_id;
      const mailboxId = signal.mailbox_id;

      // Ensure conversation record exists and record revision
      let record = this.deps.coordinatorStore.getConversationRecord(conversationId);
      if (!record) {
        record = this.buildConversationRecord(conversationId, mailboxId);
        this.deps.coordinatorStore.upsertConversationRecord(record);
        this.deps.coordinatorStore.upsertThread(this.toThreadRecord(record));
      }

      const latestOrdinal = this.deps.coordinatorStore.getLatestRevisionOrdinal(conversationId) ?? 0;
      let ordinal = latestOrdinal;
      if (changed.current_revision_ordinal > latestOrdinal) {
        ordinal = this.deps.coordinatorStore.nextRevisionOrdinal(conversationId);
      }

      const activeWorkItem = this.deps.coordinatorStore.getActiveWorkItemForConversation(conversationId);

      if (activeWorkItem) {
        // Determine if we should supersede
        const shouldSupersede = this.shouldSupersede(activeWorkItem, changed, ordinal);
        if (shouldSupersede) {
          this.deps.coordinatorStore.updateWorkItemStatus(activeWorkItem.work_item_id, "superseded", {
            updated_at: signal.synced_at,
          });
          this.closeSessionForWorkItem(activeWorkItem.work_item_id, "superseded", signal.synced_at);
          this.handoff.cancelUnsentCommandsForThread(conversationId, "superseded_by_new_revision");
          const newWorkItem = this.openWorkItem(conversationId, mailboxId, makeRevisionId(conversationId, ordinal), signal.synced_at);
          result.superseded.push({
            work_item_id: activeWorkItem.work_item_id,
            conversation_id: conversationId,
            new_work_item_id: newWorkItem.work_item_id,
          });
          result.opened.push({
            work_item_id: newWorkItem.work_item_id,
            conversation_id: conversationId,
            revision_id: makeRevisionId(conversationId, ordinal),
          });
        } else {
          result.nooped.push(conversationId);
        }
      } else {
        // No active work item — open one if change is relevant
        if (this.isChangeRelevant(changed)) {
          const newWorkItem = this.openWorkItem(conversationId, mailboxId, makeRevisionId(conversationId, ordinal), signal.synced_at);
          result.opened.push({
            work_item_id: newWorkItem.work_item_id,
            conversation_id: conversationId,
            revision_id: makeRevisionId(conversationId, ordinal),
          });
        } else {
          result.nooped.push(conversationId);
        }
      }
    }

    return result;
  }

  async resolveWorkItem(resolveReq: ResolveWorkItemRequest): Promise<ResolutionResult> {
    const { work_item_id, execution_id, evaluation } = resolveReq;
    const store = this.deps.coordinatorStore;

    const workItem = store.getWorkItem(work_item_id);
    if (!workItem) {
      return { success: false, resolution_outcome: "failed", error: "Work item not found" };
    }

    if (workItem.status === "resolved") {
      const decisions = this.deps.coordinatorStore.getDecisionsByConversation(workItem.conversation_id, workItem.mailbox_id);
      const materialized = decisions.find((d) => d.outbound_id !== null);
      if (materialized?.outbound_id) {
        return {
          success: true,
          outbound_id: materialized.outbound_id,
          resolution_outcome: "action_created",
        };
      }
      return {
        success: true,
        resolution_outcome: workItem.resolution_outcome ?? "no_op",
      };
    }

    if (workItem.status !== "executing" && workItem.status !== "leased") {
      this.closeSessionForWorkItem(workItem.work_item_id, "abandoned");
      return { success: false, resolution_outcome: "failed", error: `Work item status is ${workItem.status}` };
    }

    // Supersession guard: if a newer work item exists for this conversation, supersede this one
    const latestWorkItem = store.getLatestWorkItemForConversation(workItem.conversation_id);
    if (latestWorkItem && latestWorkItem.work_item_id !== workItem.work_item_id) {
      store.updateWorkItemStatus(workItem.work_item_id, "superseded", {
        updated_at: new Date().toISOString(),
      });
      this.closeSessionForWorkItem(workItem.work_item_id, "superseded");
      return { success: false, resolution_outcome: "failed", error: "superseded_by_new_revision" };
    }

    // Hydrate invocation envelope from execution attempt
    const attempt = store.getExecutionAttempt(execution_id);
    if (!attempt) {
      return { success: false, resolution_outcome: "failed", error: "Execution attempt not found" };
    }

    let invocation: CharterInvocationEnvelope;
    try {
      invocation = JSON.parse(attempt.runtime_envelope_json) as CharterInvocationEnvelope;
    } catch {
      return { success: false, resolution_outcome: "failed", error: "Failed to parse runtime envelope" };
    }

    // Ensure legacy thread record exists for FK compliance (needed before any decision insert)
    const convRecord = this.deps.coordinatorStore.getConversationRecord(workItem.conversation_id);
    if (convRecord) {
      this.deps.coordinatorStore.upsertThread(this.toThreadRecord(convRecord));
    }

    // Reconstruct CharterOutputEnvelope from evaluation for validation
    const outputEnvelope: CharterOutputEnvelope = {
      output_version: evaluation.output_version as "2.0",
      execution_id: evaluation.execution_id,
      charter_id: evaluation.charter_id,
      role: evaluation.role,
      analyzed_at: evaluation.analyzed_at,
      outcome: evaluation.outcome,
      confidence: evaluation.confidence,
      summary: evaluation.summary,
      classifications: evaluation.classifications,
      facts: evaluation.facts,
      recommended_action_class: evaluation.recommended_action_class,
      proposed_actions: evaluation.proposed_actions,
      tool_requests: evaluation.tool_requests,
      escalations: evaluation.escalations,
    };

    const validation = validateCharterOutput(outputEnvelope, invocation);
    const effectiveOutcome = validation.corrected_outcome ?? outputEnvelope.outcome;

    // Handle no-op / escalation / clarification without command creation
    if (effectiveOutcome === "no_op") {
      this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "resolved", {
        resolution_outcome: "no_op",
        updated_at: new Date().toISOString(),
      });
      this.closeSessionForWorkItem(workItem.work_item_id, "completed");
      return { success: true, resolution_outcome: "no_op" };
    }

    if (effectiveOutcome === "escalation") {
      // Write audit decision but no command
      const decisionId = `fd_${workItem.work_item_id}_escalation`;
      const now = new Date().toISOString();
      const existingDecision = this.deps.coordinatorStore.getDecisionById(decisionId);
      if (!existingDecision) {
        this.deps.coordinatorStore.insertDecision({
          decision_id: decisionId,
          conversation_id: workItem.conversation_id,
          mailbox_id: workItem.mailbox_id,
          source_charter_ids_json: JSON.stringify([evaluation.charter_id]),
          approved_action: "escalate_to_human",
          payload_json: JSON.stringify({ reason: evaluation.escalations[0]?.reason ?? "escalation" }),
          rationale: evaluation.summary,
          decided_at: now,
          outbound_id: null,
          created_by: `foreman:${this.deps.foremanId}/charter:${evaluation.charter_id}`,
        });
      }
      this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "resolved", {
        resolution_outcome: "escalated",
        updated_at: now,
      });
      this.closeSessionForWorkItem(workItem.work_item_id, "completed", now);
      return { success: true, decision_id: decisionId, resolution_outcome: "escalated" };
    }

    if (effectiveOutcome === "clarification_needed") {
      this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "failed_retryable", {
        error_message: "clarification_needed",
        updated_at: new Date().toISOString(),
      });
      const session = this.deps.coordinatorStore.getSessionForWorkItem(workItem.work_item_id);
      if (session) {
        this.deps.coordinatorStore.updateAgentSessionStatus(session.session_id, "idle");
        this.deps.coordinatorStore.updateAgentSessionResumeHint(session.session_id, "Clarification needed from operator");
      }
      return { success: false, resolution_outcome: "failed", error: "clarification_needed" };
    }

    // After validation, determine the effective proposed action
    const validActions = validation.stripped_actions
      ? evaluation.proposed_actions.filter(
          (a) => !validation.stripped_actions!.some((s) => s === a),
        )
      : evaluation.proposed_actions;

    if (validActions.length === 0) {
      this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "resolved", {
        resolution_outcome: "no_op",
        updated_at: new Date().toISOString(),
      });
      this.closeSessionForWorkItem(workItem.work_item_id, "completed");
      return { success: true, resolution_outcome: "no_op" };
    }

    // Crash-recovery Path B: decision + command committed, work item not resolved
    const recoveredOutboundId = this.handoff.recoverWorkItemIfCommandExists(
      workItem.work_item_id,
      workItem.conversation_id,
      workItem.mailbox_id,
    );
    if (recoveredOutboundId) {
      this.closeSessionForWorkItem(workItem.work_item_id, "completed");
      return {
        success: true,
        outbound_id: recoveredOutboundId,
        resolution_outcome: "action_created",
      };
    }

    // Apply action governance to structurally-valid actions
    const policy = this.deps.getRuntimePolicy(workItem.mailbox_id);
    const governance = governEvaluation(evaluation, policy, validActions);

    if (governance.outcome === "reject") {
      this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "failed_terminal", {
        resolution_outcome: "failed",
        error_message: governance.reason,
        updated_at: new Date().toISOString(),
      });
      this.closeSessionForWorkItem(workItem.work_item_id, "abandoned");
      return { success: false, resolution_outcome: "failed", error: governance.reason };
    }

    if (governance.outcome === "escalate") {
      const decisionId = `fd_${workItem.work_item_id}_escalation`;
      const now = new Date().toISOString();
      const existingDecision = this.deps.coordinatorStore.getDecisionById(decisionId);
      if (!existingDecision) {
        this.deps.coordinatorStore.insertDecision({
          decision_id: decisionId,
          conversation_id: workItem.conversation_id,
          mailbox_id: workItem.mailbox_id,
          source_charter_ids_json: JSON.stringify([evaluation.charter_id]),
          approved_action: "escalate_to_human",
          payload_json: JSON.stringify({ reason: governance.reason }),
          rationale: evaluation.summary,
          decided_at: now,
          outbound_id: null,
          created_by: `foreman:${this.deps.foremanId}/charter:${evaluation.charter_id}`,
        });
      }
      this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "resolved", {
        resolution_outcome: "escalated",
        updated_at: now,
      });
      this.closeSessionForWorkItem(workItem.work_item_id, "completed", now);
      return { success: true, decision_id: decisionId, resolution_outcome: "escalated" };
    }

    if (governance.outcome === "clarification_needed") {
      this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "failed_retryable", {
        error_message: governance.reason,
        updated_at: new Date().toISOString(),
      });
      const session = this.deps.coordinatorStore.getSessionForWorkItem(workItem.work_item_id);
      if (session) {
        this.deps.coordinatorStore.updateAgentSessionStatus(session.session_id, "idle");
        this.deps.coordinatorStore.updateAgentSessionResumeHint(session.session_id, `Clarification needed: ${governance.reason}`);
      }
      return { success: false, resolution_outcome: "failed", error: governance.reason };
    }

    if (governance.approval_required) {
      const decisionId = `fd_${workItem.work_item_id}_pending_approval`;
      const now = new Date().toISOString();
      const existingDecision = this.deps.coordinatorStore.getDecisionById(decisionId);
      if (!existingDecision) {
        this.deps.coordinatorStore.insertDecision({
          decision_id: decisionId,
          conversation_id: workItem.conversation_id,
          mailbox_id: workItem.mailbox_id,
          source_charter_ids_json: JSON.stringify([evaluation.charter_id]),
          approved_action: "pending_approval",
          payload_json: JSON.stringify({ reason: governance.reason }),
          rationale: evaluation.summary,
          decided_at: now,
          outbound_id: null,
          created_by: `foreman:${this.deps.foremanId}/charter:${evaluation.charter_id}`,
        });
      }
      this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "resolved", {
        resolution_outcome: "pending_approval",
        updated_at: now,
      });
      this.closeSessionForWorkItem(workItem.work_item_id, "completed", now);
      return { success: true, decision_id: decisionId, resolution_outcome: "pending_approval" };
    }

    if (governance.outcome === "no_op") {
      this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "resolved", {
        resolution_outcome: "no_op",
        updated_at: new Date().toISOString(),
      });
      this.closeSessionForWorkItem(workItem.work_item_id, "completed");
      return { success: true, resolution_outcome: "no_op" };
    }

    if (governance.outcome === "accept" && governance.approval_required) {
      const action = governance.governed_action!;
      const decisionId = `fd_${workItem.work_item_id}_pending_approval`;
      const now = new Date().toISOString();
      const existingDecision = this.deps.coordinatorStore.getDecisionById(decisionId);
      if (!existingDecision) {
        this.deps.coordinatorStore.insertDecision({
          decision_id: decisionId,
          conversation_id: workItem.conversation_id,
          mailbox_id: workItem.mailbox_id,
          source_charter_ids_json: JSON.stringify([evaluation.charter_id]),
          approved_action: action.action_type,
          payload_json: action.payload_json,
          rationale: `Pending approval: ${governance.reason}`,
          decided_at: now,
          outbound_id: null,
          created_by: `foreman:${this.deps.foremanId}/charter:${evaluation.charter_id}`,
        });
      }
      this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "resolved", {
        resolution_outcome: "pending_approval",
        updated_at: now,
      });
      this.closeSessionForWorkItem(workItem.work_item_id, "completed", now);
      return { success: true, decision_id: decisionId, resolution_outcome: "pending_approval" };
    }

    // Normal accept path — proceed to atomic handoff
    const chosenAction = governance.governed_action!;

    // Persist evaluation first (outside the main tx to keep it simple, but could be inside)
    this.persistEvaluation(evaluation);

    // Atomic handoff transaction
    const now = new Date().toISOString();
    const decisionId = `fd_${workItem.work_item_id}_${chosenAction.action_type}`;

    try {
      const outboundId = this.deps.db.transaction(() => {
        // Idempotency: decision already materialized?
        const existingDecision = this.deps.coordinatorStore.getDecisionById(decisionId);
        if (existingDecision?.outbound_id) {
          this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "resolved", {
            resolution_outcome: "action_created",
            updated_at: now,
          });
          this.closeSessionForWorkItem(workItem.work_item_id, "completed", now);
          return existingDecision.outbound_id;
        }

        // Insert decision if it does not yet exist (crash-recovery Path A)
        if (!existingDecision) {
          this.deps.coordinatorStore.insertDecision({
            decision_id: decisionId,
            conversation_id: workItem.conversation_id,
            mailbox_id: workItem.mailbox_id,
            source_charter_ids_json: JSON.stringify([evaluation.charter_id]),
            approved_action: chosenAction.action_type,
            payload_json: chosenAction.payload_json,
            rationale: chosenAction.rationale || evaluation.summary,
            decided_at: now,
            outbound_id: null,
            created_by: `foreman:${this.deps.foremanId}/charter:${evaluation.charter_id}`,
          });
        }

        const obId = this.handoff.admitIntentFromDecision({
          decision_id: decisionId,
          conversation_id: workItem.conversation_id,
          mailbox_id: workItem.mailbox_id,
          source_charter_ids_json: JSON.stringify([evaluation.charter_id]),
          approved_action: chosenAction.action_type,
          payload_json: chosenAction.payload_json,
          rationale: chosenAction.rationale || evaluation.summary,
          decided_at: now,
          outbound_id: null,
          created_by: `foreman:${this.deps.foremanId}/charter:${evaluation.charter_id}`,
        });

        // Resolve work item
        this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "resolved", {
          resolution_outcome: "action_created",
          updated_at: now,
        });

        this.closeSessionForWorkItem(workItem.work_item_id, "completed", now);

        return obId;
      })();

      return {
        success: true,
        decision_id: decisionId,
        outbound_id: outboundId,
        resolution_outcome: "action_created",
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, resolution_outcome: "failed", error: msg };
    }
  }

  private buildConversationRecord(conversationId: string, mailboxId: string): ConversationRecord {
    const policy = this.deps.getRuntimePolicy(mailboxId);
    const now = new Date().toISOString();
    return {
      conversation_id: conversationId,
      mailbox_id: mailboxId,
      primary_charter: policy.primary_charter,
      secondary_charters_json: JSON.stringify(policy.secondary_charters ?? []),
      status: "active",
      assigned_agent: null,
      last_message_at: null,
      last_inbound_at: null,
      last_outbound_at: null,
      last_analyzed_at: null,
      last_triaged_at: null,
      created_at: now,
      updated_at: now,
    };
  }

  private toThreadRecord(record: ConversationRecord) {
    return {
      conversation_id: record.conversation_id,
      mailbox_id: record.mailbox_id,
      primary_charter: record.primary_charter,
      secondary_charters_json: record.secondary_charters_json,
      status: record.status,
      assigned_agent: record.assigned_agent,
      last_message_at: record.last_message_at ?? new Date(0).toISOString(),
      last_inbound_at: record.last_inbound_at,
      last_outbound_at: record.last_outbound_at,
      last_analyzed_at: record.last_analyzed_at,
      last_triaged_at: record.last_triaged_at,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  private openWorkItem(conversationId: string, mailboxId: string, revisionId: string, syncedAt: string): WorkItem {
    const workItemId = `wi_${randomUUID()}`;
    const now = syncedAt;
    const item: WorkItem = {
      work_item_id: workItemId,
      conversation_id: conversationId,
      mailbox_id: mailboxId,
      status: "opened",
      priority: 0,
      opened_for_revision_id: revisionId,
      resolved_revision_id: null,
      resolution_outcome: null,
      error_message: null,
      retry_count: 0,
      next_retry_at: null,
      created_at: now,
      updated_at: now,
    };
    this.deps.coordinatorStore.insertWorkItem(item);
    this.deps.coordinatorStore.insertAgentSession({
      session_id: `sess_${randomUUID()}`,
      conversation_id: conversationId,
      work_item_id: workItemId,
      started_at: now,
      ended_at: null,
      updated_at: now,
      status: "opened",
      resume_hint: null,
    });
    return item;
  }

  private closeSessionForWorkItem(workItemId: string, status: AgentSession["status"], endedAt?: string): void {
    const session = this.deps.coordinatorStore.getSessionForWorkItem(workItemId);
    if (session && !session.ended_at) {
      this.deps.coordinatorStore.updateAgentSessionStatus(session.session_id, status, endedAt);
    }
  }

  private shouldSupersede(
    activeWorkItem: WorkItem,
    changed: ChangedConversation,
    currentOrdinal: number,
  ): boolean {
    if (activeWorkItem.status !== "opened" && activeWorkItem.status !== "leased" && activeWorkItem.status !== "executing") {
      return false;
    }
    // Supersede if new revision is higher than what the work item was opened for
    const openedOrdinal = Number(activeWorkItem.opened_for_revision_id.split(":").pop());
    if (currentOrdinal > openedOrdinal) {
      // Material change: new message or participant change
      return (
        changed.change_kinds.includes("new_message") || changed.change_kinds.includes("participant_change")
      );
    }
    return false;
  }

  private isChangeRelevant(changed: ChangedConversation): boolean {
    // In v1, all non-draft changes that touch messages are relevant
    return changed.change_kinds.some((k) => k !== "draft_observed");
  }

  private persistEvaluation(evaluation: EvaluationEnvelope): void {
    const existing = this.deps.coordinatorStore.getEvaluationByExecutionId(evaluation.execution_id);
    if (existing) {
      return;
    }
    const evalRow: Evaluation = {
      evaluation_id: evaluation.evaluation_id,
      execution_id: evaluation.execution_id,
      work_item_id: evaluation.work_item_id,
      conversation_id: evaluation.conversation_id,
      charter_id: evaluation.charter_id,
      role: evaluation.role,
      output_version: evaluation.output_version,
      analyzed_at: evaluation.analyzed_at,
      summary: evaluation.summary,
      classifications_json: JSON.stringify(evaluation.classifications),
      facts_json: JSON.stringify(evaluation.facts),
      escalations_json: JSON.stringify(evaluation.escalations),
      proposed_actions_json: JSON.stringify(evaluation.proposed_actions),
      tool_requests_json: JSON.stringify(evaluation.tool_requests),
      created_at: new Date().toISOString(),
    };
    this.deps.coordinatorStore.insertEvaluation(evalRow);
  }

}
