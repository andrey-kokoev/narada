/**
 * Cycle Step Contract
 *
 * Typed execution surface for steps 2–7 of the bounded Cycle.
 *
 * Ported from packages/sites/cloudflare/src/cycle-step.ts
 * Uses WindowsCycleCoordinator instead of Cloudflare CycleCoordinator.
 */

import type { WindowsCycleCoordinator } from "./cycle-coordinator.js";
import type { Source } from "@narada2/control-plane";
import { sourceRecordToFact } from "@narada2/control-plane";
import {
  buildInvocationEnvelope,
  buildEvaluationRecord,
  persistEvaluation,
} from "@narada2/control-plane";
import type {
  CharterRunner,
  RuntimePolicy,
  PolicyContext,
} from "@narada2/control-plane";

export type CycleStepId = 2 | 3 | 4 | 5 | 6 | 7;

export type CycleStepName =
  | "sync"
  | "derive_work"
  | "evaluate"
  | "handoff"
  | "effect_execute"
  | "reconcile";

export type CycleStepStatus = "completed" | "skipped" | "failed";

export interface CycleStepContext {
  cycleId: string;
  siteId: string;
  scopeId: string;
  coordinator: WindowsCycleCoordinator;
}

export type CycleStepHandler = (
  ctx: CycleStepContext,
  canContinue: () => boolean,
) => Promise<CycleStepResult>;

export interface CycleStepResult {
  stepId: CycleStepId;
  stepName: CycleStepName;
  status: CycleStepStatus;
  recordsWritten: number;
  residuals: string[];
  startedAt: string;
  finishedAt: string;
}

export interface FixtureEvaluationInput {
  workItemId: string;
  contextId: string;
  scopeId: string;
  facts: import("./cycle-coordinator.js").FactRecord[];
}

export interface FixtureEvaluationOutput {
  charterId: string;
  outcome: "propose_action" | "no_action" | "defer";
  summary: string;
  proposedAction?: string;
}

/** Ordered step IDs for the kernel spine (steps 2–7). */
export const CYCLE_STEP_ORDER: CycleStepId[] = [2, 3, 4, 5, 6, 7];

/** Human-readable name for each step ID. */
export const CYCLE_STEP_NAMES: Record<CycleStepId, CycleStepName> = {
  2: "sync",
  3: "derive_work",
  4: "evaluate",
  5: "handoff",
  6: "effect_execute",
  7: "reconcile",
};

// ---------------------------------------------------------------------------
// Fixture evaluator
// ---------------------------------------------------------------------------

export function fixtureEvaluate(input: FixtureEvaluationInput): FixtureEvaluationOutput {
  const factCount = input.facts.length;
  if (factCount === 0) {
    return {
      charterId: "fixture-charter",
      outcome: "no_action",
      summary: `No facts available for work item ${input.workItemId}`,
    };
  }
  return {
    charterId: "fixture-charter",
    outcome: "propose_action",
    summary: `Evaluated work item ${input.workItemId} with ${factCount} facts`,
    proposedAction: "send_reply",
  };
}

// ---------------------------------------------------------------------------
// Step 2: Sync (fixture-backed source delta admission)
// ---------------------------------------------------------------------------

export interface FixtureSourceDelta {
  sourceId: string;
  eventId: string;
  factType: string;
  payloadJson: string;
  observedAt: string;
}

