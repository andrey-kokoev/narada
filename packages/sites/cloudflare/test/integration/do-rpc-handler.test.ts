import { describe, it, expect } from "vitest";
import { createSiteFixture } from "../fixtures/site.js";

describe("DO RPC via fetch() (Task 369)", () => {
  it("GET /status returns health and trace via DO fetch()", async () => {
    const site = createSiteFixture("rpc-test-site");

    // Seed some state so health is not default-empty
    site.coordinator.setHealth({
      status: "healthy",
      lastCycleAt: "2026-01-01T00:00:00Z",
      lastCycleDurationMs: 15_000,
      consecutiveFailures: 0,
      pendingWorkItems: 0,
      locked: false,
      lockedByCycleId: null,
      message: "OK",
      updatedAt: "2026-01-01T00:00:00Z",
    });

    const request = new Request("http://localhost/status", { method: "GET" });
    const response = await site.coordinator.fetch(request);

    expect(response.status).toBe(200);
    const body = await response.json() as { health: unknown; trace: unknown };
    expect(body.health).toBeDefined();
    expect(body.trace).toBeDefined();
  });

  it("POST /control/actions executes operator action via DO fetch()", async () => {
    const site = createSiteFixture("rpc-test-site");

    // Seed a draft_ready outbound
    site.seedOutboundCommand("ob-rpc-001", "ctx-1", "rpc-test-site", "send_reply", "draft_ready");

    const request = new Request("http://localhost/control/actions?scope_id=rpc-test-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_type: "approve", target_id: "ob-rpc-001" }),
    });

    const response = await site.coordinator.fetch(request);

    expect(response.status).toBe(200);
    const body = await response.json() as { success: boolean; status: string };
    expect(body.success).toBe(true);
    expect(body.status).toBe("executed");

    const outbound = site.coordinator.getOutboundCommand("ob-rpc-001");
    expect(outbound!.status).toBe("approved_for_send");
  });

  it("POST /cycle runs a bounded cycle via DO fetch()", async () => {
    const site = createSiteFixture("rpc-test-site");

    const request = new Request("http://localhost/cycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope_id: "rpc-test-site" }),
    });

    const response = await site.coordinator.fetch(request);

    expect(response.status).toBe(200);
    const body = await response.json() as { cycle_id: string; status: string; steps_completed: number[] };
    expect(body.cycle_id).toBeDefined();
    expect(body.status).toBe("complete");
    expect(body.steps_completed).toContain(1); // lock acquired

    // Health and trace should be updated
    const health = site.coordinator.getHealth();
    expect(health.status).toBe("healthy");
    expect(health.locked).toBe(false);

    const trace = site.coordinator.getLastCycleTrace();
    expect(trace).not.toBeNull();
    expect(trace!.status).toBe("complete");
  });

  it("Worker→DO RPC path routes through env stub fetch()", async () => {
    const site = createSiteFixture("rpc-test-site");

    // Seed health so status has something to return
    site.coordinator.setHealth({
      status: "healthy",
      lastCycleAt: "2026-01-01T00:00:00Z",
      lastCycleDurationMs: 15_000,
      consecutiveFailures: 0,
      pendingWorkItems: 0,
      locked: false,
      lockedByCycleId: null,
      message: "OK",
      updatedAt: "2026-01-01T00:00:00Z",
    });

    // Build a mock env where get() returns a stub whose fetch() delegates
    // to the real coordinator. This is the production-shaped boundary.
    const env = {
      NARADA_SITE_COORDINATOR: {
        idFromName: () => ({ toString: () => "mock-id" }),
        get: () => site.coordinator as unknown as DurableObjectStub,
      } as unknown as DurableObjectNamespace,
      NARADA_ADMIN_TOKEN: "test-token",
    };

    const id = env.NARADA_SITE_COORDINATOR.idFromName("rpc-test-site");
    const stub = env.NARADA_SITE_COORDINATOR.get(id);

    // This is the Worker→DO RPC call: the Worker calls stub.fetch(request)
    const request = new Request("http://localhost/status", { method: "GET" });
    const response = await stub.fetch(request);

    expect(response.status).toBe(200);
    const body = await response.json() as { health: unknown; trace: unknown };
    expect(body.health).toBeDefined();
    expect(body.trace).toBeDefined();
  });

  it("DO fetch() returns 404 for unknown routes", async () => {
    const site = createSiteFixture("rpc-test-site");
    const request = new Request("http://localhost/unknown", { method: "GET" });
    const response = await site.coordinator.fetch(request);
    expect(response.status).toBe(404);
  });

  it("DO fetch() returns 405 for wrong method on /status", async () => {
    const site = createSiteFixture("rpc-test-site");
    const request = new Request("http://localhost/status", { method: "POST" });
    const response = await site.coordinator.fetch(request);
    expect(response.status).toBe(405);
  });
});
