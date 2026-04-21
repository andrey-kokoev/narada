import { describe, it, expect, vi } from "vitest";
import {
  LogNotificationAdapter,
  DefaultNotificationEmitter,
  NullNotificationEmitter,
  type OperatorNotification,
  type NotificationAdapter,
  type NotificationRateLimiter,
} from "../../src/notification.js";

describe("LogNotificationAdapter", () => {
  it("emits structured JSON to console.warn", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const adapter = new LogNotificationAdapter();
    const notification: OperatorNotification = {
      site_id: "site-a",
      scope_id: "scope-a",
      severity: "critical",
      health_status: "critical",
      summary: "Test summary",
      detail: "Test detail",
      suggested_action: "narada status",
      occurred_at: "2026-04-20T12:00:00Z",
      cooldown_until: "2026-04-20T12:15:00Z",
    };

    await adapter.emit(notification);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(warnSpy.mock.calls[0]![0] as string);
    expect(parsed.event).toBe("operator_notification");
    expect(parsed.channel).toBe("log");
    expect(parsed.site_id).toBe("site-a");
    expect(parsed.severity).toBe("critical");
    warnSpy.mockRestore();
  });
});

describe("NullNotificationEmitter", () => {
  it("does nothing", async () => {
    const emitter = new NullNotificationEmitter();
    await emitter.emit({
      site_id: "site-a",
      scope_id: "scope-a",
      severity: "critical",
      health_status: "critical",
      summary: "x",
      detail: "x",
      suggested_action: "x",
      occurred_at: "2026-04-20T12:00:00Z",
      cooldown_until: "2026-04-20T12:15:00Z",
    });
    // No assertion needed — just verifying it doesn't throw
  });
});

describe("DefaultNotificationEmitter", () => {
  const makeNotification = (overrides?: Partial<OperatorNotification>): OperatorNotification => ({
    site_id: "site-a",
    scope_id: "scope-a",
    severity: "critical",
    health_status: "critical",
    summary: "Summary",
    detail: "Detail",
    suggested_action: "narada status",
    occurred_at: "2026-04-20T12:00:00Z",
    cooldown_until: "2026-04-20T12:15:00Z",
    ...overrides,
  });

  function createMockRateLimiter(): NotificationRateLimiter {
    const store = new Map<string, number>();
    const key = (s: string, sc: string, c: string, h: string) => `${s}|${sc}|${c}|${h}`;
    return {
      isCooldownActive: vi.fn((siteId, scopeId, channel, healthStatus, cooldownMs) => {
        const lastSent = store.get(key(siteId, scopeId, channel, healthStatus));
        if (!lastSent) return false;
        return Date.now() - lastSent < cooldownMs;
      }),
      recordSent: vi.fn((siteId, scopeId, channel, healthStatus) => {
        store.set(key(siteId, scopeId, channel, healthStatus), Date.now());
      }),
    };
  }

  function createMockAdapter(channelName: string): NotificationAdapter {
    return {
      channel: channelName,
      emit: vi.fn(async () => {}),
    };
  }

  it("emits through all adapters when cooldown is not active", async () => {
    const rateLimiter = createMockRateLimiter();
    const adapterA = createMockAdapter("log");
    const adapterB = createMockAdapter("webhook");
    const emitter = new DefaultNotificationEmitter([adapterA, adapterB], rateLimiter, 60_000);
    const notification = makeNotification();

    await emitter.emit(notification);

    expect(adapterA.emit).toHaveBeenCalledTimes(1);
    expect(adapterB.emit).toHaveBeenCalledTimes(1);
    expect(rateLimiter.recordSent).toHaveBeenCalledTimes(2);
  });

  it("suppresses emission when cooldown is active", async () => {
    const rateLimiter = createMockRateLimiter();
    const adapter = createMockAdapter("log");
    const emitter = new DefaultNotificationEmitter([adapter], rateLimiter, 60_000);
    const notification = makeNotification();

    // First emission should succeed
    await emitter.emit(notification);
    expect(adapter.emit).toHaveBeenCalledTimes(1);

    // Second emission should be suppressed
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await emitter.emit(notification);
    expect(adapter.emit).toHaveBeenCalledTimes(1); // still 1
    expect(logSpy).toHaveBeenCalledTimes(1);
    const suppressionLog = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(suppressionLog.event).toBe("notification_suppressed");
    expect(suppressionLog.reason).toBe("cooldown_active");
    logSpy.mockRestore();
  });

  it("continues with remaining adapters when one throws", async () => {
    const rateLimiter = createMockRateLimiter();
    const goodAdapter = createMockAdapter("log");
    const badAdapter: NotificationAdapter = {
      channel: "bad",
      emit: vi.fn(async () => { throw new Error("boom"); }),
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const emitter = new DefaultNotificationEmitter([badAdapter, goodAdapter], rateLimiter, 60_000);
    const notification = makeNotification();

    await emitter.emit(notification);

    expect(badAdapter.emit).toHaveBeenCalledTimes(1);
    expect(goodAdapter.emit).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const errorLog = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(errorLog.event).toBe("notification_adapter_failed");
    expect(errorLog.error).toBe("boom");
    errorSpy.mockRestore();
  });

  it("does not recordSent when adapter throws", async () => {
    const rateLimiter = createMockRateLimiter();
    const badAdapter: NotificationAdapter = {
      channel: "bad",
      emit: vi.fn(async () => { throw new Error("boom"); }),
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const emitter = new DefaultNotificationEmitter([badAdapter], rateLimiter, 60_000);

    await emitter.emit(makeNotification());

    expect(rateLimiter.recordSent).not.toHaveBeenCalled();
  });
});
