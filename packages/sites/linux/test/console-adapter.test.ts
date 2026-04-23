import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { RegisteredSite } from "@narada2/windows-site";
import {
  linuxSiteAdapter,
  LinuxSiteObservationApi,
  LinuxSiteControlClient,
} from "../src/console-adapter.js";
import { SqliteSiteCoordinator } from "../src/coordinator.js";

function makeSite(overrides: Partial<RegisteredSite> = {}): RegisteredSite {
  return {
    siteId: "test-linux-site",
    variant: "linux-user",
    siteRoot: "/tmp/test-linux-site",
    substrate: "linux",
    aimJson: null,
    controlEndpoint: null,
    lastSeenAt: null,
    createdAt: "2026-04-20T10:00:00Z",
    ...overrides,
  };
}

describe("linuxSiteAdapter", () => {
  describe("supports", () => {
    it("returns true for linux-user variant", () => {
      expect(linuxSiteAdapter.supports(makeSite({ variant: "linux-user" }))).toBe(true);
    });

    it("returns true for linux-system variant", () => {
      expect(linuxSiteAdapter.supports(makeSite({ variant: "linux-system" }))).toBe(true);
    });

    it("returns true for linux substrate regardless of variant", () => {
      expect(linuxSiteAdapter.supports(makeSite({ variant: "native", substrate: "linux" }))).toBe(true);
    });

    it("returns false for windows substrate", () => {
      expect(linuxSiteAdapter.supports(makeSite({ variant: "native", substrate: "windows" }))).toBe(false);
    });

    it("returns false for cloudflare variant", () => {
      expect(linuxSiteAdapter.supports(makeSite({ variant: "cloudflare", substrate: "cloudflare" }))).toBe(false);
    });
  });

  describe("createObservationApi", () => {
    it("returns a LinuxSiteObservationApi instance", () => {
      const api = linuxSiteAdapter.createObservationApi(makeSite());
      expect(api).toBeDefined();
      expect(typeof api.getHealth).toBe("function");
    });
  });

  describe("createControlClient", () => {
    it("returns a LinuxSiteControlClient instance for user mode", () => {
      const client = linuxSiteAdapter.createControlClient(makeSite({ variant: "linux-user" }));
      expect(client).toBeDefined();
      expect(typeof client.executeControlRequest).toBe("function");
    });
  });
});

describe("LinuxSiteObservationApi", () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NARADA_SITE_ROOT;
    tmpDir = mkdtempSync(join(tmpdir(), "narada-linux-adapter-"));
    process.env.NARADA_SITE_ROOT = tmpDir;
  });

  afterEach(() => {
    process.env.NARADA_SITE_ROOT = originalEnv;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedSite(siteId: string, status: "healthy" | "auth_failed") {
    const root = join(tmpDir, siteId);
    mkdirSync(join(root, "db"), { recursive: true });
    const db = new Database(join(root, "db", "coordinator.db"));
    const coordinator = new SqliteSiteCoordinator(db);

    coordinator.setHealth({
      site_id: siteId,
      status,
      last_cycle_at: "2026-04-22T10:00:00.000Z",
      last_cycle_duration_ms: 1200,
      consecutive_failures: status === "auth_failed" ? 3 : 0,
      message: status === "auth_failed" ? "Auth expired" : "All good",
      updated_at: "2026-04-22T10:00:00.000Z",
    });

    coordinator.close();
    db.close();
    return root;
  }

  it("getHealth returns the site's health record", async () => {
    seedSite("site-1", "healthy");
    const api = new LinuxSiteObservationApi("site-1", "user");
    const health = await api.getHealth();
    expect(health.site_id).toBe("site-1");
    expect(health.status).toBe("healthy");
    expect(health.message).toBe("All good");
  });

  it("getHealth returns error when site is not readable", async () => {
    const api = new LinuxSiteObservationApi("missing-site", "user");
    const health = await api.getHealth();
    expect(health.status).toBe("error");
    expect(health.message).toContain("Failed to read Linux Site health");
  });

  it("getStuckWorkItems returns empty array", async () => {
    seedSite("site-2", "healthy");
    const api = new LinuxSiteObservationApi("site-2", "user");
    expect(await api.getStuckWorkItems()).toEqual([]);
  });

  it("getPendingOutboundCommands returns empty array", async () => {
    seedSite("site-3", "healthy");
    const api = new LinuxSiteObservationApi("site-3", "user");
    expect(await api.getPendingOutboundCommands()).toEqual([]);
  });

  it("getPendingDrafts returns empty array", async () => {
    seedSite("site-4", "healthy");
    const api = new LinuxSiteObservationApi("site-4", "user");
    expect(await api.getPendingDrafts()).toEqual([]);
  });

  it("getCredentialRequirements returns empty array when healthy", async () => {
    seedSite("site-5", "healthy");
    const api = new LinuxSiteObservationApi("site-5", "user");
    expect(await api.getCredentialRequirements()).toEqual([]);
  });

  it("getCredentialRequirements returns auth requirement when auth_failed", async () => {
    seedSite("site-6", "auth_failed");
    const api = new LinuxSiteObservationApi("site-6", "user");
    const creds = await api.getCredentialRequirements();
    expect(creds).toHaveLength(1);
    expect(creds[0].subtype).toBe("interactive_auth_required");
    expect(creds[0].summary).toBe("Auth expired");
    expect(creds[0].remediation_command).toContain("narada auth --site site-6");
  });

  it("does not mutate site state", async () => {
    seedSite("site-7", "healthy");
    const api = new LinuxSiteObservationApi("site-7", "user");
    await api.getHealth();
    await api.getStuckWorkItems();

    // Re-read health directly to confirm it is unchanged
    const db = new Database(join(tmpDir, "site-7", "db", "coordinator.db"));
    const coordinator = new SqliteSiteCoordinator(db);
    const health = coordinator.getHealth("site-7");
    expect(health.status).toBe("healthy");
    coordinator.close();
    db.close();
  });
});

describe("LinuxSiteControlClient", () => {
  it("returns unsupported error for all control requests", async () => {
    const client = new LinuxSiteControlClient("site-1");
    const result = await client.executeControlRequest({
      requestId: "req-1",
      siteId: "site-1",
      actionType: "approve",
      targetId: "ob-1",
      targetKind: "outbound_command",
      requestedAt: "2026-04-22T10:00:00Z",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("error");
    expect(result.detail).toContain("not yet implemented in v0");
    expect(result.detail).toContain("site-1");
  });

  it("returns unsupported error for retry requests", async () => {
    const client = new LinuxSiteControlClient("site-1");
    const result = await client.executeControlRequest({
      requestId: "req-2",
      siteId: "site-1",
      actionType: "retry",
      targetId: "wi-1",
      targetKind: "work_item",
      requestedAt: "2026-04-22T10:00:00Z",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("error");
    expect(result.detail).toContain("retry");
  });
});
