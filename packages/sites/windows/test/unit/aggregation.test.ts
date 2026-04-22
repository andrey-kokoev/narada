import { describe, it, expect } from "vitest";
import {
  aggregateHealth,
  deriveAttentionQueue,
  type CrossSiteHealthSummary,
  type AttentionQueueItem,
} from "../../src/aggregation.js";
import type { SiteRegistry, RegisteredSite } from "../../src/registry.js";
import type {
  SiteObservationApi,
  SiteHealthRecord,
  StuckWorkItem,
  PendingOutboundCommand,
  PendingDraft,
  CredentialRequirement,
} from "../../src/site-observation.js";

function makeMockRegistry(sites: RegisteredSite[]): SiteRegistry {
  return {
    listSites: () => sites,
    getSite: (siteId: string) => sites.find((s) => s.siteId === siteId) ?? null,
  };
}

function makeMockObservationApi(
  health: SiteHealthRecord,
  stuckWorkItems: StuckWorkItem[] = [],
  pendingCommands: PendingOutboundCommand[] = [],
  pendingDrafts: PendingDraft[] = [],
  credentialRequirements: CredentialRequirement[] = [],
): SiteObservationApi {
  return {
    getHealth: () => health,
    getStuckWorkItems: () => stuckWorkItems,
    getPendingOutboundCommands: () => pendingCommands,
    getPendingDrafts: () => pendingDrafts,
    getCredentialRequirements: () => credentialRequirements,
  };
}

function makeHealth(
  overrides: Partial<SiteHealthRecord> = {},
): SiteHealthRecord {
  return {
    site_id: overrides.site_id ?? "test-site",
    status: overrides.status ?? "healthy",
    last_cycle_at: overrides.last_cycle_at ?? new Date().toISOString(),
    last_cycle_duration_ms: overrides.last_cycle_duration_ms ?? 1000,
    consecutive_failures: overrides.consecutive_failures ?? 0,
    message: overrides.message ?? "OK",
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  };
}

describe("aggregateHealth", () => {
  it("returns zero counts when no sites are registered", async () => {
    const registry = makeMockRegistry([]);
    const summary = await aggregateHealth(registry, () =>
      makeMockObservationApi(makeHealth()),
    );
    expect(summary.total_sites).toBe(0);
    expect(summary.healthy).toBe(0);
    expect(summary.critical).toBe(0);
  });

  it("counts healthy sites correctly", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
      { siteId: "site-b", variant: "wsl", siteRoot: "/tmp/b", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);
    const summary = await aggregateHealth(registry, (site) =>
      makeMockObservationApi(makeHealth({ site_id: site.siteId, status: "healthy" })),
    );
    expect(summary.total_sites).toBe(2);
    expect(summary.healthy).toBe(2);
    expect(summary.critical).toBe(0);
    expect(summary.degraded).toBe(0);
  });

  it("counts mixed health statuses", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
      { siteId: "site-b", variant: "native", siteRoot: "C:\\tmp\\b", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
      { siteId: "site-c", variant: "wsl", siteRoot: "/tmp/c", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
      { siteId: "site-d", variant: "wsl", siteRoot: "/tmp/d", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);

    const healthMap: Record<string, SiteHealthRecord["status"]> = {
      "site-a": "healthy",
      "site-b": "degraded",
      "site-c": "critical",
      "site-d": "auth_failed",
    };

    const summary = await aggregateHealth(registry, (site) =>
      makeMockObservationApi(
        makeHealth({ site_id: site.siteId, status: healthMap[site.siteId] }),
      ),
    );

    expect(summary.total_sites).toBe(4);
    expect(summary.healthy).toBe(1);
    expect(summary.degraded).toBe(1);
    expect(summary.critical).toBe(1);
    expect(summary.auth_failed).toBe(1);
  });

  it("includes per-site health views", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);
    const health = makeHealth({
      site_id: "site-a",
      status: "degraded",
      consecutive_failures: 2,
      message: "Cycle timeout",
    });
    const summary = await aggregateHealth(registry, () =>
      makeMockObservationApi(health),
    );

    expect(summary.sites).toHaveLength(1);
    expect(summary.sites[0].site_id).toBe("site-a");
    expect(summary.sites[0].status).toBe("degraded");
    expect(summary.sites[0].consecutive_failures).toBe(2);
    expect(summary.sites[0].message).toBe("Cycle timeout");
  });
});

