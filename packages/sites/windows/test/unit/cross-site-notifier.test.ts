import { describe, it, expect, vi } from "vitest";
import {
  SiteHealthTracker,
  shouldNotify,
  buildNotification,
  CrossSiteNotificationRouter,
} from "../../src/cross-site-notifier.js";
import type { RegisteredSite } from "../../src/registry.js";
import type { SiteHealthRecord } from "../../src/types.js";
import type {
  SiteObservationApi,
  NotificationEmitter,
  OperatorNotification,
} from "../../src/notification.js";

function makeSite(overrides: Partial<RegisteredSite> = {}): RegisteredSite {
  return {
    siteId: overrides.siteId ?? "test-site",
    variant: overrides.variant ?? "wsl",
    siteRoot: overrides.siteRoot ?? "/tmp/test-site",
    substrate: overrides.substrate ?? "windows",
    aimJson: null,
    controlEndpoint: null,
    lastSeenAt: null,
    createdAt: "2024-01-01",
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

function makeMockRegistry(sites: RegisteredSite[]) {
  return {
    listSites: () => sites,
    getSite: (siteId: string) => sites.find((s) => s.siteId === siteId) ?? null,
  };
}

function makeMockObservationApi(health: SiteHealthRecord): SiteObservationApi {
  return {
    getHealth: () => health,
    getStuckWorkItems: () => [],
    getPendingOutboundCommands: () => [],
    getPendingDrafts: () => [],
    getCredentialRequirements: () => [],
  };
}

describe("SiteHealthTracker", () => {
  it("returns undefined for first observation", () => {
    const tracker = new SiteHealthTracker();
    const previous = tracker.record("site-a", "healthy");
    expect(previous).toBeUndefined();
  });

  it("returns previous status on subsequent observations", () => {
    const tracker = new SiteHealthTracker();
    tracker.record("site-a", "healthy");
    const previous = tracker.record("site-a", "critical");
    expect(previous).toBe("healthy");
  });

  it("get returns the last recorded status", () => {
    const tracker = new SiteHealthTracker();
    tracker.record("site-a", "degraded");
    expect(tracker.get("site-a")).toBe("degraded");
  });

  it("clear removes all tracked state", () => {
    const tracker = new SiteHealthTracker();
    tracker.record("site-a", "healthy");
    tracker.clear();
    expect(tracker.get("site-a")).toBeUndefined();
  });
});

describe("shouldNotify", () => {
  it("returns false for healthy status", () => {
    expect(shouldNotify("healthy", "healthy")).toBe(false);
  });

  it("returns false for degraded status", () => {
    expect(shouldNotify("healthy", "degraded")).toBe(false);
  });

  it("returns true on first transition to critical", () => {
    expect(shouldNotify(undefined, "critical")).toBe(true);
  });

  it("returns true on transition from healthy to critical", () => {
    expect(shouldNotify("healthy", "critical")).toBe(true);
  });

  it("returns false on repeated critical observations", () => {
    expect(shouldNotify("critical", "critical")).toBe(false);
  });

  it("returns true on transition from critical to auth_failed", () => {
    expect(shouldNotify("critical", "auth_failed")).toBe(true);
  });

  it("returns true on first transition to auth_failed", () => {
    expect(shouldNotify(undefined, "auth_failed")).toBe(true);
  });
});

describe("buildNotification", () => {
  it("builds critical notification correctly", () => {
    const site = makeSite({ siteId: "prod" });
    const health = makeHealth({
      site_id: "prod",
      status: "critical",
      message: "Repeated failures",
    });
    const notification = buildNotification(site, health, 900_000);

    expect(notification.site_id).toBe("prod");
    expect(notification.scope_id).toBe("prod");
    expect(notification.severity).toBe("critical");
    expect(notification.health_status).toBe("critical");
    expect(notification.summary).toContain("critical");
    expect(notification.detail).toBe("Repeated failures");
    expect(notification.suggested_action).toContain("doctor");
    expect(notification.cooldown_until).toBeDefined();
  });

  it("builds auth_failed notification correctly", () => {
    const site = makeSite({ siteId: "prod" });
    const health = makeHealth({
      site_id: "prod",
      status: "auth_failed",
      message: "Token expired",
    });
    const notification = buildNotification(site, health);

    expect(notification.health_status).toBe("auth_failed");
    expect(notification.summary).toContain("Authentication failed");
    expect(notification.suggested_action).toContain("credentials");
  });

  it("sets cooldown_until based on cooldownMs", () => {
    const site = makeSite();
    const health = makeHealth({ status: "critical" });
    const ms = 30 * 60 * 1000;
    const notification = buildNotification(site, health, ms);
    const occurredAt = new Date(notification.occurred_at).getTime();
    const cooldownUntil = new Date(notification.cooldown_until).getTime();
    expect(cooldownUntil - occurredAt).toBe(ms);
  });
});

describe("CrossSiteNotificationRouter", () => {
  it("emits notification on critical transition", async () => {
    const site = makeSite({ siteId: "site-a" });
    const registry = makeMockRegistry([site]);
    const health = makeHealth({ site_id: "site-a", status: "critical" });

    const emitted: OperatorNotification[] = [];
    const mockEmitter: NotificationEmitter = {
      emit: vi.fn(async (n: OperatorNotification) => {
        emitted.push(n);
      }),
    };

    const router = new CrossSiteNotificationRouter(
      registry,
      () => makeMockObservationApi(health),
      mockEmitter,
    );

    const result = await router.checkAndNotify();
    expect(result).toHaveLength(1);
    expect(result[0].health_status).toBe("critical");
    expect(emitted).toHaveLength(1);
  });

  it("does not emit on repeated critical observation", async () => {
    const site = makeSite({ siteId: "site-a" });
    const registry = makeMockRegistry([site]);
    const health = makeHealth({ site_id: "site-a", status: "critical" });

    const emitted: OperatorNotification[] = [];
    const mockEmitter: NotificationEmitter = {
      emit: vi.fn(async (n: OperatorNotification) => {
        emitted.push(n);
      }),
    };

    const router = new CrossSiteNotificationRouter(
      registry,
      () => makeMockObservationApi(health),
      mockEmitter,
    );

    // First call should emit
    await router.checkAndNotify();
    expect(emitted).toHaveLength(1);

    // Second call should not emit (same status)
    const result = await router.checkAndNotify();
    expect(result).toHaveLength(0);
    expect(emitted).toHaveLength(1);
  });

  it("does not emit for healthy sites", async () => {
    const site = makeSite({ siteId: "site-a" });
    const registry = makeMockRegistry([site]);
    const health = makeHealth({ site_id: "site-a", status: "healthy" });

    const mockEmitter: NotificationEmitter = {
      emit: vi.fn(),
    };

    const router = new CrossSiteNotificationRouter(
      registry,
      () => makeMockObservationApi(health),
      mockEmitter,
    );

    const result = await router.checkAndNotify();
    expect(result).toHaveLength(0);
    expect(mockEmitter.emit).not.toHaveBeenCalled();
  });

  it("emits for multiple sites transitioning independently", async () => {
    const siteA = makeSite({ siteId: "site-a" });
    const siteB = makeSite({ siteId: "site-b" });
    const registry = makeMockRegistry([siteA, siteB]);

    const healthMap: Record<string, SiteHealthRecord> = {
      "site-a": makeHealth({ site_id: "site-a", status: "critical" }),
      "site-b": makeHealth({ site_id: "site-b", status: "auth_failed" }),
    };

    const emitted: OperatorNotification[] = [];
    const mockEmitter: NotificationEmitter = {
      emit: vi.fn(async (n: OperatorNotification) => {
        emitted.push(n);
      }),
    };

    const router = new CrossSiteNotificationRouter(
      registry,
      (site) => makeMockObservationApi(healthMap[site.siteId]),
      mockEmitter,
    );

    const result = await router.checkAndNotify();
    expect(result).toHaveLength(2);
    expect(result.some((n) => n.health_status === "critical")).toBe(true);
    expect(result.some((n) => n.health_status === "auth_failed")).toBe(true);
  });

  it("reset clears tracked state so transitions re-emit", async () => {
    const site = makeSite({ siteId: "site-a" });
    const registry = makeMockRegistry([site]);
    const health = makeHealth({ site_id: "site-a", status: "critical" });

    const emitted: OperatorNotification[] = [];
    const mockEmitter: NotificationEmitter = {
      emit: vi.fn(async (n: OperatorNotification) => {
        emitted.push(n);
      }),
    };

    const router = new CrossSiteNotificationRouter(
      registry,
      () => makeMockObservationApi(health),
      mockEmitter,
    );

    await router.checkAndNotify();
    expect(emitted).toHaveLength(1);

    // Reset and re-check — should emit again because tracker is cleared
    router.reset();
    await router.checkAndNotify();
    expect(emitted).toHaveLength(2);
  });

  it("suppresses notification within cooldown even on status transition", async () => {
    const site = makeSite({ siteId: "site-a" });
    const registry = makeMockRegistry([site]);

    // Simulate health oscillating: critical → healthy → critical
    const healthStates = [
      makeHealth({ site_id: "site-a", status: "critical" }),
      makeHealth({ site_id: "site-a", status: "healthy" }),
      makeHealth({ site_id: "site-a", status: "critical" }),
    ];
    let callIndex = 0;

    const emitted: OperatorNotification[] = [];
    const mockEmitter: NotificationEmitter = {
      emit: vi.fn(async (n: OperatorNotification) => {
        emitted.push(n);
      }),
    };

    const router = new CrossSiteNotificationRouter(
      registry,
      () => makeMockObservationApi(healthStates[callIndex++]!),
      mockEmitter,
      900_000, // 15 min cooldown
    );

    // First critical → emit
    const first = await router.checkAndNotify();
    expect(first).toHaveLength(1);

    // Healthy → no emit (not a bad status)
    const second = await router.checkAndNotify();
    expect(second).toHaveLength(0);

    // Critical again, but within 15 min cooldown → suppress
    const third = await router.checkAndNotify();
    expect(third).toHaveLength(0);
    expect(emitted).toHaveLength(1);
  });

  it("emits again after cooldown expires", async () => {
    const site = makeSite({ siteId: "site-a" });
    const registry = makeMockRegistry([site]);

    const healthStates = [
      makeHealth({ site_id: "site-a", status: "critical" }),
      makeHealth({ site_id: "site-a", status: "healthy" }),
      makeHealth({ site_id: "site-a", status: "critical" }),
    ];
    let callIndex = 0;

    const mockEmitter: NotificationEmitter = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    const shortCooldown = 50; // ms
    const router = new CrossSiteNotificationRouter(
      registry,
      () => makeMockObservationApi(healthStates[callIndex++]!),
      mockEmitter,
      shortCooldown,
    );

    await router.checkAndNotify(); // emit
    await router.checkAndNotify(); // healthy, no emit

    // Wait for cooldown to expire
    await new Promise((r) => setTimeout(r, shortCooldown + 20));

    const third = await router.checkAndNotify(); // critical, cooldown expired → emit
    expect(third).toHaveLength(1);
    expect(mockEmitter.emit).toHaveBeenCalledTimes(2);
  });

  it("logs suppression as structured trace", async () => {
    const site = makeSite({ siteId: "site-a" });
    const registry = makeMockRegistry([site]);

    const healthStates = [
      makeHealth({ site_id: "site-a", status: "critical" }),
      makeHealth({ site_id: "site-a", status: "healthy" }),
      makeHealth({ site_id: "site-a", status: "critical" }),
    ];
    let callIndex = 0;

    const mockEmitter: NotificationEmitter = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    const router = new CrossSiteNotificationRouter(
      registry,
      () => makeMockObservationApi(healthStates[callIndex++]!),
      mockEmitter,
      900_000,
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await router.checkAndNotify(); // emit
    await router.checkAndNotify(); // healthy
    await router.checkAndNotify(); // suppressed by cooldown

    const suppressedCalls = logSpy.mock.calls.filter((call) => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return parsed.event === "notification_suppressed";
      } catch {
        return false;
      }
    });

    expect(suppressedCalls).toHaveLength(1);
    const record = JSON.parse(suppressedCalls[0]![0] as string);
    expect(record.site_id).toBe("site-a");
    expect(record.reason).toBe("cooldown_active");
    expect(record.cooldown_until).toBeDefined();

    logSpy.mockRestore();
  });
});
