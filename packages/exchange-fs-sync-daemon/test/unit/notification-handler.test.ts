import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SyncOnNotification,
  BatchNotificationHandler,
  createNotificationHandler,
  type SingleMessageSync,
  type NotificationHandlerOptions,
} from "../../src/notification-handler.js";
import type { ParsedNotification } from "../../src/webhook-server.js";
import type { Notification, LifecycleNotification } from "@narada/exchange-fs-sync";

describe("SyncOnNotification", () => {
  let mockSync: SingleMessageSync;
  let handler: SyncOnNotification;

  beforeEach(() => {
    mockSync = {
      fetchMessage: vi.fn().mockResolvedValue({ id: "msg-123" }),
      storeMessage: vi.fn().mockResolvedValue(undefined),
      updateMessage: vi.fn().mockResolvedValue(undefined),
      tombstoneMessage: vi.fn().mockResolvedValue(undefined),
      messageExists: vi.fn().mockResolvedValue(false),
    };
    handler = new SyncOnNotification(mockSync);
  });

  it("should handle created notification", async () => {
    const parsed: ParsedNotification = {
      notification: {
        subscriptionId: "sub-123",
        clientState: null,
        changeType: "created",
        resource: "me/messages('msg-123')",
        subscriptionExpirationDateTime: new Date().toISOString(),
        tenantId: "tenant-123",
      } as Notification,
      rawBody: "{}",
      signature: null,
      validation: { valid: true },
    };

    const result = await handler.handle(parsed);

    expect(result.success).toBe(true);
    expect(result.action).toBe("created");
    expect(mockSync.fetchMessage).toHaveBeenCalledWith("msg-123");
    expect(mockSync.storeMessage).toHaveBeenCalled();
  });

  it("should handle updated notification", async () => {
    const parsed: ParsedNotification = {
      notification: {
        subscriptionId: "sub-123",
        clientState: null,
        changeType: "updated",
        resource: "me/messages('msg-123')",
        subscriptionExpirationDateTime: new Date().toISOString(),
        tenantId: "tenant-123",
      } as Notification,
      rawBody: "{}",
      signature: null,
      validation: { valid: true },
    };

    const result = await handler.handle(parsed);

    expect(result.success).toBe(true);
    expect(result.action).toBe("updated");
    expect(mockSync.updateMessage).toHaveBeenCalled();
  });

  it("should handle deleted notification", async () => {
    const parsed: ParsedNotification = {
      notification: {
        subscriptionId: "sub-123",
        clientState: null,
        changeType: "deleted",
        resource: "me/messages('msg-123')",
        subscriptionExpirationDateTime: new Date().toISOString(),
        tenantId: "tenant-123",
      } as Notification,
      rawBody: "{}",
      signature: null,
      validation: { valid: true },
    };

    const result = await handler.handle(parsed);

    expect(result.success).toBe(true);
    expect(result.action).toBe("deleted");
    expect(mockSync.tombstoneMessage).toHaveBeenCalledWith("msg-123");
  });

  it("should handle lifecycle notification", async () => {
    const parsed: ParsedNotification = {
      notification: {
        subscriptionId: "sub-123",
        clientState: null,
        lifecycleEvent: "missed",
        resource: "me/messages",
        subscriptionExpirationDateTime: new Date().toISOString(),
        organizationId: { id: "tenant-123", name: "Test" },
        tenantId: "tenant-123",
      } as LifecycleNotification,
      rawBody: "{}",
      signature: null,
      validation: { valid: true },
    };

    const result = await handler.handle(parsed);

    expect(result.success).toBe(true);
    expect(result.action).toBe("lifecycle");
  });

  it("should skip existing message on create if configured", async () => {
    mockSync.messageExists = vi.fn().mockResolvedValue(true);
    
    const handlerWithSkip = new SyncOnNotification(mockSync, {
      skipExistingOnCreate: true,
    });

    const parsed: ParsedNotification = {
      notification: {
        subscriptionId: "sub-123",
        clientState: null,
        changeType: "created",
        resource: "me/messages('msg-123')",
        subscriptionExpirationDateTime: new Date().toISOString(),
        tenantId: "tenant-123",
      } as Notification,
      rawBody: "{}",
      signature: null,
      validation: { valid: true },
    };

    const result = await handlerWithSkip.handle(parsed);

    expect(result.success).toBe(true);
    expect(result.action).toBe("skipped");
    expect(mockSync.fetchMessage).not.toHaveBeenCalled();
  });

  it("should return error for invalid resource", async () => {
    const parsed: ParsedNotification = {
      notification: {
        subscriptionId: "sub-123",
        clientState: null,
        changeType: "created",
        resource: "invalid/resource",
        subscriptionExpirationDateTime: new Date().toISOString(),
        tenantId: "tenant-123",
      } as Notification,
      rawBody: "{}",
      signature: null,
      validation: { valid: true },
    };

    const result = await handler.handle(parsed);

    expect(result.success).toBe(false);
    expect(result.action).toBe("failed");
  });
});

describe("createNotificationHandler", () => {
  it("should create SyncOnNotification without batching", () => {
    const mockSync: SingleMessageSync = {
      fetchMessage: vi.fn(),
      storeMessage: vi.fn(),
      updateMessage: vi.fn(),
      tombstoneMessage: vi.fn(),
      messageExists: vi.fn(),
    };

    const handler = createNotificationHandler(mockSync, { enableBatching: false });
    expect(handler).toBeDefined();
  });

  it("should create BatchNotificationHandler with batching", () => {
    const mockSync: SingleMessageSync = {
      fetchMessage: vi.fn(),
      storeMessage: vi.fn(),
      updateMessage: vi.fn(),
      tombstoneMessage: vi.fn(),
      messageExists: vi.fn(),
    };

    const handler = createNotificationHandler(mockSync, { enableBatching: true });
    expect(handler).toBeDefined();
  });
});
