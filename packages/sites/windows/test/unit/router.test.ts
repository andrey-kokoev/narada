import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { SiteRegistry, RegisteredSite } from "../../src/registry.js";
import {
  ControlRequestRouter,
  ConsoleControlRequest,
  SiteControlClient,
  ControlRequestResult,
} from "../../src/router.js";

/** Mock control client that returns a configured result. */
function createMockClient(result: ControlRequestResult): SiteControlClient {
  return {
    async executeControlRequest(
      _request: ConsoleControlRequest,
    ): Promise<ControlRequestResult> {
      return result;
    },
  };
}

/** Mock control client that always throws. */
function createThrowingClient(error: Error): SiteControlClient {
  return {
    async executeControlRequest(
      _request: ConsoleControlRequest,
    ): Promise<ControlRequestResult> {
      throw error;
    },
  };
}

describe("ControlRequestRouter", () => {
  let tempDir: string;
  let db: Database.Database;
  let registry: SiteRegistry;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-router-test-"));
    db = new Database(join(tempDir, "registry.db"));
    registry = new SiteRegistry(db);
  });

  afterEach(() => {
    registry.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function registerTestSite(siteId: string): RegisteredSite {
    const site: RegisteredSite = {
      siteId,
      variant: "native",
      siteRoot: join(tempDir, siteId),
      substrate: "windows",
      aimJson: null,
      controlEndpoint: null,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    registry.registerSite(site);
    return site;
  }

  function makeRequest(overrides?: Partial<ConsoleControlRequest>): ConsoleControlRequest {
    return {
      requestId: `req-${Date.now()}`,
      siteId: "test-site",
      actionType: "approve",
      targetId: "out-1",
      targetKind: "outbound_command",
      requestedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  // -----------------------------------------------------------------------
  // Routing
  // -----------------------------------------------------------------------

  describe("route", () => {
    it("forwards request to mock Site control client and returns accepted", async () => {
      registerTestSite("test-site");
      const expectedResult: ControlRequestResult = {
        success: true,
        status: "accepted",
      };
      const clients = new Map<string, SiteControlClient>();
      clients.set("test-site", createMockClient(expectedResult));

      const router = new ControlRequestRouter({
        registry,
        clientFactory: (siteId) => clients.get(siteId),
      });

      const request = makeRequest();
      const result = await router.route(request);

      expect(result.success).toBe(true);
      expect(result.status).toBe("accepted");
    });

    it("forwards request and returns rejected when Site rejects", async () => {
      registerTestSite("test-site");
      const expectedResult: ControlRequestResult = {
        success: false,
        status: "rejected",
        detail: "Action not permitted",
      };
      const clients = new Map<string, SiteControlClient>();
      clients.set("test-site", createMockClient(expectedResult));

      const router = new ControlRequestRouter({
        registry,
        clientFactory: (siteId) => clients.get(siteId),
      });

      const request = makeRequest({ actionType: "reject" });
      const result = await router.route(request);

      expect(result.success).toBe(false);
      expect(result.status).toBe("rejected");
      expect(result.detail).toBe("Action not permitted");
    });

    it("returns error for unknown Sites without calling any client", async () => {
      const clients = new Map<string, SiteControlClient>();
      let clientCalled = false;
      clients.set("test-site", {
        async executeControlRequest(): Promise<ControlRequestResult> {
          clientCalled = true;
          return { success: true, status: "accepted" };
        },
      });

      const router = new ControlRequestRouter({
        registry,
        clientFactory: (siteId) => clients.get(siteId),
      });

      const request = makeRequest();
      const result = await router.route(request);

      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
      expect(result.detail).toBe("Site not found: test-site");
      expect(clientCalled).toBe(false);
    });

    it("returns error when no control client is available for a known Site", async () => {
      registerTestSite("test-site");

      const router = new ControlRequestRouter({
        registry,
        clientFactory: () => undefined,
      });

      const request = makeRequest();
      const result = await router.route(request);

      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
      expect(result.detail).toBe("No control client available for site: test-site");
    });

    it("does not retry when client throws", async () => {
      registerTestSite("test-site");
      let callCount = 0;
      const clients = new Map<string, SiteControlClient>();
      clients.set("test-site", {
        async executeControlRequest(): Promise<ControlRequestResult> {
          callCount++;
          throw new Error("Network timeout");
        },
      });

      const router = new ControlRequestRouter({
        registry,
        clientFactory: (siteId) => clients.get(siteId),
      });

      const request = makeRequest();
      const result = await router.route(request);

      expect(callCount).toBe(1);
      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
      expect(result.detail).toBe("Network timeout");
    });

    it("returns error status (not throw) for client exceptions", async () => {
      registerTestSite("test-site");
      const clients = new Map<string, SiteControlClient>();
      clients.set("test-site", createThrowingClient(new Error("Site unreachable")));

      const router = new ControlRequestRouter({
        registry,
        clientFactory: (siteId) => clients.get(siteId),
      });

      const request = makeRequest();
      const result = await router.route(request);

      expect(result.status).toBe("error");
      expect(result.detail).toBe("Site unreachable");
    });
  });

  // -----------------------------------------------------------------------
  // Audit logging
  // -----------------------------------------------------------------------

  describe("audit", () => {
    it("logs accepted requests to registry audit log", async () => {
      registerTestSite("test-site");
      const clients = new Map<string, SiteControlClient>();
      clients.set("test-site", createMockClient({ success: true, status: "accepted" }));

      const router = new ControlRequestRouter({
        registry,
        clientFactory: (siteId) => clients.get(siteId),
      });

      const request = makeRequest({ requestId: "audit-1" });
      await router.route(request);

      const logs = registry.getAuditRecordsForSite("test-site");
      expect(logs.length).toBe(1);
      expect(logs[0].requestId).toBe("audit-1");
      expect(logs[0].siteResponseStatus).toBe("accepted");
      expect(logs[0].actionType).toBe("approve");
      expect(logs[0].targetId).toBe("out-1");
    });

    it("logs rejected requests to registry audit log", async () => {
      registerTestSite("test-site");
      const clients = new Map<string, SiteControlClient>();
      clients.set(
        "test-site",
        createMockClient({ success: false, status: "rejected", detail: "Not allowed" }),
      );

      const router = new ControlRequestRouter({
        registry,
        clientFactory: (siteId) => clients.get(siteId),
      });

      const request = makeRequest({ requestId: "audit-2", actionType: "cancel" });
      await router.route(request);

      const logs = registry.getAuditRecordsForSite("test-site");
      expect(logs.length).toBe(1);
      expect(logs[0].requestId).toBe("audit-2");
      expect(logs[0].siteResponseStatus).toBe("rejected");
      expect(logs[0].siteResponseDetail).toBe("Not allowed");
    });

    it("logs error for unknown Sites", async () => {
      const router = new ControlRequestRouter({
        registry,
        clientFactory: () => undefined,
      });

      const request = makeRequest({ requestId: "audit-3" });
      await router.route(request);

      const logs = registry.getAuditRecordsForSite("test-site");
      expect(logs.length).toBe(1);
      expect(logs[0].requestId).toBe("audit-3");
      expect(logs[0].siteResponseStatus).toBe("error");
      expect(logs[0].siteResponseDetail).toContain("Site not found");
    });

    it("logs error for client exceptions", async () => {
      registerTestSite("test-site");
      const clients = new Map<string, SiteControlClient>();
      clients.set("test-site", createThrowingClient(new Error("Boom")));

      const router = new ControlRequestRouter({
        registry,
        clientFactory: (siteId) => clients.get(siteId),
      });

      const request = makeRequest({ requestId: "audit-4" });
      await router.route(request);

      const logs = registry.getAuditRecordsForSite("test-site");
      expect(logs.length).toBe(1);
      expect(logs[0].requestId).toBe("audit-4");
      expect(logs[0].siteResponseStatus).toBe("error");
      expect(logs[0].siteResponseDetail).toBe("Boom");
    });

    it("records multiple requests in order", async () => {
      registerTestSite("test-site");
      const clients = new Map<string, SiteControlClient>();
      clients.set("test-site", createMockClient({ success: true, status: "accepted" }));

      const router = new ControlRequestRouter({
        registry,
        clientFactory: (siteId) => clients.get(siteId),
      });

      await router.route(makeRequest({ requestId: "a", actionType: "approve" }));
      await router.route(makeRequest({ requestId: "b", actionType: "reject" }));
      await router.route(makeRequest({ requestId: "c", actionType: "retry" }));

      const logs = registry.getAuditRecordsForSite("test-site", 10);
      expect(logs.length).toBe(3);
      // Newest first
      expect(logs[2].requestId).toBe("a");
      expect(logs[1].requestId).toBe("b");
      expect(logs[0].requestId).toBe("c");
    });
  });
});
