import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
import { createSyncStepHandler, type FixtureSourceDelta } from "../../src/cycle-step.js";
import { runCycle } from "../../src/runner.js";
import { createMockEnvForRunner } from "../fixtures/env-fixture.js";
import { createMockCycleCoordinator } from "../fixtures/coordinator-fixture.js";

function createCoordinator() {
  const db = new Database(":memory:");
  return { db, coordinator: new NaradaSiteCoordinator(createMockState(db)) };
}

const sampleDeltas: FixtureSourceDelta[] = [
  {
    sourceId: "graph-mail",
    eventId: "evt-001",
    factType: "mail.message_created",
    payloadJson: JSON.stringify({ id: "msg-1", subject: "Hello" }),
    observedAt: "2024-01-01T00:00:00Z",
  },
  {
    sourceId: "graph-mail",
    eventId: "evt-002",
    factType: "mail.message_created",
    payloadJson: JSON.stringify({ id: "msg-2", subject: "World" }),
    observedAt: "2024-01-01T00:01:00Z",
  },
];

describe("Fact admission (Task 346)", () => {
  it("persists fixture deltas as durable facts", async () => {
    const { coordinator } = createCoordinator();
    const handler = createSyncStepHandler(sampleDeltas);

    const result = await handler(
      { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any },
      () => true,
    );

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(2);
    expect(result.residuals).toContain("admitted_2_facts");

    expect(coordinator.getFactCount()).toBe(2);
    const fact1 = coordinator.getFactById("evt-001");
    expect(fact1).not.toBeNull();
    expect(fact1!.factType).toBe("mail.message_created");
    expect(fact1!.sourceId).toBe("graph-mail");
    expect(fact1!.admitted).toBe(false);
  });

  it("is idempotent for duplicate event ids", async () => {
    const { coordinator } = createCoordinator();
    const handler = createSyncStepHandler(sampleDeltas);

    // First admission
    await handler(
      { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any },
      () => true,
    );

    // Second admission with same deltas
    const result2 = await handler(
      { cycleId: "c-2", siteId: "test", scopeId: "test", coordinator, env: {} as any },
      () => true,
    );

    expect(result2.status).toBe("completed");
    expect(result2.recordsWritten).toBe(0);
    expect(result2.residuals).toContain("skipped_2_duplicate_events");
    expect(coordinator.getFactCount()).toBe(2);
    expect(coordinator.getAppliedEventCount()).toBe(2);
  });

  it("updates source cursor to last event id", async () => {
    const { coordinator } = createCoordinator();
    const handler = createSyncStepHandler(sampleDeltas);

    await handler(
      { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any },
      () => true,
    );

    expect(coordinator.getCursor("graph-mail")).toBe("evt-002");
  });

  it("returns skipped when deadline is exceeded before start", async () => {
    const { coordinator } = createCoordinator();
    const handler = createSyncStepHandler(sampleDeltas);

    const result = await handler(
      { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any },
      () => false,
    );

    expect(result.status).toBe("skipped");
    expect(result.recordsWritten).toBe(0);
    expect(coordinator.getFactCount()).toBe(0);
  });

  it("aborts mid-sync when deadline is exceeded and reports partial count", async () => {
    const { coordinator } = createCoordinator();
    const handler = createSyncStepHandler(sampleDeltas);

    let callCount = 0;
    const result = await handler(
      { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any },
      () => {
        callCount++;
        return callCount <= 2; // allow lock check + first delta, block second
      },
    );

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(1);
    expect(result.residuals).toContain("deadline_exceeded_mid_sync");
    expect(coordinator.getFactCount()).toBe(1);
    expect(coordinator.getAppliedEventCount()).toBe(1);
    // Cursor must not advance past unprocessed deltas
    expect(coordinator.getCursor("graph-mail")).toBe("evt-001");
  });

  it("persists facts that are visible to downstream step fixtures", async () => {
    const { coordinator } = createCoordinator();

    // Step 2 admits facts
    const syncHandler = createSyncStepHandler(sampleDeltas);
    await syncHandler(
      { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any },
      () => true,
    );

    // Step 3 fixture can read facts
    const fact = coordinator.getFactById("evt-001");
    expect(fact).not.toBeNull();
    expect(JSON.parse(fact!.payloadJson)).toEqual({ id: "msg-1", subject: "Hello" });

    const count = coordinator.getFactCount();
    expect(count).toBe(2);
  });

  it("integrates with the full cycle runner", async () => {
    const coordinator = createMockCycleCoordinator();
    const syncHandler = createSyncStepHandler(sampleDeltas);

    const result = await runCycle(
      "test-site",
      createMockEnvForRunner(coordinator),
      {},
      undefined,
      { 2: syncHandler, 3: createSkippedStep(3), 4: createSkippedStep(4), 5: createSkippedStep(5), 6: createSkippedStep(6) },
    );

    expect(result.status).toBe("complete");
    expect(result.step_results).toBeDefined();
    const syncResult = result.step_results!.find((r) => r.stepId === 2);
    expect(syncResult).toBeDefined();
    expect(syncResult!.status).toBe("completed");
    expect(syncResult!.recordsWritten).toBe(2);

    expect(coordinator.insertFact).toHaveBeenCalledTimes(2);
    expect(coordinator.setCursor).toHaveBeenCalledWith("graph-mail", "evt-002");
  });
});

function createSkippedStep(stepId: 3 | 4 | 5 | 6) {
  return async () => ({
    stepId,
    stepName: ["", "", "sync", "derive_work", "evaluate", "handoff", "reconcile"][stepId] as any,
    status: "skipped" as const,
    recordsWritten: 0,
    residuals: [],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
}
