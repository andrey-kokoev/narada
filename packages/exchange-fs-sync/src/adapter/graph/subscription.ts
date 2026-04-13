/**
 * Microsoft Graph Subscription Management
 * 
 * Handles webhook subscription lifecycle:
 * - Create subscriptions for mailbox change notifications
 * - Renew subscriptions before expiration
 * - Delete subscriptions on cleanup
 * - Auto-renewal with configurable intervals
 */

import type { GraphHttpClient } from "./client.js";
import { withRetry, type RetryConfig } from "../../retry.js";

/** Maximum subscription expiration time (4230 minutes ≈ 3 days as per Graph API limits) */
export const MAX_SUBSCRIPTION_EXPIRATION_MINUTES = 4230;

/** Default expiration time (24 hours) */
export const DEFAULT_SUBSCRIPTION_EXPIRATION_MINUTES = 1440;

/** Minimum time before expiration to trigger renewal (5 minutes buffer) */
export const RENEWAL_BUFFER_MINUTES = 5;

/**
 * Types of changes that can trigger notifications
 */
export type ChangeType = "created" | "updated" | "deleted";

/**
 * Lifecycle events for subscription management
 */
export type LifecycleEvent = 
  | "subscriptionRemoved" 
  | "reauthorizationRequired" 
  | "missed" 
  | "renewalRequired";

/**
 * Configuration for creating a subscription
 */
export interface SubscriptionConfig {
  /** Types of changes to monitor */
  changeTypes: ChangeType[];
  
  /** HTTPS URL to receive notifications */
  notificationUrl: string;
  
  /** Optional HTTPS URL for lifecycle notifications */
  lifecycleNotificationUrl?: string;
  
  /** Subscription expiration in minutes (max 4230) */
  expirationMinutes: number;
  
  /** Client state for validation (max 128 chars) */
  clientState?: string;
  
  /** Include resource data in notifications (requires encryption) */
  includeResourceData?: boolean;
}

/**
 * Graph API subscription resource
 */
export interface Subscription {
  /** Unique subscription ID */
  id: string;
  
  /** Resource being monitored (e.g., "me/mailFolders('inbox')/messages") */
  resource: string;
  
  /** Application ID that created the subscription */
  applicationId: string;
  
  /** Notification endpoint URL */
  notificationUrl: string;
  
  /** Lifecycle notification URL */
  lifecycleNotificationUrl?: string;
  
  /** Types of changes being monitored */
  changeTypes: ChangeType[];
  
  /** Client state for validation */
  clientState: string | null;
  
  /** Subscription expiration timestamp */
  expirationDateTime: string;
  
  /** Creator's user ID */
  creatorId: string;
  
  /** Include resource data flag */
  includeResourceData?: boolean;
  
  /** Encryption key (when includeResourceData is true) */
  encryptionKey?: string;
  
  /** Encryption key ID */
  encryptionKeyId?: string;
}

/**
 * Notification payload received from Graph
 */
export interface Notification {
  /** Subscription ID */
  subscriptionId: string;
  
  /** Client state for validation */
  clientState: string | null;
  
  /** Change type that triggered notification */
  changeType: ChangeType;
  
  /** OData resource identifier (e.g., "Users('id')/Messages('id')") */
  resource: string;
  
  /** Resource URL for fetching full data */
  resourceData?: {
    /** Message ID */
    id: string;
    /** OData type */
    "@odata.type": string;
    /** OData ID */
    "@odata.id": string;
    /** OData edit link */
    "@odata.editLink": string;
  };
  
  /** Subscription expiration timestamp */
  subscriptionExpirationDateTime: string;
  
  /** Tenant ID */
  tenantId: string;
}

/**
 * Lifecycle notification payload
 */
export interface LifecycleNotification {
  /** Subscription ID */
  subscriptionId: string;
  
  /** Client state for validation */
  clientState: string | null;
  
  /** Type of lifecycle event */
  lifecycleEvent: LifecycleEvent;
  
  /** Resource being monitored */
  resource: string;
  
  /** Organization ID */
  organizationId: {
    /** Tenant ID */
    id: string;
    /** Tenant name */
    name: string;
  };
  
  /** Subscription expiration timestamp */
  subscriptionExpirationDateTime: string;
  
  /** Tenant ID */
  tenantId: string;
}

/**
 * Union type for all notification types
 */
export type GraphNotification = Notification | LifecycleNotification;

/**
 * Result of creating a subscription
 */
