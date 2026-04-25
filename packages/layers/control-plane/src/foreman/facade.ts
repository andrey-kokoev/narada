/**
 * Foreman Facade Implementation
 *
 * Implements work opening, supersession, evaluation validation,
 * arbitration, and atomic outbound handoff.
 *
 * Spec: .ai/do-not-open/tasks/20260414-014-impl-foreman-core.md
 */

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  ForemanFacade,
  SyncCompletionSignal,
  WorkOpeningResult,
  ResolveWorkItemRequest,
  ResolutionResult,
  CharterOutputEnvelope,
  CharterInvocationEnvelope,
  PreviewDerivationResult,
} from "./types.js";
import type { Fact } from "../facts/types.js";
import { validateCharterOutput } from "./validation.js";
import { governEvaluation, type GovernEvaluationResult } from "./governance.js";
import { IntentHandoff } from "../intent/handoff.js";
import type { CharterRunner } from "../charter/runner.js";
import { buildInvocationEnvelope, buildEvaluationRecord, VerticalMaterializerRegistry } from "../charter/envelope.js";
import type { PolicyContext, ContextFormationStrategy } from "./context.js";

import type {
  WorkItem,
  AgentSession,
  CoordinatorStore,
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
  getRuntimePolicy: (scopeId: string) => RuntimePolicy;
  contextFormationStrategy: ContextFormationStrategy;
}

export interface ForemanFacadeOptions {
  /** Maximum retries for a work item before terminal failure (default: 3) */
  maxRetries?: number;
}

function makeRevisionId(contextId: string, ordinal: number): string {
  return `${contextId}:rev:${ordinal}`;
}

export class DefaultForemanFacade implements ForemanFacade {
  private readonly handoff: IntentHandoff;
  private readonly contextFormationStrategy: ContextFormationStrategy;
  private readonly maxRetries: number;

  constructor(
    private readonly deps: ForemanFacadeDeps,
    options?: ForemanFacadeOptions,
  ) {
    this.handoff = new IntentHandoff({
      coordinatorStore: deps.coordinatorStore,
      intentStore: deps.intentStore,
      outboundStore: deps.outboundStore,
    });
    this.contextFormationStrategy = deps.contextFormationStrategy;
    this.maxRetries = options?.maxRetries ?? 3;
  }

  async onSyncCompleted(signal: SyncCompletionSignal): Promise<WorkOpeningResult> {
    const contexts: PolicyContext[] = signal.changed_contexts.map((changed) => ({
      context_id: changed.context_id,
      scope_id: signal.scope_id,
      revision_id: makeRevisionId(changed.context_id, changed.current_revision_ordinal),
      previous_revision_ordinal: changed.previous_revision_ordinal,
      current_revision_ordinal: changed.current_revision_ordinal,
      change_kinds: changed.change_kinds,
      facts: [],
      synced_at: signal.synced_at,
    }));
    return this.onContextsAdmitted(contexts);
  }

  async onFactsAdmitted(facts: Fact[], scopeId: string): Promise<WorkOpeningResult> {
    if (facts.length === 0) {
      return { opened: [], superseded: [], nooped: [] };
    }

    const contexts = this.contextFormationStrategy.formContexts(facts, scopeId, {
      getLatestRevisionOrdinal: (id) => this.deps.coordinatorStore.getLatestRevisionOrdinal(id),
    });

    return this.onContextsAdmitted(contexts);
  }

  async deriveWorkFromStoredFacts(facts: Fact[], scopeId: string): Promise<WorkOpeningResult> {
    if (facts.length === 0) {
      return { opened: [], superseded: [], nooped: [] };
    }

    const contexts = this.contextFormationStrategy.formContexts(facts, scopeId, {
      getLatestRevisionOrdinal: (id) => this.deps.coordinatorStore.getLatestRevisionOrdinal(id),
    });

    return this.onContextsAdmitted(contexts);
  }

  async recoverFromStoredFacts(facts: Fact[], scopeId: string): Promise<WorkOpeningResult> {
    // Recovery and replay share the same derivation core: context formation +
    // onContextsAdmitted(). The distinction is in triggering context
    // (loss-shaped recovery vs operator-scoped replay) and intended authority
    // level (admin), not in divergent runtime behavior. Both are conservative:
    // neither creates leases, execution attempts, or outbound commands.
    return this.deriveWorkFromStoredFacts(facts, scopeId);
  }

