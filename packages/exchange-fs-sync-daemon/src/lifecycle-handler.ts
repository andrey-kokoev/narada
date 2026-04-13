/**
 * Lifecycle notification handler
 * 
 * Handles subscription lifecycle events:
 * - subscriptionRemoved: Subscription expired or reached max renewals
 * - reauthorizationRequired: User revoked consent
 * - missed: Some notifications were missed, need delta sync
 * - renewalRequired: Subscription needs to be renewed
 */

import type { LifecycleNotification, LifecycleEvent } from "@narada/exchange-fs-sync";
import type { ParsedNotification } from "./webhook-server.js";
import { createLogger, type Logger } from "./lib/logger.js";

/**
 * Result of handling a lifecycle event
 */
export interface LifecycleResult {
  /** Whether handling was successful */
  success: boolean;
  
  /** The lifecycle event type */
  event: LifecycleEvent;
  
  /** Action taken */
  action: "recreated" | "reauthorized" | "delta_sync" | "renewed" | "ignored" | "failed";
  
  /** Error message if failed */
  error?: string;
}

/**
 * Callbacks for lifecycle events
 */
export interface LifecycleCallbacks {
  /** Subscription was removed - recreate it */
  onSubscriptionRemoved: (subscriptionId: string) => Promise<void>;
  
  /** Reauthorization is required - notify admin */
  onReauthorizationRequired: (subscriptionId: string) => Promise<void>;
  
  /** Notifications were missed - trigger delta sync */
  onMissedNotifications: (subscriptionId: string) => Promise<void>;
  
  /** Subscription renewal is required */
  onRenewalRequired?: (subscriptionId: string) => Promise<void>;
  
  /** Generic error handler */
  onError?: (error: Error, event: LifecycleEvent) => void;
}

/**
 * Options for lifecycle handler
 */
export interface LifecycleHandlerOptions {
  /** Enable verbose logging */
  verbose?: boolean;
  
  /** Automatically recreate removed subscriptions */
  autoRecreate?: boolean;
  
  /** Automatically trigger delta sync on missed notifications */
  autoDeltaSync?: boolean;
}

/**
 * Handles subscription lifecycle notifications
 */
export class LifecycleHandler {
  private readonly callbacks: LifecycleCallbacks;
  private readonly options: LifecycleHandlerOptions;
  private readonly logger: Logger;

  constructor(callbacks: LifecycleCallbacks, options: LifecycleHandlerOptions = {}) {
    this.callbacks = callbacks;
    this.options = {
      autoRecreate: true,
      autoDeltaSync: true,
      ...options,
    };
    this.logger = createLogger({
      component: "lifecycle-handler",
      verbose: options.verbose,
    });
  }

