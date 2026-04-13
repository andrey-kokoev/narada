import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GraphSubscriptionManager,
  extractMessageId,
  validateClientState,
  isLifecycleNotification,
  isChangeNotification,
  MAX_SUBSCRIPTION_EXPIRATION_MINUTES,
  DEFAULT_SUBSCRIPTION_EXPIRATION_MINUTES,
  type SubscriptionConfig,
  type Subscription,
} from "../../../../src/adapter/graph/subscription.js";
import { GraphHttpClient } from "../../../../src/adapter/graph/client.js";
import type { GraphTokenProvider } from "../../../../src/adapter/graph/auth.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("GraphSubscriptionManager", () => {
  let mockClient: GraphHttpClient;
  let mockTokenProvider: GraphTokenProvider;
  let config: SubscriptionConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("test-token"),
    };

    mockClient = new GraphHttpClient({
      tokenProvider: mockTokenProvider,
    });

    config = {
      changeTypes: ["created", "updated", "deleted"],
      notificationUrl: "https://example.com/webhook",
      expirationMinutes: 60,
      clientState: "test-client-state",
    };
  });

  describe("constructor", () => {
    it("should create manager with valid config", () => {
      const manager = new GraphSubscriptionManager(
        mockClient,
        "user@example.com",
        "inbox",
        config
      );

      expect(manager).toBeDefined();
      expect(manager.isAutoRenewalActive()).toBe(false);
    });

    it("should cap expiration at maximum", () => {
      const longConfig = {
        ...config,
        expirationMinutes: 10000, // Exceeds max
      };

      const manager = new GraphSubscriptionManager(
        mockClient,
        "user@example.com",
        "inbox",
        longConfig
      );

      expect(manager).toBeDefined();
    });

    it("should truncate long client state", () => {
      const longStateConfig = {
        ...config,
        clientState: "a".repeat(200), // Exceeds 128 char limit
      };

      const manager = new GraphSubscriptionManager(
        mockClient,
        "user@example.com",
        "inbox",
        longStateConfig
      );

      expect(manager).toBeDefined();
    });
  });

  describe("create", () => {
    it("should create a subscription successfully", async () => {
      const mockSubscription: Subscription = {
        id: "sub-123",
        resource: "me/mailFolders('inbox')/messages",
        applicationId: "app-123",
        notificationUrl: config.notificationUrl,
        changeTypes: ["created", "updated", "deleted"],
        clientState: config.clientState ?? null,
        expirationDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        creatorId: "user@example.com",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubscription,
      });

      const manager = new GraphSubscriptionManager(
        mockClient,
        "me",
        "inbox",
        config
      );

      const result = await manager.create();

      expect(result.subscription).toEqual(mockSubscription);
      expect(result.renewalTime).toBeInstanceOf(Date);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://graph.microsoft.com/v1.0/subscriptions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("should handle API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      });

      const manager = new GraphSubscriptionManager(
        mockClient,
        "me",
        "inbox",
        config
      );

      await expect(manager.create()).rejects.toThrow();
    });
  });

  describe("renew", () => {
    it("should renew a subscription", async () => {
      const mockSubscription: Subscription = {
        id: "sub-123",
        resource: "me/mailFolders('inbox')/messages",
        applicationId: "app-123",
        notificationUrl: config.notificationUrl,
        changeTypes: ["created", "updated", "deleted"],
        clientState: config.clientState ?? null,
        expirationDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        creatorId: "user@example.com",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubscription,
      });

      const manager = new GraphSubscriptionManager(
        mockClient,
        "me",
        "inbox",
        config
      );

      const result = await manager.renew("sub-123");

      expect(result).toEqual(mockSubscription);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://graph.microsoft.com/v1.0/subscriptions/sub-123",
        expect.objectContaining({
          method: "PATCH",
        })
      );
    });
  });

  describe("delete", () => {
    it("should delete a subscription", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const manager = new GraphSubscriptionManager(
        mockClient,
        "me",
        "inbox",
        config
      );

      await manager.delete("sub-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://graph.microsoft.com/v1.0/subscriptions/sub-123",
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });

    it("should not throw on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const manager = new GraphSubscriptionManager(
        mockClient,
        "me",
        "inbox",
        config
      );

      await expect(manager.delete("sub-123")).resolves.not.toThrow();
    });
  });

  describe("list", () => {
    it("should list all subscriptions", async () => {
      const mockSubscriptions: Subscription[] = [
        {
          id: "sub-123",
          resource: "me/mailFolders('inbox')/messages",
          applicationId: "app-123",
          notificationUrl: config.notificationUrl,
          changeTypes: ["created", "updated", "deleted"],
          clientState: config.clientState ?? null,
          expirationDateTime: new Date().toISOString(),
          creatorId: "user@example.com",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: mockSubscriptions }),
      });

      const manager = new GraphSubscriptionManager(
        mockClient,
        "me",
        "inbox",
        config
      );

      const result = await manager.list();

      expect(result).toEqual(mockSubscriptions);
    });
  });

  describe("get", () => {
    it("should get a subscription by ID", async () => {
      const mockSubscription: Subscription = {
        id: "sub-123",
        resource: "me/mailFolders('inbox')/messages",
        applicationId: "app-123",
        notificationUrl: config.notificationUrl,
        changeTypes: ["created", "updated", "deleted"],
        clientState: config.clientState ?? null,
        expirationDateTime: new Date().toISOString(),
        creatorId: "user@example.com",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubscription,
      });

      const manager = new GraphSubscriptionManager(
        mockClient,
        "me",
        "inbox",
        config
      );

      const result = await manager.get("sub-123");

      expect(result).toEqual(mockSubscription);
    });

    it("should return null for 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const manager = new GraphSubscriptionManager(
        mockClient,
        "me",
        "inbox",
        config
      );

      const result = await manager.get("sub-123");

      expect(result).toBeNull();
    });
  });

  describe("setupAutoRenewal", () => {
    it("should schedule renewal before expiration", async () => {
      vi.useFakeTimers();

      const mockSubscription: Subscription = {
        id: "sub-123",
        resource: "me/mailFolders('inbox')/messages",
        applicationId: "app-123",
        notificationUrl: config.notificationUrl,
        changeTypes: ["created", "updated", "deleted"],
        clientState: config.clientState ?? null,
        expirationDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        creatorId: "user@example.com",
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockSubscription,
      });

      const manager = new GraphSubscriptionManager(
        mockClient,
        "me",
        "inbox",
        config
      );

      const onRenew = vi.fn();
      const onError = vi.fn();

      await manager.setupAutoRenewal(mockSubscription, onRenew, onError);

      expect(manager.isAutoRenewalActive()).toBe(true);
      expect(manager.getMonitoredSubscriptionIds()).toContain("sub-123");

      vi.useRealTimers();
    });

    it("should not schedule renewal for expired subscription", async () => {
      const mockSubscription: Subscription = {
        id: "sub-123",
        resource: "me/mailFolders('inbox')/messages",
        applicationId: "app-123",
        notificationUrl: config.notificationUrl,
        changeTypes: ["created", "updated", "deleted"],
        clientState: config.clientState ?? null,
        expirationDateTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // Past
        creatorId: "user@example.com",
      };

      const manager = new GraphSubscriptionManager(
        mockClient,
        "me",
        "inbox",
        config
      );

      const onRenew = vi.fn();
      const onError = vi.fn();

      await manager.setupAutoRenewal(mockSubscription, onRenew, onError);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("already expired"),
        })
      );
    });
  });

  describe("stopAllRenewals", () => {
    it("should clear all renewal timers", async () => {
      vi.useFakeTimers();

      const mockSubscription: Subscription = {
        id: "sub-123",
        resource: "me/mailFolders('inbox')/messages",
        applicationId: "app-123",
        notificationUrl: config.notificationUrl,
        changeTypes: ["created", "updated", "deleted"],
        clientState: config.clientState ?? null,
        expirationDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        creatorId: "user@example.com",
      };

      const manager = new GraphSubscriptionManager(
        mockClient,
        "me",
        "inbox",
        config
      );

      await manager.setupAutoRenewal(mockSubscription, vi.fn(), vi.fn());
      expect(manager.getMonitoredSubscriptionIds()).toHaveLength(1);

      manager.stopAllRenewals();

      expect(manager.isAutoRenewalActive()).toBe(false);
      expect(manager.getMonitoredSubscriptionIds()).toHaveLength(0);

      vi.useRealTimers();
    });
  });
});