  async previewWorkFromStoredFacts(
    facts: Fact[],
    scopeId: string,
    charterRunner: CharterRunner,
    materializerRegistry: VerticalMaterializerRegistry,
    options?: { tools?: import("./types.js").ToolCatalogEntry[]; executionIdPrefix?: string; rootDir?: string },
  ): Promise<PreviewDerivationResult[]> {
    if (facts.length === 0) {
      return [];
    }

    const contexts = this.contextFormationStrategy.formContexts(facts, scopeId, {
      getLatestRevisionOrdinal: (id) => this.deps.coordinatorStore.getLatestRevisionOrdinal(id),
    });

    const results: PreviewDerivationResult[] = [];
    const prefix = options?.executionIdPrefix ?? "preview";
    const policy = this.deps.getRuntimePolicy(scopeId);

    for (const context of contexts) {
      const existingRecord = this.deps.coordinatorStore.getContextRecord(context.context_id);
      const fallbackContextRecord = existingRecord
        ? undefined
        : { primary_charter: policy.primary_charter };

      const syntheticWorkItem: WorkItem = {
        work_item_id: `wi_${prefix}_${randomUUID()}`,
        context_id: context.context_id,
        scope_id: scopeId,
        status: "opened",
        priority: 0,
        opened_for_revision_id: context.revision_id,
        resolved_revision_id: null,
        resolution_outcome: null,
        error_message: null,
        retry_count: 0,
        next_retry_at: null,
        context_json: JSON.stringify(context),
        created_at: context.synced_at,
        updated_at: context.synced_at,
        preferred_session_id: null,
        preferred_agent_id: null,
        affinity_group_id: null,
        affinity_strength: 0,
        affinity_expires_at: null,
        affinity_reason: null,
      };

      const executionId = `exec_${prefix}_${randomUUID()}`;

      const envelope = await buildInvocationEnvelope(
        {
          coordinatorStore: this.deps.coordinatorStore,
          rootDir: options?.rootDir ?? "",
          getRuntimePolicy: this.deps.getRuntimePolicy,
          materializerRegistry,
        },
        {
          executionId,
          workItem: syntheticWorkItem,
          tools: options?.tools,
          fallbackContextRecord,
        },
      );

      const output = await charterRunner.run(envelope);

      const evaluation = buildEvaluationRecord(output, {
        execution_id: executionId,
        work_item_id: syntheticWorkItem.work_item_id,
        context_id: context.context_id,
      });

      const validation = validateCharterOutput(output, envelope);
      const effectiveOutcome = validation.corrected_outcome ?? output.outcome;
      const validActions = validation.stripped_actions
        ? evaluation.proposed_actions.filter(
            (a: import("./types.js").ProposedAction) => !validation.stripped_actions!.some((s) => s === a),
          )
        : evaluation.proposed_actions;

      const governance: GovernEvaluationResult = governEvaluation(
        evaluation,
        policy,
        validActions,
        effectiveOutcome,
      );

      results.push({
        context_id: context.context_id,
        scope_id: scopeId,
        revision_id: context.revision_id,
        charter_id: envelope.charter_id,
        envelope,
        output,
        governance: {
          outcome: governance.outcome,
          governed_action: governance.governed_action,
          reason: governance.reason,
          approval_required: governance.approval_required,
          governance_errors: governance.governance_errors,
        },
      });
    }

    return results;
  }

  private onContextsAdmitted(contexts: PolicyContext[]): WorkOpeningResult {
    const result: WorkOpeningResult = {
      opened: [],
      superseded: [],
      nooped: [],
    };

    for (const context of contexts) {
      const contextId = context.context_id;
      const scopeId = context.scope_id;

      // Ensure context record exists and record revision
      let record = this.deps.coordinatorStore.getContextRecord(contextId);
      if (!record) {
        record = this.buildContextRecord(contextId, scopeId);
        this.deps.coordinatorStore.upsertContextRecord(record);
      }

      const latestOrdinal = this.deps.coordinatorStore.getLatestRevisionOrdinal(contextId) ?? 0;
      let ordinal = latestOrdinal;
      if (context.current_revision_ordinal > latestOrdinal) {
        ordinal = this.deps.coordinatorStore.nextRevisionOrdinal(contextId);
      }

      const activeWorkItem = this.deps.coordinatorStore.getActiveWorkItemForContext(contextId);

      if (activeWorkItem) {
        // Determine if we should supersede
        const shouldSupersede = this.shouldSupersede(activeWorkItem, context, ordinal);
        if (shouldSupersede) {
          this.deps.coordinatorStore.updateWorkItemStatus(activeWorkItem.work_item_id, "superseded", {
            updated_at: context.synced_at,
          });
          this.closeSessionForWorkItem(activeWorkItem.work_item_id, "superseded", context.synced_at);
          this.handoff.cancelUnsentCommandsForContext(contextId, "superseded_by_new_revision");
          const newWorkItem = this.openWorkItem(context, activeWorkItem);
          result.superseded.push({
            work_item_id: activeWorkItem.work_item_id,
            context_id: context.context_id,
            new_work_item_id: newWorkItem.work_item_id,
          });
          result.opened.push({
            work_item_id: newWorkItem.work_item_id,
            context_id: contextId,
            revision_id: makeRevisionId(contextId, ordinal),
          });
        } else {
          result.nooped.push(contextId);
        }
      } else {
        // No active work item — open one if change is relevant
        if (this.isChangeRelevant(context)) {
          const newWorkItem = this.openWorkItem(context);
          result.opened.push({
            work_item_id: newWorkItem.work_item_id,
            context_id: contextId,
            revision_id: makeRevisionId(contextId, ordinal),
          });
        } else {
          result.nooped.push(contextId);
        }
      }
    }

    return result;
  }

