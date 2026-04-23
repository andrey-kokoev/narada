import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cloudflareSiteAdapter,
  CloudflareSiteObservationApi,
  CloudflareSiteControlClient,
} from "../../src/console-adapter.js";
import type { RegisteredSite } from "@narada2/windows-site";

function makeSite(overrides: Partial<RegisteredSite> = {}): RegisteredSite {
  return {
    siteId: "cf-site",
    variant: "cloudflare",
    siteRoot: "",
    substrate: "cloudflare",
    aimJson: null,
    controlEndpoint: "https://cf-site.example.com",
    lastSeenAt: null,
    createdAt: "2026-04-20T10:00:00Z",
    ...overrides,
  };
}

describe("cloudflareSiteAdapter", () => {
  describe("supports", () => {
    it("returns true for cloudflare variant", () => {
      expect(cloudflareSiteAdapter.supports(makeSite({ variant: "cloudflare" }))).toBe(true);
    });

    it("returns true for cloudflare substrate regardless of variant", () => {
      expect(cloudflareSiteAdapter.supports(makeSite({ variant: "wsl", substrate: "cloudflare" }))).toBe(true);
    });

    it("returns false for windows substrate", () => {
      expect(cloudflareSiteAdapter.supports(makeSite({ variant: "wsl", substrate: "windows" }))).toBe(false);
    });
  });

  describe("createObservationApi", () => {
    it("returns a CloudflareSiteObservationApi instance", () => {
      const api = cloudflareSiteAdapter.createObservationApi(makeSite());
      expect(api).toBeDefined();
      expect(typeof api.getHealth).toBe("function");
    });
  });

  describe("createControlClient", () => {
    it("returns a CloudflareSiteControlClient instance", () => {
      const client = cloudflareSiteAdapter.createControlClient(makeSite());
      expect(client).toBeDefined();
      expect(typeof client.executeControlRequest).toBe("function");
    });
  });
});

describe("CloudflareSiteObservationApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.NARADA_CLOUDFLARE_TOKEN_CF_SITE;
  });

  describe("getHealth", () => {
    it("maps healthy Cloudflare status to SiteHealthRecord", async () => {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify({
          site_id: "cf-site",
          health: {
            status: "healthy",
            last_cycle_at: "2026-04-20T10:00:00Z",
            last_cycle_status: "complete",
            pending_work_items: 0,
            locked: false,
          },
          last_cycle: {
            cycle_id: "c1",
            started_at: "2026-04-20T09:59:00Z",
            finished_at: "2026-04-20T10:00:00Z",
            status: "complete",
            steps_completed: [2, 3, 4],
          },
        }), { status: 200 })
      ));

      const api = new CloudflareSiteObservationApi(makeSite());
      const health = await api.getHealth();

      expect(health.status).toBe("healthy");
      expect(health.site_id).toBe("cf-site");
      expect(health.last_cycle_duration_ms).toBe(60000);
    });

    it("maps degraded Cloudflare status to degraded", async () => {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify({
          health: { status: "degraded", last_cycle_at: "2026-04-20T09:00:00Z" },
          last_cycle: null,
        }), { status: 200 })
      ));

      const api = new CloudflareSiteObservationApi(makeSite());
      const health = await api.getHealth();
      expect(health.status).toBe("degraded");
    });

    it("maps unhealthy Cloudflare status to critical", async () => {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify({
          health: { status: "unhealthy", last_cycle_at: null },
          last_cycle: null,
        }), { status: 200 })
      ));

      const api = new CloudflareSiteObservationApi(makeSite());
      const health = await api.getHealth();
      expect(health.status).toBe("critical");
    });

    it("returns error health when fetch fails", async () => {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify({ error: "Down" }), { status: 503 })
      ));

      const api = new CloudflareSiteObservationApi(makeSite());
      const health = await api.getHealth();
      expect(health.status).toBe("error");
      expect(health.message).toContain("503");
    });

    it("returns auth_failed health on 401", async () => {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 })
      ));

      const api = new CloudflareSiteObservationApi(makeSite());
      const health = await api.getHealth();
      expect(health.status).toBe("auth_failed");
      expect(health.message).toContain("401");
    });

    it("includes Authorization header when token env var is set", async () => {
      process.env.NARADA_CLOUDFLARE_TOKEN_CF_SITE = "secret-token";
      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ health: { status: "healthy" } }), { status: 200 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const api = new CloudflareSiteObservationApi(makeSite());
      await api.getHealth();

      expect(fetchMock).toHaveBeenCalledOnce();
      const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
      expect(init.headers["Authorization"]).toBe("Bearer secret-token");
    });
  });

  describe("detail observation methods", () => {
    it("getStuckWorkItems returns empty array", async () => {
      const api = new CloudflareSiteObservationApi(makeSite());
      expect(await api.getStuckWorkItems()).toEqual([]);
    });

    it("getPendingOutboundCommands returns empty array", async () => {
      const api = new CloudflareSiteObservationApi(makeSite());
      expect(await api.getPendingOutboundCommands()).toEqual([]);
    });

    it("getPendingDrafts returns empty array", async () => {
      const api = new CloudflareSiteObservationApi(makeSite());
      expect(await api.getPendingDrafts()).toEqual([]);
    });
  });

  describe("getCredentialRequirements", () => {
    it("returns empty array when health is not auth_failed", async () => {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify({
          health: { status: "unhealthy", last_cycle_at: null },
          last_cycle: null,
        }), { status: 200 })
      ));

      const api = new CloudflareSiteObservationApi(makeSite());
      const creds = await api.getCredentialRequirements();
      expect(creds).toEqual([]);
    });

    it("returns auth requirement when health is auth_failed", async () => {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 })
      ));

      const api = new CloudflareSiteObservationApi(makeSite());
      const creds = await api.getCredentialRequirements();
      expect(creds).toHaveLength(1);
      expect(creds[0].subtype).toBe("interactive_auth_required");
      expect(creds[0].remediation_command).toContain("narada auth --site cf-site");
    });
  });
});

