/**
 * Hybrid sync scheduler with webhook and polling support
 * 
 * Combines real-time webhook notifications with fallback polling:
 * - webhook: Only use webhooks, no polling (except as failsafe)
 * - poll: Traditional polling mode
 * - hybrid: Use webhooks with polling fallback
 */

import type {
  GraphSubscriptionManager,
  Subscription,
  ChangeType,
} from "@narada2/exchange-fs-sync";
import type {
  WebhookServer,
  WebhookServerConfig,
  WebhookCallbacks,
  ParsedNotification,
} from "./webhook-server.js";
import type { NotificationHandler } from "./notification-handler.js";
import type { LifecycleHandler } from "./lifecycle-handler.js";
import { createLogger, type Logger } from "./lib/logger.js";

/**
 * Sync scheduler configuration
 */
export interface SyncSchedulerConfig {
  /** Sync mode */
  mode: "webhook" | "poll" | "hybrid";
  
  /** Polling interval in minutes (for poll/hybrid modes) */
  pollIntervalMinutes: number;
  
  /** Webhook timeout before falling back to polling (minutes) */
  webhookTimeoutMinutes: number;
  
  /** Enable automatic delta sync on missed notifications */
  autoDeltaSync?: boolean;
  
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  /** Server configuration */
  server: Omit<WebhookServerConfig, "validation"> & {
    /** Client state secret */
    clientState: string;
    /** Optional HMAC secret */
    hmacSecret?: string;
  };
  
  /** Subscription configuration */
  subscription: {
    /** Public URL for notifications */
    notificationUrl: string;
    /** Optional lifecycle URL */
    lifecycleNotificationUrl?: string;
    /** Subscription expiration in minutes */
    expirationMinutes: number;
    /** Auto-renew subscriptions */
    autoRenew: boolean;
    /** Change types to monitor */
    changeTypes: ChangeType[];
  };
}

/**
 * Sync function signature
 */
export type SyncFunction = () => Promise<SyncResult>;

/**
 * Delta sync function for missed notifications
 */
export type DeltaSyncFunction = (subscriptionId: string) => Promise<SyncResult>;

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  eventsProcessed?: number;
  error?: string;
}

/**
 * Scheduler statistics
 */
export interface SchedulerStats {
  /** Current mode */
  mode: "webhook" | "poll";
  
  /** Last webhook received timestamp */
  lastWebhookReceived: Date | null;
  
  /** Last sync timestamp */
  lastSyncAt: Date | null;
  
  /** Number of webhooks received */
  webhooksReceived: number;
  
  /** Number of polls executed */
  pollsExecuted: number;
  
  /** Number of syncs triggered by webhooks */
  syncsFromWebhooks: number;
  
  /** Number of syncs triggered by polling */
  syncsFromPolling: number;
  
  /** Current subscription ID */
  subscriptionId: string | null;
  
  /** Whether subscription is active */
  subscriptionActive: boolean;
}

/**
 * Hybrid sync scheduler interface
 */
export interface HybridSyncScheduler {
  /** Start the scheduler */
  start(): Promise<void>;
  
  /** Stop the scheduler */
  stop(): Promise<void>;
  
  /** Check if scheduler is running */
  isRunning(): boolean;
  
  /** Get current statistics */
  getStats(): SchedulerStats;
  
  /** Force a sync now */
  triggerSync(): Promise<SyncResult>;
  
  /** Force a delta sync (for missed notifications) */
  triggerDeltaSync(subscriptionId?: string): Promise<SyncResult>;
}

/**
 * Dependencies for the scheduler
 */
export interface SchedulerDependencies {
  /** Subscription manager */
  subscriptionManager: GraphSubscriptionManager;
  
  /** Webhook server factory */
  createWebhookServer: (config: WebhookServerConfig, callbacks: WebhookCallbacks) => WebhookServer;
  
  /** Notification handler */
  notificationHandler: NotificationHandler;
  
  /** Lifecycle handler */
  lifecycleHandler: LifecycleHandler;
  
  /** Sync function for full sync */
  sync: SyncFunction;
  
  /** Delta sync function for missed notifications */
  deltaSync?: DeltaSyncFunction;
}

/**
 * Hybrid sync scheduler implementation
 */
export class DefaultHybridSyncScheduler implements HybridSyncScheduler {
  private readonly config: SyncSchedulerConfig;
  private readonly webhookConfig: WebhookConfig;
  private readonly deps: SchedulerDependencies;
  private readonly logger: Logger;
  
  private running = false;
  private webhookServer: WebhookServer | null = null;
  private subscription: Subscription | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private fallbackTimer: NodeJS.Timeout | null = null;
  