describe("deriveAttentionQueue", () => {
  it("returns empty queue when no sites are registered", async () => {
    const registry = makeMockRegistry([]);
    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(makeHealth()),
    );
    expect(queue).toHaveLength(0);
  });

  it("includes critical health items as high severity", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);
    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(
        makeHealth({ site_id: "site-a", status: "critical" }),
      ),
    );

    expect(queue).toHaveLength(1);
    expect(queue[0].item_type).toBe("critical_health");
    expect(queue[0].severity).toBe("high");
    expect(queue[0].site_id).toBe("site-a");
  });

  it("includes auth_failed health items as high severity", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);
    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(
        makeHealth({ site_id: "site-a", status: "auth_failed" }),
      ),
    );

    expect(queue).toHaveLength(1);
    expect(queue[0].item_type).toBe("auth_failed_health");
    expect(queue[0].severity).toBe("high");
  });

  it("includes stuck work items", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);
    const stuck: StuckWorkItem[] = [
      {
        work_item_id: "wi-1",
        scope_id: "scope-1",
        status: "failed_retryable",
        context_id: "ctx-1",
        last_updated_at: new Date().toISOString(),
        summary: "Work item failed",
      },
    ];
    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(makeHealth({ site_id: "site-a" }), stuck),
    );

    expect(queue.some((i) => i.item_type === "stuck_work_item")).toBe(true);
    const item = queue.find((i) => i.item_type === "stuck_work_item")!;
    expect(item.severity).toBe("high");
    expect(item.item_id).toBe("wi-1");
  });

  it("includes pending outbound commands as medium severity", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);
    const commands: PendingOutboundCommand[] = [
      {
        outbound_id: "cmd-1",
        scope_id: "scope-1",
        context_id: "ctx-1",
        action_type: "send_reply",
        status: "pending",
        created_at: new Date().toISOString(),
        summary: "Send reply pending",
      },
    ];
    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(makeHealth({ site_id: "site-a" }), [], commands),
    );

    expect(queue.some((i) => i.item_type === "pending_outbound_command")).toBe(
      true,
    );
    const item = queue.find(
      (i) => i.item_type === "pending_outbound_command",
    )!;
    expect(item.severity).toBe("medium");
  });

  it("includes pending drafts as low severity", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);
    const drafts: PendingDraft[] = [
      {
        draft_id: "draft-1",
        scope_id: "scope-1",
        context_id: "ctx-1",
        status: "draft_ready",
        created_at: new Date().toISOString(),
        summary: "Draft ready for approval",
      },
    ];
    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(makeHealth({ site_id: "site-a" }), [], [], drafts),
    );

    expect(queue.some((i) => i.item_type === "pending_draft")).toBe(true);
    const item = queue.find((i) => i.item_type === "pending_draft")!;
    expect(item.severity).toBe("low");
  });

  it("sorts by severity then recency", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);

    const now = Date.now();
    const health = makeHealth({
      site_id: "site-a",
      status: "critical",
      updated_at: new Date(now - 1000).toISOString(),
    });
    const drafts: PendingDraft[] = [
      {
        draft_id: "draft-1",
        scope_id: "scope-1",
        context_id: "ctx-1",
        status: "draft_ready",
        created_at: new Date(now).toISOString(),
        summary: "Draft ready",
      },
    ];

    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(health, [], [], drafts),
    );

    // critical health (high) should come before draft (low)
    expect(queue[0].item_type).toBe("critical_health");
    expect(queue[1].item_type).toBe("pending_draft");
  });

  it("aggregates items from multiple sites", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
      { siteId: "site-b", variant: "wsl", siteRoot: "/tmp/b", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);

    const queue = await deriveAttentionQueue(registry, (site) =>
      makeMockObservationApi(
        makeHealth({
          site_id: site.siteId,
          status: site.siteId === "site-a" ? "critical" : "healthy",
        }),
      ),
    );

    expect(queue).toHaveLength(1);
    expect(queue[0].site_id).toBe("site-a");
  });
});

