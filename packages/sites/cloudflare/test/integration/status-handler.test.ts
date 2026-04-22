import { describe, it, expect } from "vitest";
import { createSiteFixture } from "../fixtures/site.js";
import { createTraceFixture } from "../fixtures/trace.js";
import handler from "../../src/index.js";
import type { CloudflareEnv } from "../../src/coordinator.js";

function createMockEnv(coordinator: unknown, token: string): CloudflareEnv {
  return {
    NARADA_SITE_COORDINATOR: {
      idFromName: () => ({ toString: () => "mock-id" }),
      get: () => coordinator as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace,
    NARADA_ADMIN_TOKEN: token,
  };
}

describe("Status handler integration", () => {
  it("returns 401 without authorization", async () => {
    const site = createSiteFixture("help");
    const request = new Request("http://localhost/status?site_id=help");
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const site = createSiteFixture("help");
    const request = new Request("http://localhost/status?site_id=help", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(401);
  });

  it("returns 400 when site_id is missing", async () => {
    const site = createSiteFixture("help");
    const request = new Request("http://localhost/status", {
      headers: { Authorization: "Bearer secret" },
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(400);
  });

  it("returns full status with valid auth and seeded trace", async () => {
    const site = createSiteFixture("help");
    const traceFixture = createTraceFixture();
    site.coordinator.setHealth(traceFixture.health);
    site.coordinator.setLastCycleTrace(traceFixture.trace!);

    const request = new Request("http://localhost/status?site_id=help", {
      headers: { Authorization: "Bearer secret" },
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);

    expect(response.status).toBe(200);
    const body = await response.json();

    // Integration semantics: the handler resolved the coordinator, read health
    // and trace, and built the canonical response shape.
    expect(body.site_id).toBe("help");
    expect(body.substrate).toBe("cloudflare-workers-do-sandbox");
    expect(body.health.status).toBe("healthy");
    expect(body.health.pending_work_items).toBe(0);
    expect(body.health.locked).toBe(false);
    expect(body.health.locked_by_cycle_id).toBeNull();
    expect(body.last_cycle.cycle_id).toBe("cycle-001");
    expect(body.last_cycle.steps_completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("maps critical health to unhealthy in response", async () => {
    const site = createSiteFixture("help");
    site.coordinator.setHealth(createTraceFixture({ health: { status: "critical" } }).health);

    const request = new Request("http://localhost/status?site_id=help", {
      headers: { Authorization: "Bearer secret" },
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    const body = await response.json();
    expect(body.health.status).toBe("unhealthy");
  });
});
