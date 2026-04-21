import { describe, it, expect } from "vitest";
import { createCycleFixture } from "../fixtures/cycle.js";

describe("Cycle handler integration", () => {
  it("accepts a valid cycle request and persists health + trace", async () => {
    const fixture = createCycleFixture("test-site");
    const response = await fixture.invoke({
      scope_id: "test-site",
      correlation_id: "corr-123",
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.status).toBe("accepted");
    expect(body.correlation_id).toBe("corr-123");

    // Integration semantics: the handler invoked runCycle through the real
    // entrypoint chain (index.ts → cycle-entrypoint.ts → runner.ts), which
    // acquired a lock, wrote health, and persisted a trace.
    const health = fixture.site.coordinator.getHealth();
    expect(health.status).toBe("healthy");
    expect(health.locked).toBe(false);
    expect(health.lockedByCycleId).toBeNull();

    const trace = fixture.site.coordinator.getLastCycleTrace();
    expect(trace).not.toBeNull();
    expect(trace!.status).toBe("complete");
    expect(trace!.stepsCompleted).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("rejects a request missing scope_id", async () => {
    const fixture = createCycleFixture("test-site");
    const response = await fixture.invoke({ correlation_id: "corr-123" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("scope_id");
  });

  it("rejects a concurrent cycle when lock is held", async () => {
    const fixture = createCycleFixture("test-site");
    fixture.site.coordinator.acquireLock("other-cycle", 60_000);

    const response = await fixture.invoke({ scope_id: "test-site" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe("rejected");
    expect(body.detail).toContain("other-cycle");
  });

  it("survives DO reconstruction and still reports released lock", async () => {
    const fixture = createCycleFixture("test-site");
    await fixture.invoke({ scope_id: "test-site" });

    // Simulate hibernation: reconstruct coordinator with same DB
    const { NaradaSiteCoordinator } = await import("../../src/coordinator.js");
    const { createMockState } = await import("../fixtures/mock-sqlite.js");
    const coordinator2 = new NaradaSiteCoordinator(createMockState(fixture.site.db));

    const health = coordinator2.getHealth();
    expect(health.status).toBe("healthy");
    expect(health.locked).toBe(false);
  });
});