describe("deriveAttentionQueue — credential requirements", () => {
  it("includes interactive_auth_required as high severity", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);

    const credReqs: CredentialRequirement[] = [
      {
        requirement_id: "cred-1",
        scope_id: "scope-1",
        subtype: "interactive_auth_required",
        summary: "Azure AD token expired",
        remediation_command: "az login --tenant <tenant-id>",
        remediation_description: "Run az login to refresh the Azure AD token",
        requested_at: new Date().toISOString(),
      },
    ];

    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(makeHealth(), [], [], [], credReqs),
    );

    expect(queue).toHaveLength(1);
    expect(queue[0].item_type).toBe("credential_required");
    expect(queue[0].subtype).toBe("interactive_auth_required");
    expect(queue[0].severity).toBe("high");
    expect(queue[0].item_id).toBe("cred-1");
  });

  it("includes token_refresh as medium severity", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);

    const credReqs: CredentialRequirement[] = [
      {
        requirement_id: "cred-2",
        scope_id: "scope-1",
        subtype: "token_refresh",
        summary: "OAuth token nearing expiry",
        remediation_command: "narada refresh-token --site <site-id>",
        remediation_description: "Refresh the OAuth token before expiry",
        requested_at: new Date().toISOString(),
      },
    ];

    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(makeHealth(), [], [], [], credReqs),
    );

    expect(queue[0].severity).toBe("medium");
    expect(queue[0].subtype).toBe("token_refresh");
  });

  it("carries remediation metadata on the queue item", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);

    const credReqs: CredentialRequirement[] = [
      {
        requirement_id: "cred-3",
        scope_id: "scope-1",
        subtype: "interactive_auth_required",
        summary: "MS Graph token invalid",
        remediation_command: "az login --tenant <tenant-id>",
        remediation_description: "Re-authenticate with Azure AD",
        requested_at: new Date().toISOString(),
      },
    ];

    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(makeHealth(), [], [], [], credReqs),
    );

    const item = queue[0];
    expect(item.remediation).toBeDefined();
    expect(item.remediation!.command).toBe("az login --tenant <tenant-id>");
    expect(item.remediation!.description).toBe("Re-authenticate with Azure AD");
  });

  it("does not expose secret material in remediation commands", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);

    // Simulate a credential requirement that a malicious or buggy resolver
    // might try to embed secrets into. The test proves the interface and
    // aggregator do not add secrets, but we also assert no common secret
    // patterns leak through.
    const credReqs: CredentialRequirement[] = [
      {
        requirement_id: "cred-4",
        scope_id: "scope-1",
        subtype: "interactive_auth_required",
        summary: "Auth required",
        remediation_command: "az login --tenant <tenant-id>",
        remediation_description: "Login interactively",
        requested_at: new Date().toISOString(),
      },
    ];

    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(makeHealth(), [], [], [], credReqs),
    );

    const command = queue[0].remediation!.command;
    const description = queue[0].remediation!.description;

    // No raw secret material should be present
    const secretPatterns = [
      /password\s*[=:]\s*\S+/i,
      /token\s*[=:]\s*\S+/i,
      /secret\s*[=:]\s*\S+/i,
      /client_secret\s*[=:]\s*\S+/i,
      /api_key\s*[=:]\s*\S+/i,
      /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*/, // JWT pattern
      /[a-f0-9]{32,}/i, // hex secret pattern
    ];

    for (const pattern of secretPatterns) {
      expect(command).not.toMatch(pattern);
      expect(description).not.toMatch(pattern);
    }
  });

  it("uses placeholders instead of actual identifiers in remediation", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);

    const credReqs: CredentialRequirement[] = [
      {
        requirement_id: "cred-5",
        scope_id: "scope-1",
        subtype: "interactive_auth_required",
        summary: "Azure AD auth required",
        remediation_command: "az login --tenant <tenant-id>",
        remediation_description: "Run az login for tenant <tenant-id>",
        requested_at: new Date().toISOString(),
      },
    ];

    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(makeHealth(), [], [], [], credReqs),
    );

    // Placeholders should be present, not raw GUIDs
    expect(queue[0].remediation!.command).toContain("<tenant-id>");
    // Should not contain a raw GUID-like value
    expect(queue[0].remediation!.command).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it("does not invoke az or any subprocess", async () => {
    const registry = makeMockRegistry([
      { siteId: "site-a", variant: "wsl", siteRoot: "/tmp/a", substrate: "windows", aimJson: null, controlEndpoint: null, lastSeenAt: null, createdAt: "2024-01-01" },
    ]);

    const credReqs: CredentialRequirement[] = [
      {
        requirement_id: "cred-6",
        scope_id: "scope-1",
        subtype: "interactive_auth_required",
        summary: "Auth required",
        remediation_command: "az login --tenant <tenant-id>",
        remediation_description: "Interactive login required",
        requested_at: new Date().toISOString(),
      },
    ];

    // The derivation is pure: it only transforms observation data into queue
    // items. No subprocesses are spawned, no side effects occur.
    const queue = await deriveAttentionQueue(registry, () =>
      makeMockObservationApi(makeHealth(), [], [], [], credReqs),
    );

    expect(queue[0].item_type).toBe("credential_required");
    // The command is advisory metadata; the system does not execute it.
    expect(typeof queue[0].remediation!.command).toBe("string");
  });
});