  async resolveWorkItem(resolveReq: ResolveWorkItemRequest): Promise<ResolutionResult> {
    const { work_item_id, execution_id, evaluation_id } = resolveReq;
    const store = this.deps.coordinatorStore;

    const workItem = store.getWorkItem(work_item_id);
    if (!workItem) {
      return { success: false, resolution_outcome: "failed", error: "Work item not found" };
    }

    if (workItem.status === "resolved") {
      const decisions = this.deps.coordinatorStore.getDecisionsByContext(workItem.context_id, workItem.scope_id);
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

    // Supersession guard: if a newer work item exists for this context, supersede this one
    const latestWorkItem = store.getLatestWorkItemForContext(workItem.context_id);
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

    // Load persisted evaluation by ID — runtime must persist before calling resolveWorkItem
    const evalRow = store.getEvaluationById(evaluation_id);
    if (!evalRow) {
      return { success: false, resolution_outcome: "failed", error: "Evaluation not found" };
    }

    // Reconstruct EvaluationEnvelope from durable row
    const evaluation: import("./types.js").EvaluationEnvelope = {
      evaluation_id: evalRow.evaluation_id,
      execution_id: evalRow.execution_id,
      work_item_id: evalRow.work_item_id,
      context_id: evalRow.context_id,
      charter_id: evalRow.charter_id as import("./types.js").CharterId,
      role: evalRow.role,
      output_version: evalRow.output_version,
      analyzed_at: evalRow.analyzed_at,
      outcome: evalRow.outcome as import("@narada2/charters").CharterOutputEnvelope["outcome"],
      confidence: JSON.parse(evalRow.confidence_json) as import("@narada2/charters").CharterOutputEnvelope["confidence"],
      summary: evalRow.summary,
      classifications: JSON.parse(evalRow.classifications_json) as import("./types.js").CharterClassification[],
      facts: JSON.parse(evalRow.facts_json) as import("./types.js").ExtractedFact[],
      recommended_action_class: evalRow.recommended_action_class
        ? (evalRow.recommended_action_class as import("./types.js").AllowedAction)
        : undefined,
      proposed_actions: JSON.parse(evalRow.proposed_actions_json) as import("./types.js").ProposedAction[],
      tool_requests: JSON.parse(evalRow.tool_requests_json) as import("./types.js").ToolInvocationRequest[],
      escalations: JSON.parse(evalRow.escalations_json) as import("./types.js").EscalationProposal[],
    };

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

    // Determine whether Rule 4 is enforcing charter contract bounds or runtime
    // policy. When invocation.allowed_actions matches policy.allowed_actions,
    // Rule 4 is effectively policy enforcement and should go through governance
    // for explicit rejection. When they differ, Rule 4 is charter contract
    // bounding and should still be enforced by validation.
    const policy = this.deps.getRuntimePolicy(workItem.scope_id);
    const policyActions = new Set(policy.allowed_actions);
    const rule4IsPolicyEnforcement =
      invocation.allowed_actions.length === policy.allowed_actions.length &&
      invocation.allowed_actions.every((a) => policyActions.has(a));

    // Rule 10/4 is a secondary correction triggered by Rule 4 stripping.
    const policyOnlyErrors = rule4IsPolicyEnforcement
      ? validation.errors.filter(
          (e) => e.startsWith("Rule 4:") || e.startsWith("Rule 10/4:"),
        )
      : [];
    const hasStructuralErrors = validation.errors.length > policyOnlyErrors.length;

    const effectiveOutcome = hasStructuralErrors
      ? (validation.corrected_outcome ?? outputEnvelope.outcome)
      : outputEnvelope.outcome;

    const validActions =
      hasStructuralErrors && validation.stripped_actions
        ? evaluation.proposed_actions.filter(
            (a) => !validation.stripped_actions!.some((s) => s === a),
          )
        : evaluation.proposed_actions;

    // Apply governance BEFORE any terminal resolution.
    // Tool requests are part of agent effect authority and must not bypass governance.
    const governance = governEvaluation(evaluation, policy, validActions, effectiveOutcome);

    if (governance.outcome === "reject") {
      this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "failed_terminal", {
        resolution_outcome: "failed",
        error_message: governance.reason,
        updated_at: new Date().toISOString(),
      });
      this.closeSessionForWorkItem(workItem.work_item_id, "abandoned");
      return { success: false, resolution_outcome: "failed", error: governance.reason };
    }

    if (governance.approval_required) {
      const decisionId = `fd_${workItem.work_item_id}_pending_approval`;
      const now = new Date().toISOString();
      const existingDecision = this.deps.coordinatorStore.getDecisionById(decisionId);
      if (!existingDecision) {
        this.deps.coordinatorStore.insertDecision({
          decision_id: decisionId,
          context_id: workItem.context_id,
          scope_id: workItem.scope_id,
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

    if (governance.outcome === "escalate") {
      const decisionId = `fd_${workItem.work_item_id}_escalation`;
      const now = new Date().toISOString();
      const existingDecision = this.deps.coordinatorStore.getDecisionById(decisionId);
      if (!existingDecision) {
        this.deps.coordinatorStore.insertDecision({
          decision_id: decisionId,
          context_id: workItem.context_id,
          scope_id: workItem.scope_id,
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

    if (governance.outcome === "no_op") {
      this.deps.coordinatorStore.updateWorkItemStatus(workItem.work_item_id, "resolved", {
        resolution_outcome: "no_op",
        updated_at: new Date().toISOString(),
      });
      this.closeSessionForWorkItem(workItem.work_item_id, "completed");
      return { success: true, resolution_outcome: "no_op" };
    }

    // At this point: governance.outcome === "accept" and approval_required === false

    // Crash-recovery Path B: decision + command committed, work item not resolved
    const recoveredOutboundId = this.handoff.recoverWorkItemIfCommandExists(
      workItem.work_item_id,
      workItem.context_id,
      workItem.scope_id,
    );
    if (recoveredOutboundId) {
      this.closeSessionForWorkItem(workItem.work_item_id, "completed");
      return {
        success: true,
        outbound_id: recoveredOutboundId,
        resolution_outcome: "action_created",
      };
    }

    // Normal accept path — proceed to atomic handoff
    const chosenAction = governance.governed_action!;

    // Evaluation persistence is the caller's (runtime) responsibility.
    // The foreman only validates and governs the already-persisted evaluation.

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
            context_id: workItem.context_id,
            scope_id: workItem.scope_id,
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
          context_id: workItem.context_id,
          scope_id: workItem.scope_id,
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

  private buildContextRecord(contextId: string, scopeId: string): import("../coordinator/types.js").ContextRecord {
    const policy = this.deps.getRuntimePolicy(scopeId);
    const now = new Date().toISOString();
    return {
      context_id: contextId,
      scope_id: scopeId,
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

  private openWorkItem(context: PolicyContext, carryForwardAffinity?: WorkItem): WorkItem {
    const workItemId = `wi_${randomUUID()}`;
    const now = context.synced_at;

    // Derive continuation affinity from the most recent work item for this context
    const affinity = this.deriveAffinity(context.context_id, carryForwardAffinity);

    const item: WorkItem = {
      work_item_id: workItemId,
      context_id: context.context_id,
      scope_id: context.scope_id,
      status: "opened",
      priority: 0,
      opened_for_revision_id: context.revision_id,
      resolved_revision_id: null,
      resolution_outcome: null,
      error_message: null,
      retry_count: 0,
      next_retry_at: null,
      context_json: JSON.stringify(context),
      created_at: now,
      updated_at: now,
      ...affinity,
    };
    this.deps.coordinatorStore.insertWorkItem(item);
    this.deps.coordinatorStore.insertAgentSession({
      session_id: `sess_${randomUUID()}`,
      context_id: context.context_id,
      work_item_id: workItemId,
      started_at: now,
      ended_at: null,
      updated_at: now,
      status: "opened",
      resume_hint: null,
    });
    return item;
  }

  private deriveAffinity(
    contextId: string,
    carryForward?: WorkItem,
  ): Pick<WorkItem, "preferred_session_id" | "preferred_agent_id" | "affinity_group_id" | "affinity_strength" | "affinity_expires_at" | "affinity_reason"> {
    // If superseding, carry forward the previous item's affinity
    if (carryForward) {
      return {
        preferred_session_id: carryForward.preferred_session_id,
        preferred_agent_id: carryForward.preferred_agent_id,
        affinity_group_id: carryForward.affinity_group_id,
        affinity_strength: carryForward.affinity_strength,
        affinity_expires_at: carryForward.affinity_expires_at,
        affinity_reason: carryForward.affinity_reason,
      };
    }

    // Otherwise, look for the latest completed/terminal work item on this context
    const latest = this.deps.coordinatorStore.getLatestWorkItemForContext(contextId);
    if (latest) {
      const session = this.deps.coordinatorStore.getSessionForWorkItem(latest.work_item_id);
      if (session) {
        const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString(); // 30 minute default
        return {
          preferred_session_id: session.session_id,
          preferred_agent_id: null,
          affinity_group_id: null,
          affinity_strength: 1,
          affinity_expires_at: expiresAt,
          affinity_reason: "same_context",
        };
      }
    }

    return {
      preferred_session_id: null,
      preferred_agent_id: null,
      affinity_group_id: null,
      affinity_strength: 0,
      affinity_expires_at: null,
      affinity_reason: null,
    };
  }

  failWorkItem(workItemId: string, errorMessage: string, retryable: boolean, retryPolicy: "immediate" | "backoff" = "backoff"): void {
    const now = new Date().toISOString();
    const workItem = this.deps.coordinatorStore.getWorkItem(workItemId);
    if (!workItem) {
      throw new Error("Work item not found");
    }

    const newRetryCount = workItem.retry_count + 1;
    const terminal = !retryable || newRetryCount >= this.maxRetries;

    const session = this.deps.coordinatorStore.getSessionForWorkItem(workItemId);

    if (terminal) {
      this.deps.coordinatorStore.updateWorkItemStatus(workItemId, "failed_terminal", {
        error_message: errorMessage,
        updated_at: now,
      });
      if (session) {
        this.deps.coordinatorStore.updateAgentSessionStatus(session.session_id, "abandoned", now);
      }
    } else {
      const nextRetryAt =
        retryPolicy === "immediate"
          ? null
          : new Date(Date.now() + this.calculateBackoff(newRetryCount)).toISOString();
      this.deps.coordinatorStore.updateWorkItemStatus(workItemId, "failed_retryable", {
        retry_count: newRetryCount,
        next_retry_at: nextRetryAt,
        error_message: errorMessage,
        updated_at: now,
      });
      if (session) {
        this.deps.coordinatorStore.updateAgentSessionStatus(session.session_id, "idle");
        this.deps.coordinatorStore.updateAgentSessionResumeHint(
          session.session_id,
          `Execution failed (retry ${newRetryCount}/${this.maxRetries}): ${errorMessage}`,
        );
      }
    }
  }

  private calculateBackoff(retryCount: number): number {
    const jitter = Math.floor(Math.random() * 1000);
    const delay = 5_000 * Math.pow(2, retryCount) + jitter;
    return Math.min(delay, 300_000);
  }

  private closeSessionForWorkItem(workItemId: string, status: AgentSession["status"], endedAt?: string): void {
    const session = this.deps.coordinatorStore.getSessionForWorkItem(workItemId);
    if (session && !session.ended_at) {
      this.deps.coordinatorStore.updateAgentSessionStatus(session.session_id, status, endedAt);
    }
  }

  private shouldSupersede(
    activeWorkItem: WorkItem,
    context: PolicyContext,
    currentOrdinal: number,
  ): boolean {
    if (activeWorkItem.status !== "opened" && activeWorkItem.status !== "leased" && activeWorkItem.status !== "executing") {
      return false;
    }
    // Supersede if new revision is higher than what the work item was opened for
    const openedOrdinal = Number(activeWorkItem.opened_for_revision_id.split(":").pop());
    if (currentOrdinal > openedOrdinal) {
      // Material change: new fact or participant change
      return (
        context.change_kinds.includes("new_fact") ||
        context.change_kinds.includes("new_message") ||
        context.change_kinds.includes("participant_change")
      );
    }
    return false;
  }

  private isChangeRelevant(context: PolicyContext): boolean {
    // All non-draft changes that touch facts are relevant
    return context.change_kinds.some((k) => k !== "draft_observed");
  }

}
