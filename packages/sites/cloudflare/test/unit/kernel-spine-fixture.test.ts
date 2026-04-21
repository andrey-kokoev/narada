/**
 * Kernel Spine Fixture
 *
 * Proves the full Cloudflare kernel spine end-to-end through runCycle:
 *
 *   fixture delta
 *   -> durable fact
 *   -> context/work
 *   -> evaluation evidence
 *   -> decision
 *   -> intent/handoff
 *   -> separate observation
 *   -> confirmation
 *   -> trace/health
 *
 * Uses a real SqlStorage-backed coordinator (not mocks) to ensure
 * schema accuracy and durability semantics.
 */

import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
import { runCycle } from "../../src/runner.js";
import { createMockEnvForRunner } from "../fixtures/env-fixture.js";
import {
  createSyncStepHandler,
  createDeriveWorkStepHandler,
  createEvaluateStepHandler,
  createHandoffStepHandler,
  createReconcileStepHandler,
  type FixtureSourceDelta,
  type FixtureObservation,
} from "../../src/cycle-step.js";

function createCoordinator() {
  const db = new Database(":memory:");
  return { db, coordinator: new NaradaSiteCoordinator(createMockState(db)) };
}

const fixtureDeltas: FixtureSourceDelta[] = [
  {
    sourceId: "graph-mail",
    eventId: "evt-001",
    factType: "mail.message_created",
    payloadJson: JSON.stringify({ id: "msg-1", subject: "Support request" }),
    observedAt: "2024-01-01T00:00:00Z",
  },
  {
    sourceId: "graph-mail",
    eventId: "evt-002",
    factType: "mail.message_created",
    payloadJson: JSON.stringify({ id: "msg-2", subject: "Follow-up" }),
    observedAt: "2024-01-01T00:01:00Z",
  },
];