describe("CloudflareSiteControlClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.NARADA_CLOUDFLARE_TOKEN_CF_SITE;
  });

  it("routes approve request successfully", async () => {
    process.env.NARADA_CLOUDFLARE_TOKEN_CF_SITE = "token";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, request_id: "op_123", status: "executed" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new CloudflareSiteControlClient(makeSite());
    const result = await client.executeControlRequest({
      requestId: "req-1",
      siteId: "cf-site",
      actionType: "approve",
      targetId: "ob-1",
      targetKind: "outbound_command",
      requestedAt: "2026-04-20T10:00:00Z",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("accepted");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toContain("/control/actions");
    expect(url).toContain("site_id=cf-site");
    const body = JSON.parse(init.body);
    expect(body.action_type).toBe("approve");
    expect(body.target_id).toBe("ob-1");
  });

  it("maps Cloudflare rejection to rejected status", async () => {
    process.env.NARADA_CLOUDFLARE_TOKEN_CF_SITE = "token";
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ success: false, reason: "Not draft_ready" }), { status: 422 })
    ));

    const client = new CloudflareSiteControlClient(makeSite());
    const result = await client.executeControlRequest({
      requestId: "req-2",
      siteId: "cf-site",
      actionType: "approve",
      targetId: "ob-1",
      targetKind: "outbound_command",
      requestedAt: "2026-04-20T10:00:00Z",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.detail).toContain("Not draft_ready");
  });

  it("returns error on authentication failure", async () => {
    process.env.NARADA_CLOUDFLARE_TOKEN_CF_SITE = "bad-token";
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 })
    ));

    const client = new CloudflareSiteControlClient(makeSite());
    const result = await client.executeControlRequest({
      requestId: "req-3",
      siteId: "cf-site",
      actionType: "retry",
      targetId: "wi-1",
      targetKind: "work_item",
      requestedAt: "2026-04-20T10:00:00Z",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("error");
    expect(result.detail).toContain("authentication failed");
  });

  it("returns error on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ENOTFOUND");
    }));

    const client = new CloudflareSiteControlClient(makeSite());
    const result = await client.executeControlRequest({
      requestId: "req-4",
      siteId: "cf-site",
      actionType: "reject",
      targetId: "ob-1",
      targetKind: "outbound_command",
      requestedAt: "2026-04-20T10:00:00Z",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("error");
    expect(result.detail).toContain("ENOTFOUND");
  });
});
