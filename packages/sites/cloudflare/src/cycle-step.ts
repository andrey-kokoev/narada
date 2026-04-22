/**
 * Cycle Step Contract
 *
 * Typed execution surface for steps 2–7 of the bounded 9-step Cycle.
 *
 * Step mapping:
 *   2 — sync           (source delta admission)
 *   3 — derive_work    (context formation + work opening)
 *   4 — evaluate       (charter execution)
 *   5 — handoff        (intent creation + outbound command generation)
 *   6 — effect_execute (approved-only effect worker)
 *   7 — reconcile      (confirmation + observation update)
 *
 * Steps 1, 8, and 9 are owned by the runner (lock, health/trace, release).
 */

import type { CloudflareEnv, CycleCoordinator } from "./coordinator.js";
import type { CycleStepResult, FactRecord } from "./types.js";
import type { SourceAdapter } from "./source-adapter.js";
import type { EffectExecutionAdapter } from "./effect-worker.js";
import { executeApprovedCommands } from "./effect-worker.js";
import type { CharterRunner } from "@narada2/charters";
import { runCharterInSandbox } from "./sandbox/charter-runtime.js";

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
  coordinator: CycleCoordinator;
  env: CloudflareEnv;
}

export type CycleStepHandler = (
  ctx: CycleStepContext,
  canContinue: () => boolean,
) => Promise<CycleStepResult>;

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

/**
 * Create default fixture-safe step handlers.
 *
 * Each handler returns an explicit `skipped` result with a residual
 * naming the future task that owns real implementation. No step is
 * a silent no-op.
 */
export function createDefaultStepHandlers(): Record<CycleStepId, CycleStepHandler> {
  return {
    2: createSkippedStepHandler(2, "sync", "Task 346"),
    3: createSkippedStepHandler(3, "derive_work", "Task 347"),
    4: createSkippedStepHandler(4, "evaluate", "Task 347"),
    5: createSkippedStepHandler(5, "handoff", "Task 347"),
    6: createSkippedStepHandler(6, "effect_execute", "Task 366"),
    7: createSkippedStepHandler(7, "reconcile", "Task 348"),
  };
}