  private stats: SchedulerStats = {
    mode: "poll",
    lastWebhookReceived: null,
    lastSyncAt: null,
    webhooksReceived: 0,
    pollsExecuted: 0,
    syncsFromWebhooks: 0,
    syncsFromPolling: 0,
    subscriptionId: null,
    subscriptionActive: false,
  };

  constructor(
    config: SyncSchedulerConfig,
    webhookConfig: WebhookConfig,
    deps: SchedulerDependencies
  ) {
    this.config = config;
    this.webhookConfig = webhookConfig;
    this.deps = deps;
    this.logger = createLogger({
      component: "sync-scheduler",
      verbose: config.verbose,
    });
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error("Scheduler already running");
    }

    this.logger.info("Starting sync scheduler", {
      mode: this.config.mode,
      pollIntervalMinutes: this.config.pollIntervalMinutes,
    });

    this.running = true;

    // Start webhook mode if configured
    if (this.config.mode === "webhook" || this.config.mode === "hybrid") {
      await this.startWebhookMode();
    }

    // Start polling fallback
    if (this.config.mode === "poll" || this.config.mode === "hybrid") {
      this.startPollingFallback();
    }

    // Initial sync
    await this.triggerSync();
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.logger.info("Stopping sync scheduler");
    this.running = false;

