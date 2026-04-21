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

describe("Operator action handler integration", () => {
  it("returns 401 without authorization", async () => {
    const site = createSiteFixture("help");
    const request = new Request("http://localhost/control/actions?scope_id=scope-001", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_type: "approve", target_id: "ob-001" }),
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const site = createSiteFixture("help");
    const request = new Request("http://localhost/control/actions?scope_id=scope-001", {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action_type: "approve", target_id: "ob-001" }),
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(401);
  });

  it("returns 405 for GET on /control/actions", async () => {
    const site = createSiteFixture("help");
    const request = new Request("http://localhost/control/actions?scope_id=scope-001", {
      method: "GET",
      headers: { Authorization: "Bearer secret" },
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(405);
  });

  it("returns 400 when scope_id is missing", async () => {
    const site = createSiteFixture("help");
    const request = new Request("http://localhost/control/actions", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action_type: "approve", target_id: "ob-001" }),
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(400);
  });

  it("returns 400 when action_type is missing", async () => {
    const site = createSiteFixture("help");
    const request = new Request("http://localhost/control/actions?scope_id=scope-001", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_id: "ob-001" }),
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(400);
  });

  it("returns 400 when action_type is invalid", async () => {
    const site = createSiteFixture("help");
    const request = new Request("http://localhost/control/actions?scope_id=scope-001", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action_type: "delete_everything", target_id: "ob-001" }),
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(400);
  });

  it("successfully approves a draft-ready outbound command", async () => {
    const site = createSiteFixture("help");
    site.seedContext("ctx-001", "scope-001", "primary-charter");
    site.seedOutboundCommand("ob-001", "ctx-001", "scope-001", "send_reply", "draft_ready");

    const request = new Request("http://localhost/control/actions?scope_id=scope-001", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action_type: "approve", target_id: "ob-001" }),
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("executed");
    expect(body.request_id).toMatch(/^op_\d+_/);

    // Verify mutation
    const cmd = await site.coordinator.getOutboundCommand("ob-001");
    expect(cmd!.status).toBe("approved_for_send");

    // Verify audit
    const audit = site.coordinator.getOperatorActionRequest(body.request_id);
    expect(audit).not.toBeNull();
    expect(audit!.status).toBe("executed");
    expect(audit!.action_type).toBe("approve");
  });

  it("successfully rejects a draft-ready outbound command", async () => {
    const site = createSiteFixture("help");
    site.seedContext("ctx-001", "scope-001", "primary-charter");
    site.seedOutboundCommand("ob-001", "ctx-001", "scope-001", "send_reply", "draft_ready");

    const request = new Request("http://localhost/control/actions?scope_id=scope-001", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action_type: "reject", target_id: "ob-001" }),
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const cmd = await site.coordinator.getOutboundCommand("ob-001");
    expect(cmd!.status).toBe("cancelled");
  });

  it("rejects approval with 422 when outbound is not draft_ready", async () => {
    const site = createSiteFixture("help");
    site.seedContext("ctx-001", "scope-001", "primary-charter");
    site.seedOutboundCommand("ob-001", "ctx-001", "scope-001", "send_reply", "submitted");

    const request = new Request("http://localhost/control/actions?scope_id=scope-001", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action_type: "approve", target_id: "ob-001" }),
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.reason).toContain("not in draft_ready status");

    // Verify no mutation occurred
    const cmd = await site.coordinator.getOutboundCommand("ob-001");
    expect(cmd!.status).toBe("submitted");
  });

  it("successfully retries a failed_retryable work item", async () => {
    const site = createSiteFixture("help");
    site.seedContext("ctx-001", "scope-001", "primary-charter");
    site.seedWorkItem("wi-001", "ctx-001", "scope-001", "failed_retryable");

    const request = new Request("http://localhost/control/actions?scope_id=scope-001", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action_type: "retry", target_id: "wi-001" }),
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const item = await site.coordinator.getWorkItem("wi-001");
    expect(item!.status).toBe("opened");
  });

  it("successfully cancels an opened work item", async () => {
    const site = createSiteFixture("help");
    site.seedContext("ctx-001", "scope-001", "primary-charter");
    site.seedWorkItem("wi-001", "ctx-001", "scope-001", "opened");

    const request = new Request("http://localhost/control/actions?scope_id=scope-001", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action_type: "cancel", target_id: "wi-001" }),
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const item = await site.coordinator.getWorkItem("wi-001");
    expect(item!.status).toBe("cancelled");
  });

  it("rejects cancel with 422 when work item is leased", async () => {
    const site = createSiteFixture("help");
    site.seedContext("ctx-001", "scope-001", "primary-charter");
    site.seedWorkItem("wi-001", "ctx-001", "scope-001", "leased");

    const request = new Request("http://localhost/control/actions?scope_id=scope-001", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action_type: "cancel", target_id: "wi-001" }),
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.success).toBe(false);

    const item = await site.coordinator.getWorkItem("wi-001");
    expect(item!.status).toBe("leased");
  });

  it("writes audit record for rejected mutations", async () => {
    const site = createSiteFixture("help");
    site.seedContext("ctx-001", "scope-001", "primary-charter");
    site.seedOutboundCommand("ob-001", "ctx-001", "scope-001", "send_reply", "submitted");

    const request = new Request("http://localhost/control/actions?scope_id=scope-001", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action_type: "approve", target_id: "ob-001" }),
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);

    const body = await response.json();
    const audit = site.coordinator.getOperatorActionRequest(body.request_id);
    expect(audit).not.toBeNull();
    expect(audit!.status).toBe("rejected");
    expect(audit!.rejection_reason).toContain("not in draft_ready status");
    expect(audit!.rejected_at).not.toBeNull();
  });

  it("observation endpoint /status remains read-only", async () => {
    const site = createSiteFixture("help");
    const request = new Request("http://localhost/status?site_id=help", {
      headers: { Authorization: "Bearer secret" },
    });
    const response = await handler.fetch(request, createMockEnv(site.coordinator, "secret"), {} as ExecutionContext);
    expect(response.status).toBe(200);

    const body = await response.json();
    // Status should not contain mutation-related fields
    expect(body).toHaveProperty("site_id");
    expect(body).toHaveProperty("health");
    expect(body).not.toHaveProperty("success");
  });
});
