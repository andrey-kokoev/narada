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
  createHandoffStepHandler,
  createReconcileStepHandler,
  createLiveReconcileStepHandler,
  createEffectExecuteStepHandler,
  type FixtureObservation,
} from "../../src/cycle-step.js";
import type { EffectExecutionAdapter } from "../../src/effect-worker.js";
import type { LiveObservationAdapter, LiveObservation } from "../../src/reconciliation/live-observation-adapter.js";

function createCoordinator() {
  const db = new Database(":memory:");
  return { db, coordinator: new NaradaSiteCoordinator(createMockState(db)) };
}

function createMockAdapter(
  overrides?: Partial<EffectExecutionAdapter>,
): EffectExecutionAdapter {
  return {
    attemptEffect: vi.fn(async () => ({ status: "submitted" as const })),
    ...overrides,
  };
}

const sampleDeltas: import("../../src/cycle-step.js").FixtureSourceDelta[] = [
  {
    sourceId: "graph-mail",
    eventId: "evt-001",
    factType: "mail.message_created",
    payloadJson: JSON.stringify({ id: "msg-1", subject: "Hello" }),
    observedAt: "2024-01-01T00:00:00Z",
  },
];

describe("Effect Worker Cycle Integration (Task 366)", () => {
  it("executes approved commands during the cycle and produces submitted", async () => {
    const { coordinator } = createCoordinator();
    const adapter = createMockAdapter();

    // Cycle 1: sync → derive → evaluate → handoff → effect_execute → reconcile
    const result = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(sampleDeltas),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: createHandoffStepHandler(),
        6: createEffectExecuteStepHandler(adapter),
        7: createReconcileStepHandler([]),
      },
    );

    expect(result.status).toBe("complete");
    expect(result.steps_completed).toContain(6);
    expect(result.steps_completed).toContain(7);

    // After handoff, the outbound is in "pending" status — not approved.
    // The effect worker should skip it because it's not approved_for_send.
    const stepResults = result.step_results ?? [];
    const effectResult = stepResults.find((r) => r.stepId === 6);
    expect(effectResult).toBeDefined();
    expect(effectResult!.status).toBe("skipped");
    expect(effectResult!.residuals).toContain("no_approved_commands");
  });

  it("attempts approved_for_send commands through the adapter", async () => {
    const { coordinator } = createCoordinator();
    const adapter = createMockAdapter();

    // Run through handoff to create an outbound
    await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(sampleDeltas),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: createHandoffStepHandler(),
      },
    );

    // Approve the outbound command
    const outboundId = coordinator.getPendingOutboundCommands()[0]!.outboundId;
    coordinator.updateOutboundCommandStatus(outboundId, "approved_for_send");

    // Cycle 2: effect execution should attempt the approved command
    const result = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        6: createEffectExecuteStepHandler(adapter),
        7: createReconcileStepHandler([]),
      },
    );

    expect(result.status).toBe("complete");
    expect(vi.mocked(adapter.attemptEffect)).toHaveBeenCalledTimes(1);

    const stepResults = result.step_results ?? [];
    const effectResult = stepResults.find((r) => r.stepId === 6);
    expect(effectResult).toBeDefined();
    expect(effectResult!.status).toBe("completed");
    expect(effectResult!.residuals).toContain(`submitted_${outboundId}`);

    // Outbound should be submitted, not confirmed
    const outbound = coordinator.getOutboundCommand(outboundId);
    expect(outbound!.status).toBe("submitted");
  });

  it("reconcile remains the only path to confirmed", async () => {
    const { coordinator } = createCoordinator();
    const adapter = createMockAdapter();

    // Run through handoff
    await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(sampleDeltas),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: createHandoffStepHandler(),
      },
    );

    const outboundId = coordinator.getPendingOutboundCommands()[0]!.outboundId;
    coordinator.updateOutboundCommandStatus(outboundId, "approved_for_send");

    // Run effect execution
    await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        6: createEffectExecuteStepHandler(adapter),
      },
    );

    // Status is submitted, not confirmed
    expect(coordinator.getOutboundCommand(outboundId)!.status).toBe("submitted");

    // Mock live observation adapter that confirms the outbound
    const mockObservationAdapter: LiveObservationAdapter = {
      async fetchObservations(): Promise<LiveObservation[]> {
        return [
          {
            outboundId,
            scopeId: "test-site",
            observedStatus: "confirmed",
            observedAt: "2024-01-01T00:05:00Z",
            externalRef: "graph-msg-123",
          },
        ];
      },
    };

    // Run live reconcile
    const result = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        7: createLiveReconcileStepHandler(mockObservationAdapter),
      },
    );

    expect(result.status).toBe("complete");
    expect(coordinator.getOutboundCommand(outboundId)!.status).toBe("confirmed");
  });

  it("adapter failure does not abort the cycle", async () => {
    const { coordinator } = createCoordinator();
    const failingAdapter = createMockAdapter({
      attemptEffect: vi.fn(async () => {
        throw new Error("Graph API unreachable");
      }),
    });

    // Run through handoff
    await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(sampleDeltas),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: createHandoffStepHandler(),
      },
    );

    const outboundId = coordinator.getPendingOutboundCommands()[0]!.outboundId;
    coordinator.updateOutboundCommandStatus(outboundId, "approved_for_send");

    // Run effect execution with failing adapter
    const result = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        6: createEffectExecuteStepHandler(failingAdapter),
        7: createReconcileStepHandler([]),
      },
    );

    // Cycle should still complete; effect step caught the exception
    expect(result.status).toBe("complete");
    expect(result.steps_completed).toContain(6);
    expect(result.steps_completed).toContain(7);

    const stepResults = result.step_results ?? [];
    const effectResult = stepResults.find((r) => r.stepId === 6);
    expect(effectResult).toBeDefined();
    expect(effectResult!.status).toBe("completed");
    expect(effectResult!.residuals.some((r) => r.includes("exception"))).toBe(true);
  });

  it("honest step ordering: handoff (5) → effect_execute (6) → reconcile (7)", async () => {
    const { coordinator } = createCoordinator();
    const adapter = createMockAdapter();
    const callOrder: number[] = [];

    await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        2: createSyncStepHandler(sampleDeltas),
        3: createDeriveWorkStepHandler(),
        4: createEvaluateStepHandler(),
        5: async (ctx, canContinue) => {
          callOrder.push(5);
          return createHandoffStepHandler()(ctx, canContinue);
        },
        6: async (ctx, canContinue) => {
          callOrder.push(6);
          return createEffectExecuteStepHandler(adapter)(ctx, canContinue);
        },
        7: async (ctx, canContinue) => {
          callOrder.push(7);
          return createReconcileStepHandler([])(ctx, canContinue);
        },
      },
    );

    expect(callOrder).toEqual([5, 6, 7]);
  });

  it("unapproved commands are skipped even when adapter is present", async () => {
    const { coordinator } = createCoordinator();
    const adapter = createMockAdapter();

    // Create outbounds in various states
    coordinator.insertOutboundCommand("ob-pending", "ctx-1", "test-site", "send_reply", "pending");
    coordinator.insertOutboundCommand("ob-draft", "ctx-1", "test-site", "send_reply", "draft_ready");
    coordinator.insertOutboundCommand("ob-terminal", "ctx-1", "test-site", "send_reply", "failed_terminal");
    coordinator.insertOutboundCommand("ob-approved", "ctx-1", "test-site", "send_reply", "approved_for_send");

    const result = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      {
        6: createEffectExecuteStepHandler(adapter),
      },
    );

    expect(result.status).toBe("complete");

    // Only the approved command should be attempted
    expect(vi.mocked(adapter.attemptEffect)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(adapter.attemptEffect)).toHaveBeenCalledWith(
      expect.objectContaining({ outboundId: "ob-approved" }),
    );

    const stepResults = result.step_results ?? [];
    const effectResult = stepResults.find((r) => r.stepId === 6);
    expect(effectResult!.recordsWritten).toBe(1);
  });

  it("regression: fixture reconcile skips pending outbounds (submitted-only)", async () => {
    const { coordinator } = createCoordinator();
    const env = { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any };

    // Seed a pending outbound — should NOT be reconciled
    coordinator.insertOutboundCommand("ob-pending", "ctx-1", "test", "send_reply", "pending");

    const result = await createReconcileStepHandler([])(env, () => true);

    expect(result.status).toBe("skipped");
    expect(result.residuals).toContain("no_submitted_outbound_commands");
  });

  it("regression: unexpected executeApprovedCommands exception fails the step", async () => {
    const { coordinator } = createCoordinator();

    coordinator.insertOutboundCommand("ob-001", "ctx-1", "test-site", "send_reply", "approved_for_send");

    // Corrupt the coordinator so getApprovedOutboundCommands throws
    const original = coordinator.getApprovedOutboundCommands.bind(coordinator);
    coordinator.getApprovedOutboundCommands = () => {
      throw new Error("storage corruption");
    };

    const adapter = createMockAdapter();
    const stepHandler = createEffectExecuteStepHandler(adapter);
    const env = { cycleId: "c-1", siteId: "test", scopeId: "test-site", coordinator, env: {} as any };

    const result = await stepHandler(env, () => true);

    // Step should fail, not complete or skip
    expect(result.status).toBe("failed");
    expect(result.residuals).toContain("effect_worker_exception: storage corruption");

    // Restore for cleanup
    coordinator.getApprovedOutboundCommands = original;
  });
});
