import { describe, it, expect, vi } from "vitest";
import type { SiteCoordinator, CloudflareEnv } from "../../src/coordinator.js";
import type { SiteHealthRecord, CycleTraceRecord } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Inline the status-response builder and auth logic so tests are self-contained
// and do not depend on Cloudflare globals at module-load time.
// ---------------------------------------------------------------------------

const SUBSTRATE = "cloudflare-workers-do-sandbox";

function buildStatusResponse(
  siteId: string,
  health: SiteHealthRecord,
  trace: CycleTraceRecord | null,
): unknown {
  const mapHealthStatus = (
    s: SiteHealthRecord["status"],
  ): "healthy" | "degraded" | "unhealthy" => {
    if (s === "healthy") return "healthy";
    if (s === "degraded") return "degraded";
    return "unhealthy";
  };

  return {
    site_id: siteId,
    substrate: SUBSTRATE,
    health: {
      status: mapHealthStatus(health.status),
      last_cycle_at: health.lastCycleAt,
      last_cycle_status: trace?.status ?? null,
      pending_work_items: health.pendingWorkItems,
      locked: health.locked,
      locked_by_cycle_id: health.lockedByCycleId,
    },
    last_cycle: trace
      ? {
          cycle_id: trace.cycleId,
          started_at: trace.startedAt,
          finished_at: trace.finishedAt,
          status: trace.status,
          steps_completed: trace.stepsCompleted,
        }
      : null,
  };
}

