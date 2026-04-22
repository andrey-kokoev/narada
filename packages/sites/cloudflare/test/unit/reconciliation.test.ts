import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
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

function createEnv(coordinator: ReturnType<typeof createCoordinator>["coordinator"]) {
  return { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any };
}

const sampleDeltas: FixtureSourceDelta[] = [
  {
    sourceId: "graph-mail",
    eventId: "evt-001",
    factType: "mail.message_created",
    payloadJson: JSON.stringify({ id: "msg-1", subject: "Hello" }),
    observedAt: "2024-01-01T00:00:00Z",
  },
];

describe("Reconciliation (Task 348)", () => {
  it("matching observation confirms a submitted outbound command", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    // Run pipeline through handoff
    await createSyncStepHandler(sampleDeltas)(env, () => true);
    await createDeriveWorkStepHandler()(env, () => true);
    await createEvaluateStepHandler()(env, () => true);
    await createHandoffStepHandler()(env, () => true);

    expect(coordinator.getOutboundCommandCount()).toBe(1);

    // Transition to submitted (as effect execution would)
    const outboundId = coordinator.getPendingOutboundCommands()[0]!.outboundId;
    coordinator.updateOutboundCommandStatus(outboundId, "submitted");

    // Provide a matching fixture observation
    const observations: FixtureObservation[] = [
      {
        observationId: "obs-1",
        outboundId,
        scopeId: "test",
        observedStatus: "confirmed",
        observedAt: "2024-01-01T00:05:00Z",
      },
    ];

    const result = await createReconcileStepHandler(observations)(env, () => true);

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(1);
    expect(result.residuals).toContain("confirmed_1_outbound_commands");

    const submitted = coordinator.getSubmittedOutboundCommands();
    expect(submitted.length).toBe(0);
  });

  it("missing observation does not confirm a submitted command", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    await createSyncStepHandler(sampleDeltas)(env, () => true);
    await createDeriveWorkStepHandler()(env, () => true);
    await createEvaluateStepHandler()(env, () => true);
    await createHandoffStepHandler()(env, () => true);

    // Transition to submitted (as effect execution would)
    const outboundId = coordinator.getPendingOutboundCommands()[0]!.outboundId;
    coordinator.updateOutboundCommandStatus(outboundId, "submitted");

    // No observations provided
    const result = await createReconcileStepHandler([])(env, () => true);

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(0);
    expect(result.residuals).toContain("confirmed_0_outbound_commands");
    expect(result.residuals).toContain("left_1_unconfirmed");

    const submitted = coordinator.getSubmittedOutboundCommands();
    expect(submitted.length).toBe(1);
  });

  it("evaluator output alone cannot confirm", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    // Run through evaluation (no handoff, no observation)
    await createSyncStepHandler(sampleDeltas)(env, () => true);
    await createDeriveWorkStepHandler()(env, () => true);
    await createEvaluateStepHandler()(env, () => true);

    // No handoff = no outbound commands
    expect(coordinator.getPendingOutboundCommands().length).toBe(0);

    // Even if we provide an observation, there's nothing to confirm
    const observations: FixtureObservation[] = [
      { observationId: "obs-1", outboundId: "fake", scopeId: "test", observedStatus: "confirmed", observedAt: "2024-01-01T00:05:00Z" },
    ];

    const result = await createReconcileStepHandler(observations)(env, () => true);
    expect(result.status).toBe("skipped");
    expect(result.residuals).toContain("no_submitted_outbound_commands");
  });

  it("execution/attempt record alone cannot confirm unless observation says so", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    // Full pipeline
    await createSyncStepHandler(sampleDeltas)(env, () => true);
    await createDeriveWorkStepHandler()(env, () => true);
    await createEvaluateStepHandler()(env, () => true);
    await createHandoffStepHandler()(env, () => true);

    // Transition to submitted (as effect execution would)
    const outboundId = coordinator.getPendingOutboundCommands()[0]!.outboundId;
    coordinator.updateOutboundCommandStatus(outboundId, "submitted");

    // Insert a fixture observation with FAILED status
    coordinator.insertFixtureObservation("obs-fail", outboundId, "test", "failed", "2024-01-01T00:05:00Z");

    // Even though the observation exists, it says "failed" not "confirmed"
    const result = await createReconcileStepHandler([])(env, () => true);

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(0);
    expect(result.residuals).toContain("left_1_unconfirmed");
  });

  it("partial confirmation when only some observations match", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    // Admit two facts from different sources to get two outbounds in one cycle
    const deltas: FixtureSourceDelta[] = [
      {
        sourceId: "graph-mail",
        eventId: "evt-001",
        factType: "mail.message_created",
        payloadJson: JSON.stringify({ id: "msg-1", subject: "Hello" }),
        observedAt: "2024-01-01T00:00:00Z",
      },
      {
        sourceId: "timer",
        eventId: "evt-002",
        factType: "timer.fired",
        payloadJson: JSON.stringify({ cron: "0 9 * * *" }),
        observedAt: "2024-01-01T00:01:00Z",
      },
    ];

    await createSyncStepHandler(deltas)(env, () => true);
    await createDeriveWorkStepHandler()(env, () => true);
    await createEvaluateStepHandler()(env, () => true);
    await createHandoffStepHandler()(env, () => true);

    // Transition both to submitted (as effect execution would)
    const pending = coordinator.getPendingOutboundCommands();
    expect(pending.length).toBe(2);
    for (const cmd of pending) {
      coordinator.updateOutboundCommandStatus(cmd.outboundId, "submitted");
    }

    const submitted = coordinator.getSubmittedOutboundCommands();
    expect(submitted.length).toBe(2);

    // Only confirm the first one
    const observations: FixtureObservation[] = [
      {
        observationId: "obs-1",
        outboundId: submitted[0]!.outboundId,
        scopeId: "test",
        observedStatus: "confirmed",
        observedAt: "2024-01-01T00:05:00Z",
      },
    ];

    const result = await createReconcileStepHandler(observations)(env, () => true);

    expect(result.recordsWritten).toBe(1);
    expect(result.residuals).toContain("confirmed_1_outbound_commands");
    expect(result.residuals).toContain("left_1_unconfirmed");

    expect(coordinator.getSubmittedOutboundCommands().length).toBe(1);
  });

  it("self-confirmation is impossible without external observation", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    await createSyncStepHandler(sampleDeltas)(env, () => true);
    await createDeriveWorkStepHandler()(env, () => true);
    await createEvaluateStepHandler()(env, () => true);
    await createHandoffStepHandler()(env, () => true);

    // Transition to submitted (as effect execution would)
    const outboundId = coordinator.getPendingOutboundCommands()[0]!.outboundId;
    coordinator.updateOutboundCommandStatus(outboundId, "submitted");

    // The reconcile handler receives observations as INPUT.
    // If no observations are passed, nothing gets confirmed.
    // The handler cannot generate observations from its own state.
    const result = await createReconcileStepHandler([])(env, () => true);

    expect(result.recordsWritten).toBe(0);
    expect(coordinator.getSubmittedOutboundCommands().length).toBe(1);
  });
});
