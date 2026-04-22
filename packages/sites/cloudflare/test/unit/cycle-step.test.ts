import { describe, it, expect, vi } from "vitest";
import { runCycle, type CycleConfig } from "../../src/runner.js";
import { createMockCycleCoordinator } from "../fixtures/coordinator-fixture.js";
import { createMockEnvForRunner } from "../fixtures/env-fixture.js";
import type { CycleStepHandler, CycleStepResult, CycleStepId } from "../../src/cycle-step.js";
import { CYCLE_STEP_ORDER } from "../../src/cycle-step.js";

function createMockEnv(coordinator: ReturnType<typeof createMockCycleCoordinator>) {
  return createMockEnvForRunner(coordinator);
}

describe("Cycle Step Contract", () => {
  it("calls step handlers in order 2→3→4→5→6→7", async () => {
    const coordinator = createMockCycleCoordinator();
    const callOrder: number[] = [];

    const handlers: Record<CycleStepId, CycleStepHandler> = {
      2: async () => {
        callOrder.push(2);
        return {
          stepId: 2, stepName: "sync", status: "completed",
          recordsWritten: 1, residuals: [],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      },
      3: async () => {
        callOrder.push(3);
        return {
          stepId: 3, stepName: "derive_work", status: "completed",
          recordsWritten: 1, residuals: [],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      },
      4: async () => {
        callOrder.push(4);
        return {
          stepId: 4, stepName: "evaluate", status: "completed",
          recordsWritten: 1, residuals: [],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      },
      5: async () => {
        callOrder.push(5);
        return {
          stepId: 5, stepName: "handoff", status: "completed",
          recordsWritten: 1, residuals: [],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      },
      6: async () => {
        callOrder.push(6);
        return {
          stepId: 6, stepName: "effect_execute", status: "completed",
          recordsWritten: 1, residuals: [],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      },
      7: async () => {
        callOrder.push(7);
        return {
          stepId: 7, stepName: "reconcile", status: "completed",
          recordsWritten: 1, residuals: [],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      },
    };

    const result = await runCycle("test-site", createMockEnv(coordinator), {}, undefined, handlers);

    expect(result.status).toBe("complete");
    expect(callOrder).toEqual([2, 3, 4, 5, 6, 7]);
    expect(result.steps_completed).toContain(2);
    expect(result.steps_completed).toContain(3);
    expect(result.steps_completed).toContain(4);
    expect(result.steps_completed).toContain(5);
    expect(result.steps_completed).toContain(6);
    expect(result.steps_completed).toContain(7);
  });

  it("skipped steps record explicit residuals", async () => {
    const coordinator = createMockCycleCoordinator();

    const result = await runCycle("test-site", createMockEnv(coordinator));

    expect(result.status).toBe("complete");
    expect(result.step_results).toBeDefined();
    expect(result.step_results!.length).toBe(6);

    for (const sr of result.step_results!) {
      expect(sr.status).toBe("skipped");
      expect(sr.residuals.length).toBeGreaterThanOrEqual(1);
      expect(sr.residuals[0]).toMatch(/^fixture_safe_noop:/);
    }
  });

  it("failed step fails the cycle and releases lock", async () => {
    const coordinator = createMockCycleCoordinator();

    const handlers: Record<CycleStepId, CycleStepHandler> = {
      2: async () => ({
        stepId: 2, stepName: "sync", status: "completed",
        recordsWritten: 0, residuals: [],
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      }),
      3: async () => ({
        stepId: 3, stepName: "derive_work", status: "failed",
        recordsWritten: 0, residuals: ["work_derivation_failed"],
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      }),
      4: async () => ({
        stepId: 4, stepName: "evaluate", status: "skipped",
        recordsWritten: 0, residuals: [],
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      }),
      5: async () => ({
        stepId: 5, stepName: "handoff", status: "skipped",
        recordsWritten: 0, residuals: [],
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      }),
      6: async () => ({
        stepId: 6, stepName: "effect_execute", status: "skipped",
        recordsWritten: 0, residuals: [],
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      }),
      7: async () => ({
        stepId: 7, stepName: "reconcile", status: "skipped",
        recordsWritten: 0, residuals: [],
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      }),
    };

    const result = await runCycle("test-site", createMockEnv(coordinator), {}, undefined, handlers);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Step 3 (derive_work) failed");
    expect(result.error).toContain("work_derivation_failed");
    expect(coordinator.releaseLock).toHaveBeenCalledTimes(1);
  });

  it("successful step results are included in trace and cycle result", async () => {
    const coordinator = createMockCycleCoordinator();

    const handlers: Record<CycleStepId, CycleStepHandler> = {
      2: async () => ({
        stepId: 2, stepName: "sync", status: "completed",
        recordsWritten: 3, residuals: ["delta_1", "delta_2"],
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      }),
      3: async () => ({
        stepId: 3, stepName: "derive_work", status: "completed",
        recordsWritten: 1, residuals: ["work_item_42"],
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      }),
      4: async () => ({
        stepId: 4, stepName: "evaluate", status: "skipped",
        recordsWritten: 0, residuals: ["no_charter_configured"],
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      }),
      5: async () => ({
        stepId: 5, stepName: "handoff", status: "skipped",
        recordsWritten: 0, residuals: [],
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      }),
      6: async () => ({
        stepId: 6, stepName: "effect_execute", status: "skipped",
        recordsWritten: 0, residuals: [],
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      }),
      7: async () => ({
        stepId: 7, stepName: "reconcile", status: "skipped",
        recordsWritten: 0, residuals: [],
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      }),
    };

    const result = await runCycle("test-site", createMockEnv(coordinator), {}, undefined, handlers);

    expect(result.status).toBe("complete");
    expect(result.step_results).toBeDefined();
    expect(result.step_results!.length).toBe(6);

    const syncResult = result.step_results!.find((r) => r.stepId === 2);
    expect(syncResult).toBeDefined();
    expect(syncResult!.status).toBe("completed");
    expect(syncResult!.recordsWritten).toBe(3);
    expect(syncResult!.residuals).toEqual(["delta_1", "delta_2"]);

    // Trace should include step results
    expect(coordinator.setLastCycleTrace).toHaveBeenCalledTimes(1);
    const traceArg = vi.mocked(coordinator.setLastCycleTrace).mock.calls[0]![0];
    expect(traceArg.stepResults).toBeDefined();
    expect(traceArg.stepResults!.length).toBe(6);
  });

  it("stops executing steps when deadline is exceeded", async () => {
    const coordinator = createMockCycleCoordinator();
    const callOrder: number[] = [];

    const handlers: Record<CycleStepId, CycleStepHandler> = {
      2: async () => {
        callOrder.push(2);
        return {
          stepId: 2, stepName: "sync", status: "completed",
          recordsWritten: 0, residuals: [],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      },
      3: async () => {
        callOrder.push(3);
        return {
          stepId: 3, stepName: "derive_work", status: "completed",
          recordsWritten: 0, residuals: [],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      },
      4: async () => {
        callOrder.push(4);
        return {
          stepId: 4, stepName: "evaluate", status: "completed",
          recordsWritten: 0, residuals: [],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      },
      5: async () => {
        callOrder.push(5);
        return {
          stepId: 5, stepName: "handoff", status: "completed",
          recordsWritten: 0, residuals: [],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      },
      6: async () => {
        callOrder.push(6);
        return {
          stepId: 6, stepName: "effect_execute", status: "completed",
          recordsWritten: 0, residuals: [],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      },
      7: async () => {
        callOrder.push(7);
        return {
          stepId: 7, stepName: "reconcile", status: "completed",
          recordsWritten: 0, residuals: [],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      },
    };

    // Zero ceiling means canContinue() is false immediately after lock acquisition
    const result = await runCycle(
      "test-site",
      createMockEnv(coordinator),
      { ceilingMs: 0, abortBufferMs: 0 },
      undefined,
      handlers,
    );

    expect(result.status).toBe("partial");
    expect(callOrder.length).toBe(0); // no steps executed because deadline exceeded before first step
  });
});