  /**
   * Handle a lifecycle notification
   */
  async handle(parsed: ParsedNotification): Promise<LifecycleResult> {
    const notification = parsed.notification as LifecycleNotification;
    const { lifecycleEvent, subscriptionId } = notification;

    this.logger.info("Received lifecycle notification", {
      event: lifecycleEvent,
      subscriptionId,
    });

    try {
      switch (lifecycleEvent) {
        case "subscriptionRemoved":
          return await this.handleSubscriptionRemoved(subscriptionId);
        case "reauthorizationRequired":
          return await this.handleReauthorizationRequired(subscriptionId);
        case "missed":
          return await this.handleMissedNotifications(subscriptionId);
        case "renewalRequired":
          return await this.handleRenewalRequired(subscriptionId);
        default:
          this.logger.warn("Unknown lifecycle event", { event: lifecycleEvent });
          return {
            success: true,
            event: lifecycleEvent,
            action: "ignored",
          };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to handle lifecycle event", {
        event: lifecycleEvent,
        subscriptionId,
        error: errorMsg,
      });

      if (this.callbacks.onError) {
        this.callbacks.onError(
          error instanceof Error ? error : new Error(errorMsg),
          lifecycleEvent
        );
      }

      return {
        success: false,
        event: lifecycleEvent,
        action: "failed",
        error: errorMsg,
      };
    }
  }

  /**
   * Handle subscriptionRemoved event
   * 
   * This occurs when:
   * - Subscription reached maximum allowed expiration time
   * - Subscription was manually deleted
   * - Resource was deleted
   * - Application was uninstalled
   */
  private async handleSubscriptionRemoved(
    subscriptionId: string
  ): Promise<LifecycleResult> {
    this.logger.warn("Subscription removed, recreating", { subscriptionId });

    if (!this.options.autoRecreate) {
      this.logger.info("Auto-recreate disabled, skipping");
      return {
        success: true,
        event: "subscriptionRemoved",
        action: "ignored",
      };
    }

    try {
      await this.callbacks.onSubscriptionRemoved(subscriptionId);

      this.logger.info("Subscription recreated successfully", { subscriptionId });
      return {
        success: true,
        event: "subscriptionRemoved",
        action: "recreated",
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to recreate subscription", {
        subscriptionId,
        error: errorMsg,
      });

      return {
        success: false,
        event: "subscriptionRemoved",
        action: "failed",
        error: errorMsg,
      };
    }
  }

  /**
   * Handle reauthorizationRequired event
   * 
   * This occurs when:
   * - User revoked consent for the application
   * - Admin revoked application permissions
   * - Password was reset
   */
  private async handleReauthorizationRequired(
    subscriptionId: string
  ): Promise<LifecycleResult> {
    this.logger.warn("Reauthorization required", { subscriptionId });

    try {
      await this.callbacks.onReauthorizationRequired(subscriptionId);

      return {
        success: true,
        event: "reauthorizationRequired",
        action: "reauthorized",
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to handle reauthorization", {
        subscriptionId,
        error: errorMsg,
      });

      return {
        success: false,
        event: "reauthorizationRequired",
        action: "failed",
        error: errorMsg,
      };
    }
  }

  /**
   * Handle missed event
   * 
   * This occurs when:
   * - Notifications couldn't be delivered (e.g., webhook endpoint down)
   * - Too many notifications to deliver in one payload
   * - Service degradation
   */
  private async handleMissedNotifications(
    subscriptionId: string
  ): Promise<LifecycleResult> {
    this.logger.warn("Notifications missed, triggering delta sync", { subscriptionId });

    if (!this.options.autoDeltaSync) {
      this.logger.info("Auto delta sync disabled, skipping");
      return {
        success: true,
        event: "missed",
        action: "ignored",
      };
    }

    try {
      await this.callbacks.onMissedNotifications(subscriptionId);

      this.logger.info("Delta sync triggered successfully", { subscriptionId });
      return {
        success: true,
        event: "missed",
        action: "delta_sync",
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to trigger delta sync", {
        subscriptionId,
        error: errorMsg,
      });

      return {
        success: false,
        event: "missed",
        action: "failed",
        error: errorMsg,
      };
    }
  }

  /**
   * Handle renewalRequired event
   * 
   * This is sent when subscription needs to be renewed soon
   */
  private async handleRenewalRequired(
    subscriptionId: string
  ): Promise<LifecycleResult> {
    this.logger.info("Subscription renewal required", { subscriptionId });

    if (this.callbacks.onRenewalRequired) {
      try {
        await this.callbacks.onRenewalRequired(subscriptionId);

        this.logger.info("Subscription renewed successfully", { subscriptionId });
        return {
          success: true,
          event: "renewalRequired",
          action: "renewed",
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error("Failed to renew subscription", {
          subscriptionId,
          error: errorMsg,
        });

        return {
          success: false,
          event: "renewalRequired",
          action: "failed",
          error: errorMsg,
        };
      }
    }

    // No renewal handler configured - subscription will be handled by auto-renewal
    return {
      success: true,
      event: "renewalRequired",
      action: "ignored",
    };
  }
}

/**
 * Create a lifecycle handler with default callbacks
 */
export function createLifecycleHandler(
  callbacks: Partial<LifecycleCallbacks> &
    Pick<LifecycleCallbacks, "onSubscriptionRemoved" | "onReauthorizationRequired" | "onMissedNotifications">,
  options?: LifecycleHandlerOptions
): LifecycleHandler {
  return new LifecycleHandler(
    {
      onRenewalRequired: callbacks.onRenewalRequired,
      onError: callbacks.onError,
      ...callbacks,
    },
    options
  );
}