    // Stop polling
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }

    // Stop auto-renewal
    this.deps.subscriptionManager.stopAllRenewals();

    // Delete subscription
    if (this.subscription) {
      try {
        await this.deps.subscriptionManager.delete(this.subscription.id);
        this.logger.debug("Subscription deleted", { id: this.subscription.id });
      } catch (error) {
        this.logger.warn("Failed to delete subscription", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.subscription = null;
    }

    // Stop webhook server
    if (this.webhookServer) {
      await this.webhookServer.stop();
      this.webhookServer = null;
    }

    this.stats.subscriptionActive = false;
    this.stats.subscriptionId = null;

    this.logger.info("Sync scheduler stopped");
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get current statistics
   */
  getStats(): SchedulerStats {
    return { ...this.stats };
  }

  /**
   * Trigger a sync immediately
   */
  async triggerSync(): Promise<SyncResult> {
    this.logger.debug("Triggering manual sync");
    return this.performSync("manual");
  }

  /**
   * Trigger a delta sync for missed notifications
   */
  async triggerDeltaSync(subscriptionId?: string): Promise<SyncResult> {
    this.logger.info("Triggering delta sync", { subscriptionId });

    if (this.deps.deltaSync) {
      const result = await this.deps.deltaSync(subscriptionId ?? this.stats.subscriptionId ?? "default");
      if (result.success) {
        this.stats.lastSyncAt = new Date();
      }
      return result;
    }

    // Fallback to regular sync if no delta sync function provided
    return this.performSync("delta");
  }

  /**
   * Start webhook mode
   */
  private async startWebhookMode(): Promise<void> {
    try {
      // Create and start webhook server
      const serverConfig: WebhookServerConfig = {
        ...this.webhookConfig.server,
        validation: {
          clientState: this.webhookConfig.server.clientState,
          hmacSecret: this.webhookConfig.server.hmacSecret,
        },
      };

      this.webhookServer = this.deps.createWebhookServer(serverConfig, {
        onNotification: (parsed) => this.handleNotification(parsed),
        onLifecycle: (parsed) => this.handleLifecycle(parsed),
        onValidationFailure: (_notification, error) => {
          this.logger.warn("Notification validation failed", { error });
        },
        onError: (error) => {
          this.logger.error("Webhook server error", error);
        },
      });

      await this.webhookServer.start();
      this.logger.info("Webhook server started", {
        url: this.webhookServer.getUrl(),
      });

      // Create subscription
      const result = await this.deps.subscriptionManager.create();
      this.subscription = result.subscription;
      this.stats.subscriptionId = this.subscription.id;
      this.stats.subscriptionActive = true;
      this.stats.mode = "webhook";

      this.logger.info("Subscription created", {
        id: this.subscription.id,
        expires: this.subscription.expirationDateTime,
      });

      // Setup auto-renewal if enabled
      if (this.webhookConfig.subscription.autoRenew) {
        await this.deps.subscriptionManager.setupAutoRenewal(
          this.subscription,
          (renewed) => {
            this.logger.info("Subscription renewed", { id: renewed.id });
            this.subscription = renewed;
          },
          (error) => {
            this.logger.error("Subscription renewal failed", error);
          }
        );
      }
    } catch (error) {
      this.logger.error("Failed to start webhook mode", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Fall back to polling if webhook fails
      if (this.config.mode === "hybrid") {
        this.logger.info("Falling back to polling mode");
        this.stats.mode = "poll";
        this.startPollingFallback();
      } else {
        throw error;
      }
    }
  }

  /**
   * Start polling fallback
   */
  private startPollingFallback(): void {
    const intervalMs = this.config.pollIntervalMinutes * 60 * 1000;

    this.logger.debug("Starting polling fallback", {
      intervalMinutes: this.config.pollIntervalMinutes,
    });

    this.pollTimer = setInterval(async () => {
      if (!this.running) return;

      // In hybrid mode, only poll if no webhook received recently
      if (this.config.mode === "hybrid") {
        const sinceWebhook = this.stats.lastWebhookReceived
          ? Date.now() - this.stats.lastWebhookReceived.getTime()
          : Infinity;

        const timeoutMs = this.config.webhookTimeoutMinutes * 60 * 1000;

        if (sinceWebhook < timeoutMs * 2) {
          // Webhooks are working, skip this poll
          this.logger.debug("Skipping poll, webhooks active");
          return;
        }

        this.logger.info("No webhooks received, falling back to polling");
        this.stats.mode = "poll";
      }

      this.stats.pollsExecuted++;
      await this.performSync("poll");
    }, intervalMs);

    // Also check webhook health more frequently in hybrid mode
    if (this.config.mode === "hybrid") {
      const checkIntervalMs = Math.min(intervalMs / 4, 60000); // Every 15s or minute

      this.fallbackTimer = setInterval(() => {
        if (!this.running) return;

        const sinceWebhook = this.stats.lastWebhookReceived
          ? Date.now() - this.stats.lastWebhookReceived.getTime()
          : Infinity;

        const timeoutMs = this.config.webhookTimeoutMinutes * 60 * 1000;

        if (sinceWebhook > timeoutMs * 2 && this.stats.mode === "webhook") {
          this.logger.warn("Webhooks appear stale, switching to polling mode");
          this.stats.mode = "poll";
        }
      }, checkIntervalMs);
    }
  }

  /**
   * Handle a notification from the webhook server
   */
  private async handleNotification(parsed: ParsedNotification): Promise<void> {
    this.stats.webhooksReceived++;
    this.stats.lastWebhookReceived = new Date();

    // Switch back to webhook mode if we were polling
    if (this.stats.mode === "poll") {
      this.logger.info("Webhooks received, switching to webhook mode");
      this.stats.mode = "webhook";
    }

    // Process the notification
    const result = await this.deps.notificationHandler.handle(parsed);

    if (result.success) {
      this.stats.syncsFromWebhooks++;
      this.stats.lastSyncAt = new Date();

      this.logger.debug("Notification processed", {
        action: result.action,
        messageId: result.messageId,
        durationMs: result.durationMs,
      });
    } else {
      this.logger.warn("Failed to process notification", {
        error: result.error,
        action: result.action,
      });
    }
  }

  /**
   * Handle a lifecycle notification
   */
  private async handleLifecycle(parsed: ParsedNotification): Promise<void> {
    this.stats.webhooksReceived++;
    this.stats.lastWebhookReceived = new Date();

    const result = await this.deps.lifecycleHandler.handle(parsed);

    if (result.success) {
      this.logger.info("Lifecycle event handled", {
        event: result.event,
        action: result.action,
      });

      // Handle specific actions
      switch (result.action) {
        case "delta_sync":
          await this.triggerDeltaSync();
          break;
        case "recreated":
          // Subscription was recreated, update our reference
          const updated = await this.deps.subscriptionManager.get(
            this.stats.subscriptionId ?? ""
          );
          if (updated) {
            this.subscription = updated;
          }
          break;
      }
    } else {
      this.logger.error("Failed to handle lifecycle event", {
        event: result.event,
        error: result.error,
      });
    }
  }

  /**
   * Perform a sync operation
   */
  private async performSync(trigger: "webhook" | "poll" | "manual" | "delta"): Promise<SyncResult> {
    try {
      const result = await this.deps.sync();

      if (result.success) {
        this.stats.lastSyncAt = new Date();

        if (trigger === "poll") {
          this.stats.syncsFromPolling++;
        } else if (trigger === "webhook") {
          this.stats.syncsFromWebhooks++;
        }

        this.logger.debug("Sync completed", {
          trigger,
          eventsProcessed: result.eventsProcessed,
        });
      } else {
        this.logger.warn("Sync failed", {
          trigger,
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error("Sync error", { trigger, error: errorMsg });

      return {
        success: false,
        error: errorMsg,
      };
    }
  }
}

/**
 * Create a hybrid sync scheduler
 */
export function createHybridSyncScheduler(
  config: SyncSchedulerConfig,
  webhookConfig: WebhookConfig,
  deps: SchedulerDependencies
): HybridSyncScheduler {
  return new DefaultHybridSyncScheduler(config, webhookConfig, deps);
}