export interface CreateSubscriptionResult {
  subscription: Subscription;
  /** Time when renewal should happen */
  renewalTime: Date;
}

/**
 * Manages Microsoft Graph webhook subscriptions
 */
export class GraphSubscriptionManager {
  private readonly client: GraphHttpClient;
  private readonly userId: string;
  private readonly folderId: string;
  private readonly config: SubscriptionConfig;
  private readonly retryConfig?: Partial<RetryConfig>;
  
  /** Map of subscription IDs to renewal timers */
  private renewalTimers = new Map<string, NodeJS.Timeout>();
  
  /** Flag to track if auto-renewal is active */
  private autoRenewalActive = false;

  constructor(
    client: GraphHttpClient,
    userId: string,
    folderId: string,
    config: SubscriptionConfig,
    retryConfig?: Partial<RetryConfig>
  ) {
    this.client = client;
    this.userId = userId;
    this.folderId = folderId;
    this.config = this.validateConfig(config);
    this.retryConfig = retryConfig;
  }

  /**
   * Validate and normalize subscription configuration
   */
  private validateConfig(config: SubscriptionConfig): SubscriptionConfig {
    const expirationMinutes = Math.min(
      Math.max(1, config.expirationMinutes),
      MAX_SUBSCRIPTION_EXPIRATION_MINUTES
    );

    // Client state max 128 characters
    let clientState = config.clientState;
    if (clientState && clientState.length > 128) {
      clientState = clientState.slice(0, 128);
    }

    // Ensure at least one change type
    const changeTypes: ChangeType[] = config.changeTypes.length > 0 
      ? config.changeTypes 
      : ["created", "updated", "deleted"];

    return {
      ...config,
      expirationMinutes,
      clientState,
      changeTypes,
    };
  }

  /**
   * Build the resource path for the subscription
   */
  private buildResource(): string {
    // Use me/mailFolders/{id}/messages for current user's mailbox
    if (this.userId === "me") {
      return `me/mailFolders('${this.folderId}')/messages`;
    }
    return `users('${this.userId}')/mailFolders('${this.folderId}')/messages`;
  }

  /**
   * Create a new subscription
   */
  async create(): Promise<CreateSubscriptionResult> {
    const resource = this.buildResource();
    const expirationDateTime = this.calculateExpiration();

    const body = {
      changeType: this.config.changeTypes.join(","),
      notificationUrl: this.config.notificationUrl,
      lifecycleNotificationUrl: this.config.lifecycleNotificationUrl,
      resource,
      expirationDateTime: expirationDateTime.toISOString(),
      clientState: this.config.clientState,
      includeResourceData: this.config.includeResourceData,
    };

    const subscription = await withRetry(
      async () => this.requestSubscription("POST", "/subscriptions", body),
      this.retryConfig,
      "subscription:create"
    );

    const renewalTime = this.calculateRenewalTime(subscription.expirationDateTime);

    return {
      subscription,
      renewalTime,
    };
  }

  /**
   * Renew an existing subscription
   */
  async renew(subscriptionId: string): Promise<Subscription> {
    const expirationDateTime = this.calculateExpiration();

    const body = {
      expirationDateTime: expirationDateTime.toISOString(),
    };

    return withRetry(
      async () => this.requestSubscription(
        "PATCH", 
        `/subscriptions/${encodeURIComponent(subscriptionId)}`, 
        body
      ),
      this.retryConfig,
      "subscription:renew"
    );
  }