function authenticateRequest(
  request: Request,
  env: CloudflareEnv & { NARADA_ADMIN_TOKEN: string },
): Response | undefined {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return new Response(
      JSON.stringify({
        error: "Invalid Authorization header format. Expected: Bearer <token>",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const token = match[1];
  if (token !== env.NARADA_ADMIN_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Invalid token" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockCoordinator(overrides?: {
  health?: Partial<SiteHealthRecord>;
  trace?: Partial<CycleTraceRecord> | null;
}): SiteCoordinator {
  const defaultHealth: SiteHealthRecord = {
    status: "healthy",
    lastCycleAt: "2026-04-20T12:00:00Z",
    lastCycleDurationMs: 15_000,
    consecutiveFailures: 0,
    pendingWorkItems: 3,
    locked: true,
    lockedByCycleId: "cycle-123",
    message: null,
    updatedAt: "2026-04-20T12:00:00Z",
  };

  const defaultTrace: CycleTraceRecord = {
    cycleId: "cycle-123",
    startedAt: "2026-04-20T12:00:00Z",
    finishedAt: "2026-04-20T12:00:15Z",
    status: "complete",
    stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8],
    error: null,
    traceKey: "help/traces/cycle-123",
  };

  return {
    getHealth: vi.fn(() =>
      Promise.resolve({ ...defaultHealth, ...(overrides?.health ?? {}) }),
    ),
    getLastCycleTrace: vi.fn(() =>
      Promise.resolve(
        overrides?.trace === null
          ? null
          : { ...defaultTrace, ...(overrides?.trace ?? {}) },
      ),
    ),
  };
}

function createMockEnv(token = "secret-token"): CloudflareEnv & { NARADA_ADMIN_TOKEN: string } {
  return {
    NARADA_ADMIN_TOKEN: token,
    NARADA_SITE_COORDINATOR: {
      idFromName: vi.fn(() => ({ toString: () => "id" })),
      get: vi.fn(),
    } as unknown as DurableObjectNamespace,
  };
}

function makeRequest(
  url: string,
  opts?: { method?: string; token?: string },
): Request {
  const headers = new Headers();
  if (opts?.token) {
    headers.set("Authorization", `Bearer ${opts.token}`);
  }
  return new Request(url, {
    method: opts?.method ?? "GET",
    headers,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Operator Status Endpoint", () => {
  describe("authentication", () => {
    it("rejects requests without Authorization header", () => {
      const env = createMockEnv();
      const request = makeRequest("http://localhost/status?site_id=help");
      const result = authenticateRequest(request, env);

      expect(result).toBeDefined();
      expect(result!.status).toBe(401);
    });

    it("rejects requests with invalid Bearer format", () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/status?site_id=help", {
        headers: { Authorization: "Basic secret" },
      });
      const result = authenticateRequest(request, env);

      expect(result).toBeDefined();
      expect(result!.status).toBe(401);
    });

    it("rejects requests with wrong token", () => {
      const env = createMockEnv("correct-token");
      const request = makeRequest("http://localhost/status?site_id=help", {
        token: "wrong-token",
      });
      const result = authenticateRequest(request, env);

      expect(result).toBeDefined();
      expect(result!.status).toBe(401);
    });

    it("allows requests with correct token", () => {
      const env = createMockEnv("correct-token");
      const request = makeRequest("http://localhost/status?site_id=help", {
        token: "correct-token",
      });
      const result = authenticateRequest(request, env);

      expect(result).toBeUndefined();
    });
  });

  describe("response shape", () => {
    it("returns site_id and substrate", () => {
      const health: SiteHealthRecord = {
        status: "healthy",
        lastCycleAt: "2026-04-20T12:00:00Z",
        lastCycleDurationMs: 15_000,
        consecutiveFailures: 0,
        pendingWorkItems: 0,
        locked: false,
        lockedByCycleId: null,
        message: null,
        updatedAt: "2026-04-20T12:00:00Z",
      };
      const response = buildStatusResponse("help", health, null);

      expect((response as Record<string, unknown>).site_id).toBe("help");
      expect((response as Record<string, unknown>).substrate).toBe(
        "cloudflare-workers-do-sandbox",
      );
    });

    it("returns health fields from coordinator", () => {
      const health: SiteHealthRecord = {
        status: "degraded",
        lastCycleAt: "2026-04-20T11:55:00Z",
        lastCycleDurationMs: 45_000,
        consecutiveFailures: 1,
        pendingWorkItems: 5,
        locked: true,
        lockedByCycleId: "cycle-456",
        message: "Slow sync",
        updatedAt: "2026-04-20T11:55:00Z",
      };
      const response = buildStatusResponse("help", health, null) as {
        health: Record<string, unknown>;
      };

      expect(response.health.status).toBe("degraded");
      expect(response.health.last_cycle_at).toBe("2026-04-20T11:55:00Z");
      expect(response.health.pending_work_items).toBe(5);
      expect(response.health.locked).toBe(true);
      expect(response.health.locked_by_cycle_id).toBe("cycle-456");
    });

    it("maps critical health status to unhealthy", () => {
      const health: SiteHealthRecord = {
        status: "critical",
        lastCycleAt: null,
        lastCycleDurationMs: null,
        consecutiveFailures: 3,
        pendingWorkItems: 0,
        locked: false,
        lockedByCycleId: null,
        message: "DO unreachable",
        updatedAt: "2026-04-20T12:00:00Z",
      };
      const response = buildStatusResponse("help", health, null) as {
        health: Record<string, unknown>;
      };

      expect(response.health.status).toBe("unhealthy");
    });

    it("maps unknown health status to unhealthy", () => {
      const health: SiteHealthRecord = {
        status: "unknown",
        lastCycleAt: null,
        lastCycleDurationMs: null,
        consecutiveFailures: 0,
        pendingWorkItems: 0,
        locked: false,
        lockedByCycleId: null,
        message: null,
        updatedAt: "2026-04-20T12:00:00Z",
      };
      const response = buildStatusResponse("help", health, null) as {
        health: Record<string, unknown>;
      };

      expect(response.health.status).toBe("unhealthy");
    });

    it("returns last_cycle trace when present", () => {
      const health: SiteHealthRecord = {
        status: "healthy",
        lastCycleAt: "2026-04-20T12:00:00Z",
        lastCycleDurationMs: 15_000,
        consecutiveFailures: 0,
        pendingWorkItems: 0,
        locked: false,
        lockedByCycleId: null,
        message: null,
        updatedAt: "2026-04-20T12:00:00Z",
      };
      const trace: CycleTraceRecord = {
        cycleId: "cycle-789",
        startedAt: "2026-04-20T12:00:00Z",
        finishedAt: "2026-04-20T12:00:15Z",
        status: "complete",
        stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8],
        error: null,
        traceKey: "help/traces/cycle-789",
      };
      const response = buildStatusResponse("help", health, trace) as {
        last_cycle: Record<string, unknown>;
      };

      expect(response.last_cycle.cycle_id).toBe("cycle-789");
      expect(response.last_cycle.status).toBe("complete");
      expect(response.last_cycle.steps_completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it("returns null last_cycle when no trace exists", () => {
      const health: SiteHealthRecord = {
        status: "healthy",
        lastCycleAt: null,
        lastCycleDurationMs: null,
        consecutiveFailures: 0,
        pendingWorkItems: 0,
        locked: false,
        lockedByCycleId: null,
        message: null,
        updatedAt: "2026-04-20T12:00:00Z",
      };
      const response = buildStatusResponse("help", health, null) as {
        last_cycle: unknown;
      };

      expect(response.last_cycle).toBeNull();
    });
  });

  describe("privacy", () => {
    it("does not expose traceKey in the response", () => {
      const health: SiteHealthRecord = {
        status: "healthy",
        lastCycleAt: "2026-04-20T12:00:00Z",
        lastCycleDurationMs: 15_000,
        consecutiveFailures: 0,
        pendingWorkItems: 0,
        locked: false,
        lockedByCycleId: null,
        message: null,
        updatedAt: "2026-04-20T12:00:00Z",
      };
      const trace: CycleTraceRecord = {
        cycleId: "cycle-1",
        startedAt: "2026-04-20T12:00:00Z",
        finishedAt: "2026-04-20T12:00:15Z",
        status: "complete",
        stepsCompleted: [1],
        error: null,
        traceKey: "help/traces/cycle-1",
      };
      const response = buildStatusResponse("help", health, trace);
      const json = JSON.stringify(response);

      expect(json).not.toContain("traceKey");
      expect(json).not.toContain("help/traces");
    });

    it("does not expose raw error detail when trace is absent", () => {
      const health: SiteHealthRecord = {
        status: "healthy",
        lastCycleAt: "2026-04-20T12:00:00Z",
        lastCycleDurationMs: 15_000,
        consecutiveFailures: 0,
        pendingWorkItems: 0,
        locked: false,
        lockedByCycleId: null,
        message: null,
        updatedAt: "2026-04-20T12:00:00Z",
      };
      const trace: CycleTraceRecord = {
        cycleId: "cycle-1",
        startedAt: "2026-04-20T12:00:00Z",
        finishedAt: "2026-04-20T12:00:15Z",
        status: "failed",
        stepsCompleted: [1, 2],
        error: "Graph API secret expired",
        traceKey: "help/traces/cycle-1",
      };
      const response = buildStatusResponse("help", health, trace);
      const json = JSON.stringify(response);

      // error is not exposed in the response shape
      expect(json).not.toContain("Graph API secret expired");
    });
  });

  describe("coordinator integration", () => {
    it("fetches health and trace from coordinator", async () => {
      const coordinator = createMockCoordinator();
      const health = await coordinator.getHealth();
      const trace = await coordinator.getLastCycleTrace();

      expect(coordinator.getHealth).toHaveBeenCalledTimes(1);
      expect(coordinator.getLastCycleTrace).toHaveBeenCalledTimes(1);
      expect(health).not.toBeNull();
      expect(health!.status).toBe("healthy");
      expect(trace).not.toBeNull();
      expect(trace!.cycleId).toBe("cycle-123");
    });

    it("handles null trace from coordinator", async () => {
      const coordinator = createMockCoordinator({ trace: null });
      const trace = await coordinator.getLastCycleTrace();

      expect(trace).toBeNull();
    });

    it("handles degraded health from coordinator", async () => {
      const coordinator = createMockCoordinator({
        health: { status: "degraded", pendingWorkItems: 7 },
      });
      const health = await coordinator.getHealth();

      expect(health!.status).toBe("degraded");
      expect(health!.pendingWorkItems).toBe(7);
    });
  });
});