export function createSyncStepHandler(
  deltas: FixtureSourceDelta[],
): CycleStepHandler {
  return async (ctx, canContinue) => {
    const startedAt = new Date().toISOString();

    if (!canContinue()) {
      return {
        stepId: 2,
        stepName: "sync",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["deadline_exceeded_before_start"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    let admitted = 0;
    let skipped = 0;
    const residuals: string[] = [];
    let lastProcessedDelta: FixtureSourceDelta | undefined;

    for (const delta of deltas) {
      if (!canContinue()) {
        residuals.push("deadline_exceeded_mid_sync");
        break;
      }

      if (ctx.coordinator.isEventApplied(delta.eventId)) {
        skipped++;
        lastProcessedDelta = delta;
        continue;
      }

      ctx.coordinator.insertFact({
        factId: delta.eventId,
        sourceId: delta.sourceId,
        factType: delta.factType,
        payloadJson: delta.payloadJson,
        observedAt: delta.observedAt,
        admitted: false,
      });

      ctx.coordinator.markEventApplied(delta.eventId);
      admitted++;
      lastProcessedDelta = delta;
    }

    if (lastProcessedDelta) {
      ctx.coordinator.setCursor(lastProcessedDelta.sourceId, lastProcessedDelta.eventId);
    }

    if (skipped > 0) residuals.push(`skipped_${skipped}_duplicate_events`);
    if (admitted > 0) residuals.push(`admitted_${admitted}_facts`);

    return {
      stepId: 2,
      stepName: "sync",
      status: "completed",
      recordsWritten: admitted,
      residuals,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Step 2 (live variant): Live source sync
// ---------------------------------------------------------------------------

export interface LiveSyncOptions {
  /** Max records to pull in one sync step */
  limit?: number;
  /** If set, only admit facts whose payload carries this conversation_id */
  conversationId?: string;
}

/**
 * Create a live sync step handler that reads from a configured Source.
 *
 * - Pulls a bounded batch from the source using the stored cursor.
 * - Deduplicates via apply-log (idempotency).
 * - Writes new facts through the coordinator.
 * - Updates cursor after successful admission.
 * - Auth/connectivity failures return `failed` with health-compatible residuals.
 */
export function createLiveSyncStepHandler(
  source: Source,
  options?: LiveSyncOptions,
): CycleStepHandler {
  const limit = options?.limit ?? 50;

  return async (ctx, canContinue) => {
    const startedAt = new Date().toISOString();

    if (!canContinue()) {
      return {
        stepId: 2,
        stepName: "sync",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["deadline_exceeded_before_start"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    let batch: import("@narada2/control-plane").SourceBatch;
    try {
      const cursor = ctx.coordinator.getCursor(source.sourceId);
      batch = await source.pull(cursor);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isAuthError = /\b(401|403|auth|token)\b/i.test(errorMessage);
      return {
        stepId: 2,
        stepName: "sync",
        status: "failed",
        recordsWritten: 0,
        residuals: [
          isAuthError
            ? `auth_failed: ${errorMessage}`
            : `connectivity_error: ${errorMessage}`,
        ],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    let admitted = 0;
    let skipped = 0;
    let filtered = 0;
    const residuals: string[] = [];

    for (const record of batch.records.slice(0, limit)) {
      if (!canContinue()) {
        residuals.push("deadline_exceeded_mid_sync");
        break;
      }

      // Conversation filter: narrow to one controlled thread
      if (options?.conversationId) {
        const payload = record.payload as Record<string, unknown> | undefined;
        const recordConversationId = payload?.conversation_id;
        if (recordConversationId !== options.conversationId) {
          filtered++;
          continue;
        }
      }

      if (ctx.coordinator.isEventApplied(record.recordId)) {
        skipped++;
        continue;
      }

      const fact = sourceRecordToFact(record, batch.nextCheckpoint ?? null);
      ctx.coordinator.insertFact({
        factId: fact.fact_id,
        sourceId: fact.provenance.source_id,
        factType: fact.fact_type,
        payloadJson: fact.payload_json,
        observedAt: fact.provenance.observed_at,
        admitted: false,
      });

      ctx.coordinator.markEventApplied(record.recordId);
      admitted++;
    }

    // Update cursor only if we processed at least one record
    if (admitted > 0 || skipped > 0) {
      const nextCursor = batch.nextCheckpoint ?? null;
      if (nextCursor) {
        ctx.coordinator.setCursor(source.sourceId, nextCursor);
      }
    }

    if (filtered > 0) residuals.push(`filtered_${filtered}_by_conversation`);
    if (skipped > 0) residuals.push(`skipped_${skipped}_duplicate_events`);
    if (admitted > 0) residuals.push(`admitted_${admitted}_facts`);
    if (batch.records.length === 0) residuals.push("no_new_records");

    return {
      stepId: 2,
      stepName: "sync",
      status: "completed",
      recordsWritten: admitted,
      residuals,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Step 3: Derive work
// ---------------------------------------------------------------------------

export function createDeriveWorkStepHandler(): CycleStepHandler {
  return async (ctx, canContinue) => {
    const startedAt = new Date().toISOString();

    if (!canContinue()) {
      return {
        stepId: 3,
        stepName: "derive_work",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["deadline_exceeded_before_start"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    const facts = ctx.coordinator.getUnadmittedFacts();
    if (facts.length === 0) {
      return {
        stepId: 3,
        stepName: "derive_work",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["no_unadmitted_facts"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    let contextsCreated = 0;
    let workItemsCreated = 0;
    const residuals: string[] = [];

    const factsBySource = new Map<string, import("./cycle-coordinator.js").FactRecord[]>();
    for (const fact of facts) {
      const list = factsBySource.get(fact.sourceId) ?? [];
      list.push(fact);
      factsBySource.set(fact.sourceId, list);
    }

    for (const [sourceId, sourceFacts] of factsBySource) {
      if (!canContinue()) {
        residuals.push("deadline_exceeded_mid_derive");
        break;
      }

      const contextId = `ctx_${sourceId}_${ctx.cycleId}`;
      ctx.coordinator.insertContextRecord(contextId, ctx.scopeId, "fixture-charter");
      contextsCreated++;

      const workItemId = `wi_${contextId}`;
      ctx.coordinator.insertWorkItem(workItemId, contextId, ctx.scopeId, "opened");
      workItemsCreated++;

      for (const fact of sourceFacts) {
        ctx.coordinator.markFactAdmitted(fact.factId);
      }
    }

    residuals.push(`derived_${contextsCreated}_contexts`);
    residuals.push(`opened_${workItemsCreated}_work_items`);

    return {
      stepId: 3,
      stepName: "derive_work",
      status: "completed",
      recordsWritten: contextsCreated + workItemsCreated,
      residuals,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Step 3 (campaign variant): Real campaign context formation via foreman
// ---------------------------------------------------------------------------

export interface CampaignDeriveWorkConfig {
  campaign_request_senders: string[];
  campaign_request_lookback_days?: number;
}

export function createCampaignDeriveWorkStepHandler(
  config: CampaignDeriveWorkConfig,
): CycleStepHandler {
  return async (ctx, canContinue) => {
    const startedAt = new Date().toISOString();

    if (!canContinue()) {
      return {
        stepId: 3,
        stepName: "derive_work",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["deadline_exceeded_before_start"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    const unadmitted = ctx.coordinator.getUnadmittedFacts();
    if (unadmitted.length === 0) {
      return {
        stepId: 3,
        stepName: "derive_work",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["no_unadmitted_facts"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    const result = await ctx.coordinator.admitCampaignFacts(ctx.scopeId, config);

    const residuals: string[] = [];
    if (result.opened > 0) residuals.push(`opened_${result.opened}_work_items`);
    if (result.superseded > 0) residuals.push(`superseded_${result.superseded}_work_items`);
    if (result.nooped > 0) residuals.push(`nooped_${result.nooped}_contexts`);

    return {
      stepId: 3,
      stepName: "derive_work",
      status: "completed",
      recordsWritten: result.opened + result.superseded,
      residuals,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Step 4: Evaluate
// ---------------------------------------------------------------------------

export function createEvaluateStepHandler(): CycleStepHandler {
  return async (ctx, canContinue) => {
    const startedAt = new Date().toISOString();

    if (!canContinue()) {
      return {
        stepId: 4,
        stepName: "evaluate",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["deadline_exceeded_before_start"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    const workItems = ctx.coordinator.getOpenWorkItems();
    if (workItems.length === 0) {
      return {
        stepId: 4,
        stepName: "evaluate",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["no_open_work_items"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    let evaluationsCreated = 0;
    const residuals: string[] = [];

    for (const wi of workItems) {
      if (!canContinue()) {
        residuals.push("deadline_exceeded_mid_evaluate");
        break;
      }

      const evalOutput = fixtureEvaluate({
        workItemId: wi.workItemId,
        contextId: wi.contextId,
        scopeId: wi.scopeId,
        facts: [
          {
            factId: `fixture_${wi.workItemId}`,
            sourceId: "fixture",
            factType: "fixture.fact",
            payloadJson: "{}",
            observedAt: new Date().toISOString(),
            admitted: true,
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const evaluationId = `eval_${wi.workItemId}_${ctx.cycleId}`;
      ctx.coordinator.insertEvaluation(
        evaluationId,
        wi.workItemId,
        wi.scopeId,
        evalOutput.charterId,
        evalOutput.outcome,
        evalOutput.summary,
      );
      evaluationsCreated++;
    }

    residuals.push(`evaluated_${evaluationsCreated}_work_items`);

    return {
      stepId: 4,
      stepName: "evaluate",
      status: "completed",
      recordsWritten: evaluationsCreated,
      residuals,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Step 4 (campaign variant): Real charter evaluation envelope + runtime
// ---------------------------------------------------------------------------

/** Materializes mail context directly from facts in the PolicyContext.
 *  Used by the Windows Site campaign evaluation step when no FileMessageStore
 *  is available (dry-run / fixture path). */
class SimpleMailMaterializer {
  async materialize(context: PolicyContext): Promise<unknown> {
    const messages: Array<{
      message_id: string;
      conversation_id: string;
      subject: string;
      body_preview: string;
      from_email: string;
      received_at: string;
    }> = [];

    for (const fact of context.facts) {
      if (fact.fact_type !== "mail.message.discovered") continue;
      try {
        const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
        const event = payload.event as Record<string, unknown> | undefined;
        if (!event) continue;
        const body = event.body as Record<string, unknown> | undefined;
        messages.push({
          message_id: (event.message_id as string) ?? fact.fact_id,
          conversation_id: (event.conversation_id as string) ?? context.context_id,
          subject: (event.subject as string) ?? "",
          body_preview: (body?.preview as string) ?? (body?.text as string) ?? "",
          from_email: ((event.from as Record<string, unknown>)?.email as string) ?? "",
          received_at: (event.received_at as string) ?? fact.created_at,
        });
      } catch {
        // ignore parse errors
      }
    }

    return {
      conversation_id: context.context_id,
      messages: messages.sort((a, b) => a.received_at.localeCompare(b.received_at)),
      facts: context.facts,
    };
  }
}

export interface CampaignEvaluateConfig {
  /** Charter runner to invoke. Use MockCharterRunner for tests. */
  charterRunner: CharterRunner;
  /** Runtime policy for the scope. Determines allowed actions and charter binding. */
  getRuntimePolicy: (scopeId: string) => RuntimePolicy;
  /** Site root directory (passed to envelope builder deps). */
  rootDir: string;
}

/**
 * Create a campaign evaluate step handler that builds real invocation envelopes,
 * runs a charter runner, and persists execution attempt + evaluation records.
 *
 * This is distinct from `createEvaluateStepHandler()` which uses the fixture
 * `fixtureEvaluate()` stub. The campaign handler consumes the real envelope
 * shape and produces schema-valid output suitable for foreman handoff.
 */
export function createCampaignEvaluateStepHandler(
  config: CampaignEvaluateConfig,
): CycleStepHandler {
  return async (ctx, canContinue) => {
    const startedAt = new Date().toISOString();

    if (!canContinue()) {
      return {
        stepId: 4,
        stepName: "evaluate",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["deadline_exceeded_before_start"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    const openWorkItemSummaries = ctx.coordinator.getOpenWorkItems();
    if (openWorkItemSummaries.length === 0) {
      return {
        stepId: 4,
        stepName: "evaluate",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["no_open_work_items"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    let evaluationsCreated = 0;
    let evaluationsRejected = 0;
    const residuals: string[] = [];

    for (const summary of openWorkItemSummaries) {
      if (!canContinue()) {
        residuals.push("deadline_exceeded_mid_evaluate");
        break;
      }

      const workItem = ctx.coordinator.coordinatorStore.getWorkItem(summary.workItemId);
      if (!workItem) {
        residuals.push(`work_item_not_found:${summary.workItemId}`);
        continue;
      }

      const executionId = `exec_${workItem.work_item_id}_${ctx.cycleId}`;

      try {
        const envelope = await buildInvocationEnvelope(
          {
            coordinatorStore: ctx.coordinator.coordinatorStore,
            rootDir: config.rootDir,
            getRuntimePolicy: config.getRuntimePolicy,
            materializerRegistry: new (await import("@narada2/control-plane")).VerticalMaterializerRegistry(),
          },
          { executionId, workItem, maxPriorEvaluations: 3, materializer: new SimpleMailMaterializer() },
        );

        // Run charter
        const output = await config.charterRunner.run(envelope);

        // Persist execution attempt + evaluation together
        const now = new Date().toISOString();
        ctx.coordinator.coordinatorStore.insertExecutionAttempt({
          execution_id: executionId,
          work_item_id: workItem.work_item_id,
          revision_id: workItem.opened_for_revision_id,
          session_id: null,
          status: "succeeded",
          started_at: now,
          completed_at: now,
          runtime_envelope_json: JSON.stringify(envelope),
          outcome_json: null,
          error_message: null,
        });

        const evaluationEnvelope = buildEvaluationRecord(output, {
          execution_id: executionId,
          work_item_id: workItem.work_item_id,
          context_id: workItem.context_id,
        });
        persistEvaluation(evaluationEnvelope, ctx.coordinator.coordinatorStore, workItem.scope_id);
        evaluationsCreated++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        residuals.push(`eval_failed:${workItem.work_item_id}:${message}`);
        evaluationsRejected++;

        // Insert a failed execution attempt for auditability
        const now = new Date().toISOString();
        ctx.coordinator.coordinatorStore.insertExecutionAttempt({
          execution_id: executionId,
          work_item_id: workItem.work_item_id,
          revision_id: workItem.opened_for_revision_id,
          session_id: null,
          status: "crashed",
          started_at: now,
          completed_at: now,
          runtime_envelope_json: "{}",
          outcome_json: null,
          error_message: message,
        });
      }
    }

    if (evaluationsCreated > 0) residuals.push(`evaluated_${evaluationsCreated}_work_items`);
    if (evaluationsRejected > 0) residuals.push(`rejected_${evaluationsRejected}_evaluations`);

    return {
      stepId: 4,
      stepName: "evaluate",
      status: evaluationsRejected > 0 && evaluationsCreated === 0 ? "failed" : "completed",
      recordsWritten: evaluationsCreated,
      residuals,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Step 5: Handoff
// ---------------------------------------------------------------------------

export function createHandoffStepHandler(): CycleStepHandler {
  return async (ctx, canContinue) => {
    const startedAt = new Date().toISOString();

    if (!canContinue()) {
      return {
        stepId: 5,
        stepName: "handoff",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["deadline_exceeded_before_start"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    const evaluations = ctx.coordinator.getPendingEvaluations();
    if (evaluations.length === 0) {
      return {
        stepId: 5,
        stepName: "handoff",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["no_pending_evaluations"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    let decisionsCreated = 0;
    let outboundsCreated = 0;
    const residuals: string[] = [];

    for (const ev of evaluations) {
      if (!canContinue()) {
        residuals.push("deadline_exceeded_mid_handoff");
        break;
      }

      const decisionId = `dec_${ev.evaluationId}_${ctx.cycleId}`;
      let outboundId: string | null = null;

      if (ev.outcome === "propose_action") {
        outboundId = `ob_${decisionId}`;
        ctx.coordinator.insertOutboundCommand(
          outboundId,
          ev.contextId,
          ev.scopeId,
          "send_reply",
          "pending",
        );
        outboundsCreated++;
      }

      ctx.coordinator.insertDecision(
        decisionId,
        ev.evaluationId,
        ev.contextId,
        ev.scopeId,
        ev.outcome,
        outboundId,
      );
      decisionsCreated++;
    }

    residuals.push(`decided_${decisionsCreated}_evaluations`);
    if (outboundsCreated > 0) residuals.push(`created_${outboundsCreated}_outbound_commands`);

    return {
      stepId: 5,
      stepName: "handoff",
      status: "completed",
      recordsWritten: decisionsCreated + outboundsCreated,
      residuals,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Step 5 (campaign variant): Real foreman governance + outbound handoff
// ---------------------------------------------------------------------------

export interface CampaignHandoffConfig {
  getRuntimePolicy?: (scopeId: string) => RuntimePolicy;
}

export function createCampaignHandoffStepHandler(
  config?: CampaignHandoffConfig,
): CycleStepHandler {
  return async (ctx, canContinue) => {
    const startedAt = new Date().toISOString();

    if (!canContinue()) {
      return {
        stepId: 5,
        stepName: "handoff",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["deadline_exceeded_before_start"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    const evaluations = ctx.coordinator.getPendingEvaluations();
    if (evaluations.length === 0) {
      return {
        stepId: 5,
        stepName: "handoff",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["no_pending_evaluations"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    let resolved = 0;
    let blocked = 0;
    let failed = 0;
    const residuals: string[] = [];

    for (const ev of evaluations) {
      if (!canContinue()) {
        residuals.push("deadline_exceeded_mid_handoff");
        break;
      }

      const executionId = `exec_${ev.workItemId}_${ctx.cycleId}`;

      try {
        const result = await ctx.coordinator.resolveWorkItemViaForeman(
          ev.workItemId,
          executionId,
          ev.evaluationId,
          config?.getRuntimePolicy,
        );

        if (result.success) {
          resolved++;
          residuals.push(`resolved_${ev.evaluationId}_${result.resolution_outcome}`);
        } else if (result.resolution_outcome === "failed") {
          // Distinguish governance reject from system failure.
          // Governance reject: the foreman explicitly blocked the action.
          // System failure: unexpected error (work item not found, etc.)
          const isGovernanceReject =
            result.error?.includes("not allowed by runtime policy") ?? false;
          if (isGovernanceReject) {
            blocked++;
            residuals.push(`blocked_${ev.evaluationId}_${result.error}`);
          } else {
            failed++;
            residuals.push(`failed_${ev.evaluationId}_${result.error}`);
          }
        } else {
          failed++;
          residuals.push(`failed_${ev.evaluationId}_${result.error}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed++;
        residuals.push(`handoff_exception_${ev.evaluationId}_${message}`);
      }
    }

    if (resolved > 0) residuals.push(`resolved_${resolved}_evaluations`);
    if (blocked > 0) residuals.push(`blocked_${blocked}_evaluations`);
    if (failed > 0) residuals.push(`failed_${failed}_evaluations`);

    return {
      stepId: 5,
      stepName: "handoff",
      status: failed > 0 && resolved === 0 && blocked === 0 ? "failed" : "completed",
      recordsWritten: resolved + blocked,
      residuals,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Step 6: Effect execute (stub for dry run)
// ---------------------------------------------------------------------------

export function createEffectExecuteStepHandler(): CycleStepHandler {
  return async (_ctx, canContinue) => {
    const startedAt = new Date().toISOString();

    if (!canContinue()) {
      return {
        stepId: 6,
        stepName: "effect_execute",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["deadline_exceeded_before_start"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    return {
      stepId: 6,
      stepName: "effect_execute",
      status: "skipped",
      recordsWritten: 0,
      residuals: ["fixture_safe_noop: effect_execute not yet implemented (Task 366)"],
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Step 7: Reconcile (stub for dry run)
// ---------------------------------------------------------------------------

export function createReconcileStepHandler(): CycleStepHandler {
  return async (_ctx, canContinue) => {
    const startedAt = new Date().toISOString();

    if (!canContinue()) {
      return {
        stepId: 7,
        stepName: "reconcile",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["deadline_exceeded_before_start"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    return {
      stepId: 7,
      stepName: "reconcile",
      status: "skipped",
      recordsWritten: 0,
      residuals: ["fixture_safe_noop: reconcile not yet implemented (Task 348)"],
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Default step handler factory
// ---------------------------------------------------------------------------

export function createDefaultStepHandlers(): Record<CycleStepId, CycleStepHandler> {
  return {
    2: createSyncStepHandler([]),
    3: createDeriveWorkStepHandler(),
    4: createEvaluateStepHandler(),
    5: createHandoffStepHandler(),
    6: createEffectExecuteStepHandler(),
    7: createReconcileStepHandler(),
  };
}
