import { describe, it, expect } from "vitest";
import { createSiteFixture } from "../fixtures/site.js";
import handler from "../../src/index.js";

describe("Cron scheduled handler (Task 369)", () => {
  it("invokes runCycle on scheduled event and updates health + trace", async () => {
    const site = createSiteFixture("cron-test-site");
    const env = {
      NARADA_SITE_COORDINATOR: {
        idFromName: () => ({ toString: () => "mock-id" }),
        get: () => site.coordinator as unknown as DurableObjectStub,
      } as unknown as DurableObjectNamespace,
      NARADA_ADMIN_TOKEN: "test-token",
    };

    const scheduledEvent = {
      cron: "cron-test-site",
      scheduledTime: Date.now(),
      type: "scheduled",
    } as unknown as ScheduledEvent;

    await handler.scheduled(scheduledEvent, env, {} as ExecutionContext);

    const health = site.coordinator.getHealth();
    expect(health.status).toBe("healthy");
    expect(health.locked).toBe(false);

    const trace = site.coordinator.getLastCycleTrace();
    expect(trace).not.toBeNull();
    expect(trace!.status).toBe("complete");
  });

  it("survives a scheduled event when the site is already locked", async () => {
    const site = createSiteFixture("cron-locked-site");
    site.coordinator.acquireLock("other-cycle", 60_000);

    const env = {
      NARADA_SITE_COORDINATOR: {
        idFromName: () => ({ toString: () => "mock-id" }),
        get: () => site.coordinator as unknown as DurableObjectStub,
      } as unknown as DurableObjectNamespace,
      NARADA_ADMIN_TOKEN: "test-token",
    };

    const scheduledEvent = {
      cron: "cron-locked-site",
      scheduledTime: Date.now(),
      type: "scheduled",
    } as unknown as ScheduledEvent;

    // Should not throw
    await handler.scheduled(scheduledEvent, env, {} as ExecutionContext);

    // Health should reflect the lock contention failure
    const health = site.coordinator.getHealth();
    expect(health.status).toBe("degraded"); // first failure from unknown → degraded
    expect(health.locked).toBe(false); // lock contention updates health to released
    expect(health.lockedByCycleId).toBeNull();
  });
});