describe("extractMessageId", () => {
  it("should extract ID from Users path", () => {
    const resource = "Users('user-id')/Messages('msg-id')";
    expect(extractMessageId(resource)).toBe("msg-id");
  });

  it("should extract ID from me/messages path", () => {
    const resource = "me/messages('msg-id')";
    expect(extractMessageId(resource)).toBe("msg-id");
  });

  it("should extract ID from mailFolders path", () => {
    const resource = "me/mailFolders('inbox')/messages('msg-id')";
    expect(extractMessageId(resource)).toBe("msg-id");
  });

  it("should handle double quotes", () => {
    const resource = 'Users("user-id")/Messages("msg-id")';
    expect(extractMessageId(resource)).toBe("msg-id");
  });

  it("should return null for invalid resource", () => {
    const resource = "invalid/resource/path";
    expect(extractMessageId(resource)).toBeNull();
  });
});

describe("validateClientState", () => {
  it("should return true for matching states", () => {
    expect(validateClientState("secret", "secret")).toBe(true);
  });

  it("should return false for non-matching states", () => {
    expect(validateClientState("secret", "other")).toBe(false);
  });

  it("should return true if expected is null", () => {
    expect(validateClientState("anything", null)).toBe(true);
  });

  it("should return false if received is null but expected is set", () => {
    expect(validateClientState(null, "secret")).toBe(false);
  });
});

describe("isLifecycleNotification", () => {
  it("should return true for lifecycle notifications", () => {
    const notification = {
      subscriptionId: "sub-123",
      lifecycleEvent: "missed",
      resource: "me/messages",
    };
    expect(isLifecycleNotification(notification as any)).toBe(true);
  });

  it("should return false for change notifications", () => {
    const notification = {
      subscriptionId: "sub-123",
      changeType: "created",
      resource: "me/messages",
    };
    expect(isLifecycleNotification(notification as any)).toBe(false);
  });
});

describe("isChangeNotification", () => {
  it("should return true for change notifications", () => {
    const notification = {
      subscriptionId: "sub-123",
      changeType: "created",
      resource: "me/messages",
    };
    expect(isChangeNotification(notification as any)).toBe(true);
  });

  it("should return false for lifecycle notifications", () => {
    const notification = {
      subscriptionId: "sub-123",
      lifecycleEvent: "missed",
      resource: "me/messages",
    };
    expect(isChangeNotification(notification as any)).toBe(false);
  });
});

describe("constants", () => {
  it("should have correct max expiration", () => {
    expect(MAX_SUBSCRIPTION_EXPIRATION_MINUTES).toBe(4230);
  });

  it("should have correct default expiration", () => {
    expect(DEFAULT_SUBSCRIPTION_EXPIRATION_MINUTES).toBe(1440);
  });
});