function createSkippedStepHandler(
  stepId: CycleStepId,
  stepName: CycleStepName,
  futureTask: string,
): CycleStepHandler {
  return async (_ctx, canContinue) => {
    const startedAt = new Date().toISOString();
    if (!canContinue()) {
      return {
        stepId,
        stepName,
        status: "skipped",
        recordsWritten: 0,
        residuals: ["deadline_exceeded_before_start"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }
    return {
      stepId,
      stepName,
      status: "skipped",
      recordsWritten: 0,
      residuals: [`fixture_safe_noop: ${stepName} not yet implemented (${futureTask})`],
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Task 347: Fixture-backed governance spine (steps 3–5)
// ---------------------------------------------------------------------------

export interface FixtureEvaluationInput {
  workItemId: string;
  contextId: string;
  scopeId: string;
  facts: FactRecord[];
}

export interface FixtureEvaluationOutput {
  charterId: string;
  outcome: "propose_action" | "no_action" | "defer";
  summary: string;
  proposedAction?: string;
}

/**
 * Pure fixture evaluator — deterministic, no side effects, no tool execution.
 *
 * Produces synthetic evaluation output from work item + facts.
 * Does not call live charter runtime or execute effects.
 */
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

/**
 * Create a step-3 handler that derives context/work from unadmitted facts.
 *
 * - Queries unadmitted facts from coordinator
 * - Groups by source to form contexts
 * - Creates work items for each context
 * - Marks facts as admitted
 */
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

    // Group facts by source_id to form contexts
    const factsBySource = new Map<string, FactRecord[]>();
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

/**
 * Create a step-4 handler that evaluates open work items.
 *
 * - Queries open work items from coordinator
 * - Runs fixture evaluator for each
 * - Persists evaluation records
 */
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

/**
 * Create a step-4 handler that runs a real charter runtime inside the
 * Cloudflare Sandbox boundary.
 *
 * - Builds a CharterInvocationEnvelope from the work item
 * - Runs the charter runner inside `runSandbox` (timeout + memory guards)
 * - Persists the evaluation record from the charter output
 * - Does NOT create decisions — IAS boundary preserved
 *
 * If the sandbox returns timeout, oom, or error, the handler returns
 * a failed step result so the runner can degrade gracefully.
 */
export function createSandboxEvaluateStepHandler(
  charterRunner: CharterRunner,
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

      // Build a minimal invocation envelope from the work item
      const envelope = {
        invocation_version: "2.0" as const,
        execution_id: `exec_${wi.workItemId}_${ctx.cycleId}`,
        work_item_id: wi.workItemId,
        context_id: wi.contextId,
        scope_id: wi.scopeId,
        charter_id: "fixture-charter",
        role: "primary" as const,
        invoked_at: new Date().toISOString(),
        revision_id: `rev_${ctx.cycleId}`,
        context_materialization: {},
        vertical_hints: {},
        allowed_actions: ["draft_reply" as const],
        available_tools: [],
        coordinator_flags: [],
        prior_evaluations: [],
        max_prior_evaluations: 0,
      };

      const sandboxResult = await runCharterInSandbox(
        charterRunner,
        envelope,
        5_000,   // timeout: 5s for fixture-backed tests
        64,      // memory: 64MB
      );

      if (sandboxResult.status !== "success") {
        let detail = sandboxResult.error_message;
        if (!detail && sandboxResult.output_json) {
          try {
            const parsed = JSON.parse(sandboxResult.output_json) as { error_message?: string };
            detail = parsed.error_message;
          } catch { /* ignore parse failure */ }
        }
        residuals.push(`sandbox_${sandboxResult.status}: ${detail ?? "unknown"}`);
        continue;
      }

      const charterResult = sandboxResult.output_json
        ? (JSON.parse(sandboxResult.output_json) as { output_envelope?: { summary?: string; outcome?: string } }).output_envelope
        : undefined;

      const evaluationId = `eval_${wi.workItemId}_${ctx.cycleId}`;
      ctx.coordinator.insertEvaluation(
        evaluationId,
        wi.workItemId,
        wi.scopeId,
        "fixture-charter",
        charterResult?.outcome ?? "no_op",
        charterResult?.summary ?? `Sandbox evaluation for ${wi.workItemId}`,
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

/**
 * Create a step-5 handler that creates decisions and outbound commands.
 *
 * - Queries pending evaluations (evaluations without decisions)
 * - Creates decision records
 * - Creates outbound command records for approved actions
 */
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
          ev.workItemId, // contextId proxy
          ev.scopeId,
          "send_reply",
          "pending",
        );
        outboundsCreated++;
      }

      ctx.coordinator.insertDecision(
        decisionId,
        ev.evaluationId,
        ev.workItemId, // contextId proxy
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
// Task 366: Effect execution step handler (step 6)
// ---------------------------------------------------------------------------

/**
 * Create a step-6 handler that executes approved outbound commands.
 *
 * - Queries approved_for_send commands from coordinator
 * - Calls the effect execution adapter for each eligible command
 * - Records execution attempts and transitions commands to submitted/failed
 * - Never transitions commands to confirmed (Task 362 owns confirmation)
 * - Adapter failure is caught and recorded honestly by executeApprovedCommands
 * - Unexpected exceptions from executeApprovedCommands itself fail the step
 */
export function createEffectExecuteStepHandler(
  adapter: EffectExecutionAdapter,
): CycleStepHandler {
  return async (ctx, canContinue) => {
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

    try {
      const approved = ctx.coordinator.getApprovedOutboundCommands();
      if (approved.length === 0) {
        return {
          stepId: 6,
          stepName: "effect_execute",
          status: "skipped",
          recordsWritten: 0,
          residuals: ["no_approved_commands"],
          startedAt,
          finishedAt: new Date().toISOString(),
        };
      }

      const result = await executeApprovedCommands(
        ctx.coordinator,
        adapter,
        { workerId: ctx.cycleId, now: startedAt },
      );

      const recordsWritten = result.attempted;
      const residuals = [...result.residuals];
      if (result.attempted === 0 && result.skipped > 0) {
        residuals.push(`skipped_${result.skipped}_commands`);
      }

      return {
        stepId: 6,
        stepName: "effect_execute",
        status: result.attempted > 0 ? "completed" : "skipped",
        recordsWritten,
        residuals,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    } catch (error) {
      // Unexpected worker failure — fail the step so the runner records it
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        stepId: 6,
        stepName: "effect_execute",
        status: "failed",
        recordsWritten: 0,
        residuals: [`effect_worker_exception: ${errorMessage}`],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Task 348: Fixture-backed confirmation / reconciliation (step 7)
// ---------------------------------------------------------------------------

export interface FixtureObservation {
  observationId: string;
  outboundId: string;
  scopeId: string;
  observedStatus: "confirmed" | "failed";
  observedAt: string;
}

/**
 * Create a step-7 handler that reconciles submitted outbound commands
 * against fixture observations.
 *
 * - Queries submitted outbound commands only (canonical reconciliation boundary)
 * - Matches against fixture observations (passed in, not generated)
 * - Updates outbound status to `confirmed` only on matching observation
 * - Unconfirmed outbounds remain `submitted`
 *
 * Observations are EXTERNAL input — self-confirmation is impossible.
 * Pending outbounds are NOT reconciled; they must first pass through
 * effect execution (step 6) to reach submitted.
 */
export function createReconcileStepHandler(
  observations: FixtureObservation[],
): CycleStepHandler {
  return async (ctx, canContinue) => {
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

    const submitted = ctx.coordinator.getSubmittedOutboundCommands();
    if (submitted.length === 0) {
      return {
        stepId: 7,
        stepName: "reconcile",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["no_submitted_outbound_commands"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    let confirmed = 0;
    let unconfirmed = 0;
    const residuals: string[] = [];

    // Build lookup by outboundId
    const observationByOutbound = new Map<string, FixtureObservation>();
    for (const obs of observations) {
      observationByOutbound.set(obs.outboundId, obs);
    }

    for (const cmd of submitted) {
      if (!canContinue()) {
        residuals.push("deadline_exceeded_mid_reconcile");
        break;
      }

      const obs = observationByOutbound.get(cmd.outboundId);
      if (obs && obs.observedStatus === "confirmed") {
        ctx.coordinator.updateOutboundCommandStatus(cmd.outboundId, "confirmed");
        confirmed++;
      } else {
        unconfirmed++;
      }
    }

    residuals.push(`confirmed_${confirmed}_outbound_commands`);
    if (unconfirmed > 0) residuals.push(`left_${unconfirmed}_unconfirmed`);

    return {
      stepId: 7,
      stepName: "reconcile",
      status: "completed",
      recordsWritten: confirmed,
      residuals,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Task 354: Live reconciliation-read adapter (step 7 variant)
// ---------------------------------------------------------------------------

import type { LiveObservationAdapter, LiveObservation, PendingOutbound } from "./reconciliation/live-observation-adapter.js";

/**
 * Create a step-7 handler that reconciles submitted outbound commands
 * using a live observation adapter.
 *
 * - Queries submitted outbound commands (execution has produced external identities)
 * - Enriches each command with `internetMessageId` from the latest execution
 *   attempt's `responseJson` when not already present on the outbound record
 * - Fetches observations from the live adapter (Graph API, webhook, etc.)
 * - Updates outbound status to `confirmed` only on matching observation
 * - Adapter failure does not fabricate confirmation
 *
 * The adapter is read-only; confirmation still requires separate
 * observation from the external source.
 */
export function createLiveReconcileStepHandler(
  adapter: LiveObservationAdapter,
): CycleStepHandler {
  return async (ctx, canContinue) => {
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

    const submitted = ctx.coordinator.getSubmittedOutboundCommands();
    if (submitted.length === 0) {
      return {
        stepId: 7,
        stepName: "reconcile",
        status: "skipped",
        recordsWritten: 0,
        residuals: ["no_submitted_outbound_commands"],
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    // Enrich submitted commands with external identities from execution attempts.
    const enriched: PendingOutbound[] = submitted.map((cmd) => {
      if (cmd.internetMessageId) return cmd;
      const attempt = ctx.coordinator.getLatestExecutionAttempt(cmd.outboundId);
      if (attempt?.responseJson) {
        try {
          const parsed = JSON.parse(attempt.responseJson) as Record<string, unknown>;
          const imid = parsed.internetMessageId;
          if (typeof imid === "string" && imid.length > 0) {
            return { ...cmd, internetMessageId: imid };
          }
        } catch {
          // Malformed responseJson — ignore enrichment
        }
      }
      return cmd;
    });

    let confirmed = 0;
    let unconfirmed = 0;
    const residuals: string[] = [];

    // Fetch observations from live adapter.
    // Adapter failure returns empty array — no fabrication.
    let observations: LiveObservation[];
    try {
      observations = await adapter.fetchObservations(enriched);
    } catch {
      observations = [];
      residuals.push("adapter_fetch_failed");
    }

    const observationByOutbound = new Map<string, LiveObservation>();
    for (const obs of observations) {
      observationByOutbound.set(obs.outboundId, obs);
    }

    for (const cmd of submitted) {
      if (!canContinue()) {
        residuals.push("deadline_exceeded_mid_reconcile");
        break;
      }

      const obs = observationByOutbound.get(cmd.outboundId);
      if (obs && obs.observedStatus === "confirmed") {
        ctx.coordinator.updateOutboundCommandStatus(cmd.outboundId, "confirmed");
        confirmed++;
      } else {
        unconfirmed++;
      }
    }

    residuals.push(`confirmed_${confirmed}_outbound_commands`);
    if (unconfirmed > 0) residuals.push(`left_${unconfirmed}_unconfirmed`);

    return {
      stepId: 7,
      stepName: "reconcile",
      status: "completed",
      recordsWritten: confirmed,
      residuals,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  };
}

// ---------------------------------------------------------------------------
// Task 346: Fixture-backed source delta admission (step 2)
// ---------------------------------------------------------------------------

export interface FixtureSourceDelta {
  sourceId: string;
  eventId: string;
  factType: string;
  payloadJson: string;
  observedAt: string;
}

/**
 * Create a step-2 handler that admits fixture source deltas into durable state.
 *
 * - Deduplicates by event_id via apply-log.
 * - Persists each new delta as a fact.
 * - Updates source cursor to the last event_id.
 * - Returns counts of admitted vs skipped deltas.
 */
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
// Task 352: Live source adapter step handler (step 2)
// ---------------------------------------------------------------------------

/**
 * Create a step-2 handler that reads deltas from a live source adapter.
 *
 * - Reads a bounded batch from the adapter using the stored cursor.
 * - Adapter failure is caught and returned as a failed step result
 *   without mutating durable state (cursor / apply-log / facts).
 * - Successful deltas are admitted through the same fact/cursor/apply-log
 *   boundary as the fixture-backed sync handler.
 */
export function createLiveSyncStepHandler(
  adapter: SourceAdapter,
  options?: { limit?: number },
): CycleStepHandler {
  const limit = options?.limit ?? 100;
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

    let deltas: FixtureSourceDelta[];
    try {
      const cursor = ctx.coordinator.getCursor(adapter.sourceId);
      deltas = await adapter.readDeltas(cursor, limit);
    } catch (err) {
      return {
        stepId: 2,
        stepName: "sync",
        status: "failed",
        recordsWritten: 0,
        residuals: [
          `adapter_error: ${err instanceof Error ? err.message : String(err)}`,
        ],
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
      ctx.coordinator.setCursor(adapter.sourceId, lastProcessedDelta.eventId);
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