  /**
   * Delete a subscription
   */
  async delete(subscriptionId: string): Promise<void> {
    await withRetry(
      async () => {
        const token = await this.getAccessToken();
        const response = await fetch(
          `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subscriptionId)}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok && response.status !== 404) {
          throw new Error(`Failed to delete subscription: ${response.status}`);
        }
      },
      this.retryConfig,
      "subscription:delete"
    );

    // Clear any pending renewal timer
    this.clearRenewalTimer(subscriptionId);
  }

  /**
   * List all subscriptions for this app
   */
  async list(): Promise<Subscription[]> {
    return withRetry(
      async () => {
        const token = await this.getAccessToken();
        const response = await fetch(
          "https://graph.microsoft.com/v1.0/subscriptions",
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to list subscriptions: ${response.status}`);
        }

        const data = await response.json() as { value: Subscription[] };
        return data.value;
      },
      this.retryConfig,
      "subscription:list"
    );
  }

  /**
   * Get a specific subscription
   */
  async get(subscriptionId: string): Promise<Subscription | null> {
    return withRetry(
      async () => {
        const token = await this.getAccessToken();
        const response = await fetch(
          `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subscriptionId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          }
        );

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new Error(`Failed to get subscription: ${response.status}`);
        }

        return await response.json() as Subscription;
      },
      this.retryConfig,
      "subscription:get"
    );
  }

  /**
   * Set up automatic renewal for a subscription
   */
  async setupAutoRenewal(
    subscription: Subscription,
    onRenew: (sub: Subscription) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    const renewalTime = this.calculateRenewalTime(subscription.expirationDateTime);
    const delayMs = renewalTime.getTime() - Date.now();

    // Don't schedule if already expired
    if (delayMs <= 0) {
      onError?.(new Error(`Subscription ${subscription.id} already expired`));
      return;
    }

    this.clearRenewalTimer(subscription.id);
    this.autoRenewalActive = true;

    const timer = setTimeout(async () => {
      try {
        const renewed = await this.renew(subscription.id);
        onRenew(renewed);
        
        // Schedule next renewal
        await this.setupAutoRenewal(renewed, onRenew, onError);
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }, delayMs);

    this.renewalTimers.set(subscription.id, timer);
  }

  /**
   * Stop all auto-renewal timers
   */
  stopAllRenewals(): void {
    this.autoRenewalActive = false;
    for (const [id, timer] of this.renewalTimers) {
      clearTimeout(timer);
      this.renewalTimers.delete(id);
    }
  }

  /**
   * Check if auto-renewal is currently active
   */
  isAutoRenewalActive(): boolean {
    return this.autoRenewalActive;
  }

  /**
   * Get IDs of subscriptions with active renewal timers
   */
  getMonitoredSubscriptionIds(): string[] {
    return Array.from(this.renewalTimers.keys());
  }

  /**
   * Calculate expiration timestamp
   */
  private calculateExpiration(): Date {
    const now = new Date();
    return new Date(
      now.getTime() + this.config.expirationMinutes * 60 * 1000
    );
  }

  /**
   * Calculate when renewal should happen (before expiration)
   */
  private calculateRenewalTime(expirationDateTime: string): Date {
    const expiration = new Date(expirationDateTime);
    const bufferMs = RENEWAL_BUFFER_MINUTES * 60 * 1000;
    return new Date(expiration.getTime() - bufferMs);
  }

  /**
   * Clear renewal timer for a specific subscription
   */
  private clearRenewalTimer(subscriptionId: string): void {
    const timer = this.renewalTimers.get(subscriptionId);
    if (timer) {
      clearTimeout(timer);
      this.renewalTimers.delete(subscriptionId);
    }
  }

  /**
   * Get access token from the HTTP client
   */
  private async getAccessToken(): Promise<string> {
    return this.client.getTokenProvider().getAccessToken();
  }

  /**
   * Make a subscription API request
   */
  private async requestSubscription(
    method: string,
    path: string,
    body?: unknown
  ): Promise<Subscription> {
    const token = await this.getAccessToken();
    const url = `https://graph.microsoft.com/v1.0${path}`;
    
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Subscription request failed (${response.status}): ${text.slice(0, 200)}`);
    }

    return await response.json() as Subscription;
  }
}

/**
 * Extract message ID from a Graph resource string
 * Handles formats like:
 * - "Users('user-id')/Messages('msg-id')"
 * - "me/messages('msg-id')"
 * - "me/mailFolders('folder-id')/messages('msg-id')"
 */
export function extractMessageId(resource: string): string | null {
  // Match message ID from various resource patterns
  const patterns = [
    /Messages\(['"]([^'"]+)['"]\)/i,
    /messages\(['"]([^'"]+)['"]\)/i,
  ];

  for (const pattern of patterns) {
    const match = resource.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Check if a notification is a lifecycle notification
 */
export function isLifecycleNotification(
  notification: GraphNotification
): notification is LifecycleNotification {
  return "lifecycleEvent" in notification;
}

/**
 * Check if a notification is a change notification
 */
export function isChangeNotification(
  notification: GraphNotification
): notification is Notification {
  return "changeType" in notification && !("lifecycleEvent" in notification);
}

/**
 * Validate client state matches expected value
 */
export function validateClientState(
  received: string | null,
  expected: string | null
): boolean {
  // If no expected state, accept any (though this is not recommended)
  if (expected === null || expected === undefined) {
    return true;
  }
  return received === expected;
}
