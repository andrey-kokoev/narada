/**
 * Notification handler for processing Graph webhook notifications
 * 
 * Translates webhook notifications into sync operations:
 * - created: Fetch and store new message
 * - updated: Update existing message
 * - deleted: Create tombstone
 */

import type {
  GraphNotification,
  Notification,
  LifecycleNotification,
} from "@narada2/control-plane";
import {
  isChangeNotification,
  isLifecycleNotification,
  extractMessageId,
} from "@narada2/control-plane";
import type { ParsedNotification } from "./webhook-server.js";
import { createLogger, type Logger } from "./lib/logger.js";

/**
 * Result of processing a notification
 */
export interface NotificationResult {
  /** Whether processing was successful */
  success: boolean;
  
  /** Message ID that was processed */
  messageId?: string;
  
  /** Action taken */
  action: "created" | "updated" | "deleted" | "lifecycle" | "skipped" | "failed";
  
  /** Error message if failed */
  error?: string;
  
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Options for notification handler
 */
export interface NotificationHandlerOptions {
  /** Enable verbose logging */
  verbose?: boolean;
  
  /** Skip processing if message already exists (for created events) */
  skipExistingOnCreate?: boolean;
  
  /** Maximum time to wait for sync operation */
  syncTimeoutMs?: number;
}

/**
 * Interface for notification handlers
 */
export interface NotificationHandler {
  /**
   * Handle a notification
   */
  handle(notification: ParsedNotification): Promise<NotificationResult>;
}

/**
 * Interface for single message sync operations
 */
export interface SingleMessageSync {
  /**
   * Fetch a single message by ID
   */
  fetchMessage(id: string): Promise<unknown>;
  
  /**
   * Store a message
   */
  storeMessage(message: unknown): Promise<void>;
  
  /**
   * Update an existing message
   */
  updateMessage(message: unknown): Promise<void>;
  
  /**
   * Create tombstone for deleted message
   */
  tombstoneMessage(id: string): Promise<void>;
  
  /**
   * Check if message exists
   */
  messageExists(id: string): Promise<boolean>;
}

/**
 * Notification handler that triggers targeted sync operations
 */
export class SyncOnNotification implements NotificationHandler {
  private readonly sync: SingleMessageSync;
  private readonly options: NotificationHandlerOptions;
  private readonly logger: Logger;

  constructor(sync: SingleMessageSync, options: NotificationHandlerOptions = {}) {
    this.sync = sync;
    this.options = {
      skipExistingOnCreate: true,
      syncTimeoutMs: 30000,
      ...options,
    };
    this.logger = createLogger({ component: "notification-handler", verbose: options.verbose });
  }

