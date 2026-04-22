/**
 * Handler integration tests.
 *
 * These tests exercise the actual fetch handler exported from `src/index.ts`
 * through real `Request` objects, proving the integration boundary between
 * HTTP routing and internal logic.
 *
 * This backfills the gap identified in Task 334: `operator-status.test.ts`
 * previously inlined handler logic rather than calling the real handler.
 */

import { describe, it, expect } from "vitest";
import handler from "../../src/index.js";
import {
  createMockSiteCoordinator,
  createMockCycleCoordinator,
  createMockEnvForHandler,
  createMockEnvForCycle,
  createCompleteTrace,
  createFailedTrace,
} from "../fixtures/index.js";

function makeRequest(
  pathname: string,
  opts?: { method?: string; body?: unknown; token?: string; search?: string },
): Request {
  const url = `http://localhost${pathname}${opts?.search ?? ""}`;
  const headers = new Headers();
  if (opts?.token) {
    headers.set("Authorization", `Bearer ${opts.token}`);
  }
  if (opts?.body) {
    headers.set("Content-Type", "application/json");
  }
  return new Request(url, {
    method: opts?.method ?? "GET",
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
}

const dummyCtx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as ExecutionContext;

describe("Handler integration", () => {
  describe("GET /status", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const coordinator = createMockSiteCoordinator();
      const env = createMockEnvForHandler(coordinator, "secret-token");
      const request = makeRequest("/status?site_id=help");

      const response = await handler.fetch(request, env, dummyCtx);

      expect(response.status).toBe(401);
      const body = await response.json() as { error: string };
      expect(body.error).toContain("Missing Authorization header");
    });

    it("returns 401 when token is invalid", async () => {
      const coordinator = createMockSiteCoordinator();
      const env = createMockEnvForHandler(coordinator, "correct-token");
      const request = makeRequest("/status?site_id=help", { token: "wrong-token" });

      const response = await handler.fetch(request, env, dummyCtx);

      expect(response.status).toBe(401);
      const body = await response.json() as { error: string };
      expect(body.error).toContain("Invalid token");
    });

    it("returns 400 when site_id is missing", async () => {
      const coordinator = createMockSiteCoordinator();
      const env = createMockEnvForHandler(coordinator, "secret-token");
      const request = makeRequest("/status", { token: "secret-token" });

      const response = await handler.fetch(request, env, dummyCtx);

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toContain("site_id");
    });

    it("returns status response when authenticated and site exists", async () => {
      const { health, trace } = createCompleteTrace("cycle-789", "help");
      const coordinator = createMockSiteCoordinator({ health: { ...health, locked: true, lockedByCycleId: "cycle-789" }, trace });
      const env = createMockEnvForHandler(coordinator, "secret-token");
      const request = makeRequest("/status?site_id=help", { token: "secret-token" });

      const response = await handler.fetch(request, env, dummyCtx);

      expect(response.status).toBe(200);
      const body = await response.json() as {
        site_id: string;
        substrate: string;
        health: Record<string, unknown>;
        last_cycle: Record<string, unknown>;
      };
      expect(body.site_id).toBe("help");
      expect(body.substrate).toBe("cloudflare-workers-do-sandbox");
      expect(body.health.status).toBe("healthy");
      expect(body.health.pending_work_items).toBe(2);
      expect(body.health.locked).toBe(true);
      expect(body.health.locked_by_cycle_id).toBe("cycle-789");
      expect(body.last_cycle.cycle_id).toBe("cycle-789");
      expect(body.last_cycle.status).toBe("complete");
      expect(body.last_cycle.steps_completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it("does not expose traceKey or internal paths in the response", async () => {
      const { health, trace } = createCompleteTrace("cycle-1", "help");
      const coordinator = createMockSiteCoordinator({ health, trace });
      const env = createMockEnvForHandler(coordinator, "secret-token");
      const request = makeRequest("/status?site_id=help", { token: "secret-token" });

      const response = await handler.fetch(request, env, dummyCtx);
      const body = await response.text();

      expect(body).not.toContain("traceKey");
      expect(body).not.toContain("help/traces");
    });

    it("maps critical health to unhealthy", async () => {
      const { health } = createFailedTrace("cycle-fail", "help");
      const coordinator = createMockSiteCoordinator({ health, trace: null });
      const env = createMockEnvForHandler(coordinator, "secret-token");
      const request = makeRequest("/status?site_id=help", { token: "secret-token" });

      const response = await handler.fetch(request, env, dummyCtx);
      const body = await response.json() as { health: { status: string } };

      expect(body.health.status).toBe("unhealthy");
    });
  });

  describe("POST /cycle", () => {
    it("returns 202 when cycle is accepted", async () => {
      const coordinator = createMockCycleCoordinator();
      const env = createMockEnvForCycle(coordinator, "secret-token");
      const request = makeRequest("/cycle", {
        method: "POST",
        body: { scope_id: "help@global-maxima.com", correlation_id: "corr-1" },
      });

      const response = await handler.fetch(request, env, dummyCtx);

      expect(response.status).toBe(202);
      const body = await response.json() as { status: string; correlation_id: string };
      expect(body.status).toBe("accepted");
      expect(body.correlation_id).toBe("corr-1");
    });

    it("returns 400 when scope_id is missing", async () => {
      const coordinator = createMockCycleCoordinator();
      const env = createMockEnvForCycle(coordinator, "secret-token");
      const request = makeRequest("/cycle", {
        method: "POST",
        body: { correlation_id: "corr-1" },
      });

      const response = await handler.fetch(request, env, dummyCtx);

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toContain("scope_id");
    });

    it("returns 400 for invalid JSON", async () => {
      const coordinator = createMockCycleCoordinator();
      const env = createMockEnvForCycle(coordinator, "secret-token");
      const request = new Request("http://localhost/cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });

      const response = await handler.fetch(request, env, dummyCtx);

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toContain("Invalid JSON");
    });

    it("returns 405 for GET /cycle", async () => {
      const coordinator = createMockCycleCoordinator();
      const env = createMockEnvForCycle(coordinator, "secret-token");
      const request = makeRequest("/cycle", { method: "GET" });

      const response = await handler.fetch(request, env, dummyCtx);

      expect(response.status).toBe(405);
    });
  });

  describe("catch-all routing", () => {
    it("returns 404 for unknown paths", async () => {
      const coordinator = createMockSiteCoordinator();
      const env = createMockEnvForHandler(coordinator, "secret-token");
      const request = makeRequest("/unknown");

      const response = await handler.fetch(request, env, dummyCtx);

      expect(response.status).toBe(404);
    });
  });
});
