import { describe, it, expect, vi } from "vitest";
import {
  notifyOperator,
  LogNotificationAdapter,
  WebhookNotificationAdapter,
  DefaultNotificationEmitter,
  SqliteNotificationRateLimiter,
  NullNotificationEmitter,
  DEFAULT_NOTIFICATION_COOLDOWN_MS,
} from "../../src/notification.js";

describe("notification", () => {
  describe("LogNotificationAdapter", () => {
    it("emits structured JSON to console.warn", async () => {
      const adapter = new LogNotificationAdapter();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await adapter.emit({
        site_id: "s1",
        scope_id: "s1",
        severity: "critical",
        health_status: "critical",
        summary: "test",
        detail: "detail",
        suggested_action: "act",
        occurred_at: "2026-04-21T12:00:00Z",
        cooldown_until: "2026-04-21T12:15:00Z",
      });
      expect(warnSpy).toHaveBeenCalled();
      const call = warnSpy.mock.calls[0][0] as string;
      expect(JSON.parse(call).event).toBe("operator_notification");
      warnSpy.mockRestore();
    });
  });

  describe("SqliteNotificationRateLimiter", () => {
    it("returns false when no previous notification exists", () => {
      const limiter = new SqliteNotificationRateLimiter({
        getLastNotification: () => null,
      });
      expect(limiter.isCooldownActive("s1", "s1", "log", "critical", DEFAULT_NOTIFICATION_COOLDOWN_MS)).toBe(false);
    });

    it("returns true when within cooldown", () => {
      const now = new Date().toISOString();
      const limiter = new SqliteNotificationRateLimiter({
        getLastNotification: () => ({ health_status: "critical", occurred_at: now }),
      });
      expect(limiter.isCooldownActive("s1", "s1", "log", "critical", DEFAULT_NOTIFICATION_COOLDOWN_MS)).toBe(true);
    });

    it("returns false when cooldown expired", () => {
      const old = new Date(Date.now() - DEFAULT_NOTIFICATION_COOLDOWN_MS - 1000).toISOString();
      const limiter = new SqliteNotificationRateLimiter({
        getLastNotification: () => ({ health_status: "critical", occurred_at: old }),
      });
      expect(limiter.isCooldownActive("s1", "s1", "log", "critical", DEFAULT_NOTIFICATION_COOLDOWN_MS)).toBe(false);
    });
  });

  describe("DefaultNotificationEmitter", () => {
    it("emits through adapter when not in cooldown", async () => {
      const adapter: import("../../src/notification.js").NotificationAdapter = {
        channel: "test",
        emit: vi.fn().mockResolvedValue(undefined),
      };
      const limiter: import("../../src/notification.js").NotificationRateLimiter = {
        isCooldownActive: () => false,
        recordSent: vi.fn(),
      };
      const emitter = new DefaultNotificationEmitter([adapter], limiter);
      const notification = {
        site_id: "s1",
        scope_id: "s1",
        severity: "critical" as const,
        health_status: "critical" as const,
        summary: "test",
        detail: "detail",
        suggested_action: "act",
        occurred_at: "2026-04-21T12:00:00Z",
        cooldown_until: "2026-04-21T12:15:00Z",
      };
      await emitter.emit(notification);
      expect(adapter.emit).toHaveBeenCalledWith(notification);
      expect(limiter.recordSent).toHaveBeenCalled();
    });

    it("suppresses when cooldown is active", async () => {
      const adapter: import("../../src/notification.js").NotificationAdapter = {
        channel: "test",
        emit: vi.fn().mockResolvedValue(undefined),
      };
      const limiter: import("../../src/notification.js").NotificationRateLimiter = {
        isCooldownActive: () => true,
        recordSent: vi.fn(),
      };
      const emitter = new DefaultNotificationEmitter([adapter], limiter);
      const notification = {
        site_id: "s1",
        scope_id: "s1",
        severity: "critical" as const,
        health_status: "critical" as const,
        summary: "test",
        detail: "detail",
        suggested_action: "act",
        occurred_at: "2026-04-21T12:00:00Z",
        cooldown_until: "2026-04-21T12:15:00Z",
      };
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await emitter.emit(notification);
      expect(adapter.emit).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe("notifyOperator", () => {
    it("does nothing for healthy status", async () => {
      const coordinator = {
        getLastNotification: vi.fn().mockReturnValue(null),
        recordNotification: vi.fn(),
      };
      const adapter = {
        channel: "test",
        emit: vi.fn().mockResolvedValue(undefined),
      };
      await notifyOperator("s1", "s1", "healthy", coordinator, [adapter]);
      expect(adapter.emit).not.toHaveBeenCalled();
    });

    it("emits for critical status", async () => {
      const coordinator = {
        getLastNotification: vi.fn().mockReturnValue(null),
        recordNotification: vi.fn(),
      };
      const adapter = {
        channel: "test",
        emit: vi.fn().mockResolvedValue(undefined),
      };
      await notifyOperator("s1", "s1", "critical", coordinator, [adapter]);
      expect(adapter.emit).toHaveBeenCalled();
      expect(coordinator.recordNotification).toHaveBeenCalled();
    });

    it("emits for auth_failed status", async () => {
      const coordinator = {
        getLastNotification: vi.fn().mockReturnValue(null),
        recordNotification: vi.fn(),
      };
      const adapter = {
        channel: "test",
        emit: vi.fn().mockResolvedValue(undefined),
      };
      await notifyOperator("s1", "s1", "auth_failed", coordinator, [adapter]);
      expect(adapter.emit).toHaveBeenCalled();
      const notification = adapter.emit.mock.calls[0][0];
      expect(notification.health_status).toBe("auth_failed");
    });

    it("rate-limits repeated notifications", async () => {
      const now = new Date().toISOString();
      const coordinator = {
        getLastNotification: vi.fn().mockReturnValue({ health_status: "critical", occurred_at: now }),
        recordNotification: vi.fn(),
      };
      const adapter = {
        channel: "test",
        emit: vi.fn().mockResolvedValue(undefined),
      };
      await notifyOperator("s1", "s1", "critical", coordinator, [adapter]);
      expect(adapter.emit).not.toHaveBeenCalled();
    });
  });

  describe("NullNotificationEmitter", () => {
    it("does nothing silently", async () => {
      const emitter = new NullNotificationEmitter();
      await emitter.emit({
        site_id: "s1",
        scope_id: "s1",
        severity: "critical",
        health_status: "critical",
        summary: "test",
        detail: "detail",
        suggested_action: "act",
        occurred_at: "2026-04-21T12:00:00Z",
        cooldown_until: "2026-04-21T12:15:00Z",
      });
      expect(true).toBe(true);
    });
  });
});