  /**
   * Handle a notification
   */
  async handle(parsed: ParsedNotification): Promise<NotificationResult> {
    const startTime = Date.now();
    const { notification } = parsed;

    try {
      // Handle lifecycle notifications
      if (isLifecycleNotification(notification)) {
        return await this.handleLifecycle(notification, startTime);
      }

      // Handle change notifications
      if (isChangeNotification(notification)) {
        return await this.handleChange(notification, startTime);
      }

      // Unknown notification type
      return {
        success: false,
        action: "skipped",
        error: "Unknown notification type",
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to handle notification", {
        error: errorMsg,
        notification: this.sanitizeNotification(notification),
      });

      return {
        success: false,
        action: "failed",
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Handle a lifecycle notification
   */
  private async handleLifecycle(
    notification: LifecycleNotification,
    startTime: number
  ): Promise<NotificationResult> {
    this.logger.info("Received lifecycle notification", {
      event: notification.lifecycleEvent,
      subscriptionId: notification.subscriptionId,
    });

    // Lifecycle notifications don't directly sync messages
    // They're handled by the lifecycle handler separately
    return {
      success: true,
      action: "lifecycle",
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Handle a change notification
   */
  private async handleChange(
    notification: Notification,
    startTime: number
  ): Promise<NotificationResult> {
    const messageId = extractMessageId(notification.resource);

    if (!messageId) {
      return {
        success: false,
        action: "failed",
        error: `Could not extract message ID from resource: ${notification.resource}`,
        durationMs: Date.now() - startTime,
      };
    }

    this.logger.debug("Handling change notification", {
      changeType: notification.changeType,
      messageId,
      resource: notification.resource,
    });

    switch (notification.changeType) {
      case "created":
        return await this.handleCreated(messageId, startTime);
      case "updated":
        return await this.handleUpdated(messageId, startTime);
      case "deleted":
        return await this.handleDeleted(messageId, startTime);
      default:
        return {
          success: false,
          action: "failed",
          messageId,
          error: `Unknown change type: ${notification.changeType}`,
          durationMs: Date.now() - startTime,
        };
    }
  }

  /**
   * Handle message creation
   */
  private async handleCreated(
    messageId: string,
    startTime: number
  ): Promise<NotificationResult> {
    // Check if already exists
    if (this.options.skipExistingOnCreate) {
      const exists = await this.sync.messageExists(messageId);
      if (exists) {
        this.logger.debug("Message already exists, skipping creation", { messageId });
        return {
          success: true,
          action: "skipped",
          messageId,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // Fetch and store the new message
    try {
      const message = await this.sync.fetchMessage(messageId);
      await this.sync.storeMessage(message);

      this.logger.debug("Message created successfully", { messageId });
      return {
        success: true,
        action: "created",
        messageId,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to create message", { messageId, error: errorMsg });
      return {
        success: false,
        action: "failed",
        messageId,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Handle message update
   */
  private async handleUpdated(
    messageId: string,
    startTime: number
  ): Promise<NotificationResult> {
    try {
      // Fetch the updated message
      const message = await this.sync.fetchMessage(messageId);
      await this.sync.updateMessage(message);

      this.logger.debug("Message updated successfully", { messageId });
      return {
        success: true,
        action: "updated",
        messageId,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to update message", { messageId, error: errorMsg });
      return {
        success: false,
        action: "failed",
        messageId,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Handle message deletion
   */
  private async handleDeleted(
    messageId: string,
    startTime: number
  ): Promise<NotificationResult> {
    try {
      await this.sync.tombstoneMessage(messageId);

      this.logger.debug("Message deleted successfully", { messageId });
      return {
        success: true,
        action: "deleted",
        messageId,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to delete message", { messageId, error: errorMsg });
      return {
        success: false,
        action: "failed",
        messageId,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Sanitize notification for logging
   */
  private sanitizeNotification(notification: GraphNotification): Record<string, unknown> {
    return {
      subscriptionId: (notification as { subscriptionId?: string }).subscriptionId,
      changeType: (notification as { changeType?: string }).changeType,
      lifecycleEvent: (notification as { lifecycleEvent?: string }).lifecycleEvent,
      resource: (notification as { resource?: string }).resource,
      // Exclude clientState and other sensitive data
    };
  }
}

/**
 * Batch notification handler for processing multiple notifications efficiently
 */
export class BatchNotificationHandler implements NotificationHandler {
  private readonly handler: NotificationHandler;
  private readonly options: {
    batchWindowMs: number;
    maxBatchSize: number;
    verbose?: boolean;
  };
  private readonly logger: Logger;
  private pending: ParsedNotification[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(
    handler: NotificationHandler,
    options: {
      batchWindowMs?: number;
      maxBatchSize?: number;
      verbose?: boolean;
    } = {}
  ) {
    this.handler = handler;
    this.options = {
      batchWindowMs: options.batchWindowMs ?? 1000,
      maxBatchSize: options.maxBatchSize ?? 10,
      verbose: options.verbose,
    };
    this.logger = createLogger({
      component: "batch-notification-handler",
      verbose: options.verbose,
    });
  }

  /**
   * Handle a notification (may be batched)
   */
  async handle(notification: ParsedNotification): Promise<NotificationResult> {
    // Add to pending batch
    this.pending.push(notification);

    // If batch is full, process immediately
    if (this.pending.length >= this.options.maxBatchSize) {
      await this.flush();
      return { success: true, action: "skipped", durationMs: 0 };
    }

    // Otherwise, schedule batch processing
    this.scheduleBatch();

    // Return pending result
    return { success: true, action: "skipped", durationMs: 0 };
  }

  /**
   * Schedule batch processing
   */
  private scheduleBatch(): void {
    if (this.batchTimer) {
      return; // Already scheduled
    }

    this.batchTimer = setTimeout(() => {
      this.flush().catch((error) => {
        this.logger.error("Batch flush failed", error);
      });
    }, this.options.batchWindowMs);
  }

  /**
   * Process all pending notifications
   */
  async flush(): Promise<NotificationResult[]> {
    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Get pending notifications
    const batch = this.pending;
    this.pending = [];

    if (batch.length === 0) {
      return [];
    }

    this.logger.debug("Processing notification batch", { size: batch.length });

    // Process all notifications
    const results: NotificationResult[] = [];
    for (const notification of batch) {
      try {
        const result = await this.handler.handle(notification);
        results.push(result);
      } catch (error) {
        this.logger.error("Notification handler error", error);
        results.push({
          success: false,
          action: "failed",
          error: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        });
      }
    }

    this.logger.debug("Batch processing complete", {
      processed: results.length,
      successful: results.filter((r) => r.success).length,
    });

    return results;
  }

  /**
   * Get number of pending notifications
   */
  getPendingCount(): number {
    return this.pending.length;
  }

  /**
   * Stop batching and flush remaining notifications
   */
  async stop(): Promise<void> {
    await this.flush();
  }
}

/**
 * Create a notification handler with batching support
 */
export function createNotificationHandler(
  sync: SingleMessageSync,
  options: NotificationHandlerOptions & {
    enableBatching?: boolean;
    batchWindowMs?: number;
    maxBatchSize?: number;
  } = {}
): NotificationHandler {
  const baseHandler = new SyncOnNotification(sync, options);

  if (options.enableBatching) {
    return new BatchNotificationHandler(baseHandler, {
      batchWindowMs: options.batchWindowMs,
      maxBatchSize: options.maxBatchSize,
      verbose: options.verbose,
    });
  }

  return baseHandler;
}