describe("Kernel Spine Fixture (Task 349)", () => {
  it("runs the full kernel spine end-to-end through runCycle", async () => {
    const { coordinator } = createCoordinator();

    const stepHandlers = {
      2: createSyncStepHandler(fixtureDeltas),
      3: createDeriveWorkStepHandler(),
      4: createEvaluateStepHandler(),
      5: createHandoffStepHandler(),
      6: createReconcileStepHandler([
        {
          observationId: "obs-001",
          outboundId: "ob_dec_eval_wi_ctx_graph-mail_c-1_c-1", // will be matched dynamically below
          scopeId: "test-site",
          observedStatus: "confirmed",
          observedAt: "2024-01-01T00:05:00Z",
        },
      ]),
    };

    // We don't know the outboundId ahead of time because it's generated
    // inside handoff. We'll run the cycle, then read the outboundId,
    // and run a second reconciling cycle with the correct observation.
    // For the first cycle, pass empty observations so nothing confirms.
    const result1 = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(fixtureDeltas),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([]),
      },
    );

    expect(result1.status).toBe("complete");
    expect(result1.steps_completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result1.step_results).toBeDefined();
    expect(result1.step_results!.length).toBe(5);

    // Verify step results are recorded
    const syncResult = result1.step_results!.find((r) => r.stepId === 2);
    expect(syncResult!.status).toBe("completed");
    expect(syncResult!.recordsWritten).toBe(2);

    const deriveResult = result1.step_results!.find((r) => r.stepId === 3);
    expect(deriveResult!.status).toBe("completed");
    expect(deriveResult!.recordsWritten).toBeGreaterThanOrEqual(2);

    const evalResult = result1.step_results!.find((r) => r.stepId === 4);
    expect(evalResult!.status).toBe("completed");
    expect(evalResult!.recordsWritten).toBe(1);

    const handoffResult = result1.step_results!.find((r) => r.stepId === 5);
    expect(handoffResult!.status).toBe("completed");
    expect(handoffResult!.recordsWritten).toBeGreaterThanOrEqual(2);

    const reconcileResult = result1.step_results!.find((r) => r.stepId === 6);
    expect(reconcileResult!.status).toBe("completed");
    expect(reconcileResult!.recordsWritten).toBe(0); // no observations yet
    expect(reconcileResult!.residuals).toContain("left_1_pending");

    // Durable state assertions
    expect(coordinator.getFactCount()).toBe(2);
    expect(coordinator.getContextRecordCount()).toBe(1);
    expect(coordinator.getWorkItemCount()).toBe(1);
    expect(coordinator.getEvaluationCount()).toBe(1);
    expect(coordinator.getDecisionCount()).toBe(1);
    expect(coordinator.getOutboundCommandCount()).toBe(1);

    const pending = coordinator.getPendingOutboundCommands();
    expect(pending.length).toBe(1);

    // Second cycle: reconcile with the actual observation
    const outboundId = pending[0]!.outboundId;
    const result2 = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler([]), // no new deltas
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([
          {
            observationId: "obs-001",
            outboundId,
            scopeId: "test-site",
            observedStatus: "confirmed",
            observedAt: "2024-01-01T00:05:00Z",
          },
        ]),
      },
    );

    expect(result2.status).toBe("complete");
    const reconcileResult2 = result2.step_results!.find((r) => r.stepId === 6);
    expect(reconcileResult2!.recordsWritten).toBe(1);
    expect(reconcileResult2!.residuals).toContain("confirmed_1_outbound_commands");
    expect(coordinator.getPendingOutboundCommands().length).toBe(0);
  });

  it("preserves IAS boundaries: facts distinct from context/work", async () => {
    const { coordinator } = createCoordinator();

    await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(fixtureDeltas),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([]),
      },
    );

    // Facts exist independently of context/work
    expect(coordinator.getFactCount()).toBeGreaterThan(0);
    expect(coordinator.getContextRecordCount()).toBeGreaterThan(0);

    // Facts are marked admitted; they don't disappear
    const facts = coordinator.getUnadmittedFacts();
    expect(facts.length).toBe(0); // all admitted by derive_work
  });

  it("preserves IAS boundaries: evaluation distinct from decision", async () => {
    const { coordinator } = createCoordinator();

    await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(fixtureDeltas),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([]),
      },
    );

    // Evaluation and decision are separate records
    expect(coordinator.getEvaluationCount()).toBe(1);
    expect(coordinator.getDecisionCount()).toBe(1);

    // Decision references evaluation via evaluation_id
    const evals = coordinator.getPendingEvaluations();
    expect(evals.length).toBe(0); // all have decisions
  });

  it("preserves IAS boundaries: decision distinct from intent/handoff", async () => {
    const { coordinator } = createCoordinator();

    await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(fixtureDeltas),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([]),
      },
    );

    // Decision and outbound command are separate records
    expect(coordinator.getDecisionCount()).toBe(1);
    expect(coordinator.getOutboundCommandCount()).toBe(1);
  });

  it("preserves IAS boundaries: confirmation requires separate observation", async () => {
    const { coordinator } = createCoordinator();

    // Cycle without observations
    await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(fixtureDeltas),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([]),
      },
    );

    // Outbound remains pending without observation
    expect(coordinator.getPendingOutboundCommands().length).toBe(1);

    // Only an external observation can confirm
    const outboundId = coordinator.getPendingOutboundCommands()[0]!.outboundId;
    await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler([]),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([
          {
            observationId: "obs-confirm",
            outboundId,
            scopeId: "test-site",
            observedStatus: "confirmed",
            observedAt: "2024-01-01T00:10:00Z",
          },
        ]),
      },
    );

    expect(coordinator.getPendingOutboundCommands().length).toBe(0);
  });

  it("trace and health are observation/evidence, not authority", async () => {
    const { coordinator } = createCoordinator();

    const result = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(fixtureDeltas),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([]),
      },
    );

    expect(result.status).toBe("complete");

    // Trace is recorded
    const trace = coordinator.getLastCycleTrace();
    expect(trace).not.toBeNull();
    expect(trace!.stepResults).toBeDefined();
    expect(trace!.stepResults!.length).toBe(5);

    // Health is advisory
    const health = coordinator.getHealth();
    expect(health.status).toBe("healthy");
    expect(health.consecutiveFailures).toBe(0);

    // Removing trace/health does not affect durable boundaries
    // (demonstrated by the fact that all counts remain after trace read)
    expect(coordinator.getFactCount()).toBe(2);
    expect(coordinator.getWorkItemCount()).toBe(1);
    expect(coordinator.getOutboundCommandCount()).toBe(1);
  });
});
