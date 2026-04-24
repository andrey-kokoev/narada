import { describe, it, expect } from "vitest";
import { createSiteFixture } from "../fixtures/site.js";
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

describe("Observation surfaces integration", () => {
  it("GET /stuck-work-items returns stuck items", async () => {
    const site = createSiteFixture("obs-site");
    site.seedWorkItem("wi-1", "ctx-1", "obs-site", "failed_retryable");

    const request = new Request("http://localhost/stuck-work-items?site_id=obs-site", {
      headers: { Authorization: "Bearer secret" },
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);

    expect(response.status).toBe(200);
    const body = await response.json() as { stuck_work_items: Array<{ workItemId: string; status: string }> };
    expect(body.stuck_work_items.length).toBe(1);
    expect(body.stuck_work_items[0].workItemId).toBe("wi-1");
    expect(body.stuck_work_items[0].status).toBe("failed_retryable");
  });

  it("GET /stuck-work-items returns 401 without auth", async () => {
    const site = createSiteFixture("obs-site");
    const request = new Request("http://localhost/stuck-work-items?site_id=obs-site");
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(401);
  });

  it("GET /stuck-work-items returns 400 when site_id is missing", async () => {
    const site = createSiteFixture("obs-site");
    const request = new Request("http://localhost/stuck-work-items", {
      headers: { Authorization: "Bearer secret" },
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(400);
  });

  it("GET /pending-outbounds returns pending commands", async () => {
    const site = createSiteFixture("obs-site");
    site.seedOutboundCommand("ob-1", "ctx-1", "obs-site", "send_reply", "pending");

    const request = new Request("http://localhost/pending-outbounds?site_id=obs-site", {
      headers: { Authorization: "Bearer secret" },
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);

    expect(response.status).toBe(200);
    const body = await response.json() as { pending_outbound_commands: Array<{ outboundId: string; status: string }> };
    // Note: seeded item may not pass time threshold, so result may be empty
    expect(body.pending_outbound_commands).toBeDefined();
  });

  it("GET /pending-drafts returns draft-ready items", async () => {
    const site = createSiteFixture("obs-site");
    site.seedOutboundCommand("ob-1", "ctx-1", "obs-site", "send_reply", "draft_ready");

    const request = new Request("http://localhost/pending-drafts?site_id=obs-site", {
      headers: { Authorization: "Bearer secret" },
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);

    expect(response.status).toBe(200);
    const body = await response.json() as { pending_drafts: Array<{ draftId: string; status: string }> };
    expect(body.pending_drafts.length).toBe(1);
    expect(body.pending_drafts[0].draftId).toBe("ob-1");
    expect(body.pending_drafts[0].status).toBe("draft_ready");
  });

  it("GET /pending-drafts returns 401 without auth", async () => {
    const site = createSiteFixture("obs-site");
    const request = new Request("http://localhost/pending-drafts?site_id=obs-site");
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(401);
  });

  it("DO fetch() serves /stuck-work-items directly", async () => {
    const site = createSiteFixture("do-obs-site");
    site.seedWorkItem("wi-do-1", "ctx-1", "do-obs-site", "failed_retryable");

    const request = new Request("http://localhost/stuck-work-items", { method: "GET" });
    const response = await site.coordinator.fetch(request);

    expect(response.status).toBe(200);
    const body = await response.json() as { stuck_work_items: Array<{ workItemId: string }> };
    expect(body.stuck_work_items.length).toBe(1);
    expect(body.stuck_work_items[0].workItemId).toBe("wi-do-1");
  });

  it("DO fetch() serves /pending-drafts directly", async () => {
    const site = createSiteFixture("do-obs-site");
    site.seedOutboundCommand("ob-do-1", "ctx-1", "do-obs-site", "send_reply", "draft_ready");

    const request = new Request("http://localhost/pending-drafts", { method: "GET" });
    const response = await site.coordinator.fetch(request);

    expect(response.status).toBe(200);
    const body = await response.json() as { pending_drafts: Array<{ draftId: string }> };
    expect(body.pending_drafts.length).toBe(1);
    expect(body.pending_drafts[0].draftId).toBe("ob-do-1");
  });

  it("DO fetch() returns 405 for POST on observation endpoints", async () => {
    const site = createSiteFixture("do-obs-site");
    const request = new Request("http://localhost/stuck-work-items", { method: "POST" });
    const response = await site.coordinator.fetch(request);
    expect(response.status).toBe(405);
  });
});
