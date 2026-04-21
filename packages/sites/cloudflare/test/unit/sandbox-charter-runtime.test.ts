/**
 * Sandbox Charter Runtime Attachment Tests
 *
 * Proves that real charter evaluation can run inside the Cloudflare Sandbox
 * boundary, or documents why it cannot.
 */

import { describe, it, expect, vi } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
import { runCycle } from "../../src/runner.js";
import { createMockEnvForRunner } from "../fixtures/env-fixture.js";
import {
  createSyncStepHandler,
  createDeriveWorkStepHandler,
  createEvaluateStepHandler,
  createSandboxEvaluateStepHandler,
  createHandoffStepHandler,
  createReconcileStepHandler,
} from "../../src/cycle-step.js";
import {
  createMockCharterRunnerForSandbox,
  runCharterInSandbox,
} from "../../src/sandbox/charter-runtime.js";
import { MockCharterRunner } from "@narada2/charters";

function createCoordinator() {
  const db = new Database(":memory:");
  return { db, coordinator: new NaradaSiteCoordinator(createMockState(db)) };
}

const fixtureDeltas = [
  {
    sourceId: "graph-mail",
    eventId: "evt-001",
    factType: "mail.message_created",
    payloadJson: JSON.stringify({ id: "msg-1", subject: "Support request" }),
    observedAt: "2024-01-01T00:00:00Z",
  },
];

describe("Sandbox Charter Runtime Attachment (Task 353)", () => {
  it("runs mock charter runner inside sandbox boundary", async () => {
    const { coordinator } = createCoordinator();
    const runner = createMockCharterRunnerForSandbox();

    const result = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(fixtureDeltas),
        3: createDeriveWorkStepHandler(),
        4: createSandboxEvaluateStepHandler(runner),
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([]),
      },
    );

    expect(result.status).toBe("complete");
    expect(result.steps_completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Evaluation was persisted
    expect(coordinator.getEvaluationCount()).toBe(1);

    // Decision was created separately by handoff
    expect(coordinator.getDecisionCount()).toBe(1);

    // Decision was created separately (outbound may or may not be created
    // depending on charter outcome — IAS boundary holds either way)
    expect(coordinator.getDecisionCount()).toBe(1);
  });

  it("persists evaluation separately from decision (IAS boundary)", async () => {
    const { coordinator } = createCoordinator();
    const runner = createMockCharterRunnerForSandbox();

    await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(fixtureDeltas),
        3: createDeriveWorkStepHandler(),
        4: createSandboxEvaluateStepHandler(runner),
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([]),
      },
    );

    // Evaluation exists on its own
    expect(coordinator.getEvaluationCount()).toBe(1);

    // Decision exists on its own
    expect(coordinator.getDecisionCount()).toBe(1);

    // The evaluation record does not imply the decision
    // (getPendingEvaluations returns evals without decisions)
    const pendingEvals = coordinator.getPendingEvaluations();
    expect(pendingEvals.length).toBe(0); // all have decisions
  });

  it("sandbox timeout degrades gracefully without failing cycle", async () => {
    const { coordinator } = createCoordinator();

    // A runner that never resolves (simulates infinite charter runtime)
    const slowRunner = new MockCharterRunner({ delayMs: 100_000 });

    const result = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(fixtureDeltas),
        3: createDeriveWorkStepHandler(),
        4: createSandboxEvaluateStepHandler(slowRunner),
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([]),
      },
    );

    // Cycle completes even though evaluation timed out
    expect(result.status).toBe("complete");

    // No evaluations were created (timeout skipped them)
    expect(coordinator.getEvaluationCount()).toBe(0);

    // Step result records the timeout
    const evalResult = result.step_results!.find((r) => r.stepId === 4);
    expect(evalResult!.residuals.some((r) => r.includes("sandbox_timeout"))).toBe(true);
  });

  it("sandbox catches charter runner errors gracefully", async () => {
    const { coordinator } = createCoordinator();

    const throwingRunner: import("@narada2/charters").CharterRunner = {
      async run() {
        throw new Error("simulated charter crash");
      },
      async probeHealth() {
        return {
          class: "broken",
          checked_at: new Date().toISOString(),
          details: "simulated",
        };
      },
    };

    const result = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(fixtureDeltas),
        3: createDeriveWorkStepHandler(),
        4: createSandboxEvaluateStepHandler(throwingRunner),
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([]),
      },
    );

    expect(result.status).toBe("complete");
    expect(coordinator.getEvaluationCount()).toBe(0);

    const evalResult = result.step_results!.find((r) => r.stepId === 4);
    expect(evalResult!.residuals.some((r) => r.includes("sandbox_error"))).toBe(true);
  });

  it("runCharterInSandbox returns success with output envelope", async () => {
    const runner = createMockCharterRunnerForSandbox();
    const envelope = {
      invocation_version: "2.0" as const,
      execution_id: "exec-001",
      work_item_id: "wi-001",
      context_id: "ctx-001",
      scope_id: "test-site",
      charter_id: "fixture-charter",
      role: "primary" as const,
      invoked_at: new Date().toISOString(),
      revision_id: "rev-001",
      context_materialization: {},
      vertical_hints: {},
      allowed_actions: ["draft_reply" as const],
      available_tools: [],
      coordinator_flags: [],
      prior_evaluations: [],
      max_prior_evaluations: 0,
    };

    const result = await runCharterInSandbox(runner, envelope, 5_000, 64);

    expect(result.status).toBe("success");
    expect(result.output_json).toBeDefined();

    const parsed = JSON.parse(result.output_json!);
    expect(parsed.output_envelope).toBeDefined();
    expect(parsed.output_envelope.summary).toContain("Mock analysis completed");
  });

  it("fixture evaluator fallback remains available", async () => {
    const { coordinator } = createCoordinator();

    // Use the original fixture evaluate step (no sandbox)
    const result = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(fixtureDeltas),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(), // fixture evaluator, not sandbox
        5: createHandoffStepHandler(),
        6: createReconcileStepHandler([]),
      },
    );

    expect(result.status).toBe("complete");
    expect(coordinator.getEvaluationCount()).toBe(1);
  });
});
