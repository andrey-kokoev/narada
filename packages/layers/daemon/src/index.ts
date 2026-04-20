#!/usr/bin/env node
/**
 * narada-daemon
 *
 * Long-running daemon for Narada synchronization.
 * Supports both polling and webhook-based real-time sync.
 */

import { fileURLToPath } from "node:url";
import { createSyncService } from "./service.js";

// Service exports
export {
  createSyncService,
  type SyncService,
  type SyncServiceConfig,
  type SyncStats,
} from "./service.js";

// Webhook server exports
export {
  createWebhookServer,
  createSimpleWebhookServer,
  type WebhookServer,
  type WebhookServerConfig,
  type WebhookCallbacks,
  type ParsedNotification,
} from "./webhook-server.js";

// Webhook validation exports
export {
  extractValidationToken,
  extractSignature,
  validateWebhookSignature,
  validateClientState,
  isAllowedTenant,
  sanitizeNotificationForLogging,
  generateClientState,
  WebhookRateLimiter,
  WebhookValidationError,
  validateNotification,
  type WebhookValidationConfig,
  type ValidationResult,
  type DetailedValidationResult,
} from "./webhook-validation.js";

// Notification handler exports
export {
  SyncOnNotification,
  BatchNotificationHandler,
  createNotificationHandler,
  type NotificationHandler,
  type SingleMessageSync,
  type NotificationResult,
  type NotificationHandlerOptions,
} from "./notification-handler.js";

// Lifecycle handler exports
export {
  LifecycleHandler,
  createLifecycleHandler,
  type LifecycleCallbacks,
  type LifecycleResult,
  type LifecycleHandlerOptions,
} from "./lifecycle-handler.js";

// Sync scheduler exports
export {
  DefaultHybridSyncScheduler,
  createHybridSyncScheduler,
  type HybridSyncScheduler,
  type SyncSchedulerConfig,
  type WebhookConfig,
  type SyncFunction,
  type DeltaSyncFunction,
  type SyncResult,
  type SchedulerStats,
  type SchedulerDependencies,
} from "./sync-scheduler.js";

// Library exports
export { createLogger, type Logger } from "./lib/logger.js";
export { PidFile, type PidFileOptions } from "./lib/pid-file.js";
export {
  HealthFile,
  type HealthStatus,
  type HealthFileOptions,
  type ScopeReadinessSnapshot,
  type HealthThresholds,
} from "./lib/health.js";

// Default export for library consumers
export { createSyncService as default } from "./service.js";

// ---------------------------------------------------------------------------
// CLI entrypoint (when invoked as the bin target)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let configPath = "./config.json";
  const fs = await import("node:fs");
  if (!fs.existsSync(configPath)) {
    const fallback = "./config/config.json";
    if (fs.existsSync(fallback)) {
      configPath = fallback;
    }
  }
  let verbose = false;
  let once = false;
  let pidFilePath: string | undefined;
  let observationApiPort: number | undefined;
  let observationApiHost: string | undefined;
  let maxStalenessMs: number | undefined;
  let maxConsecutiveErrors: number | undefined;
  let maxDrainMs: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-c" || arg === "--config") {
      configPath = args[++i] ?? configPath;
    } else if (arg === "-v" || arg === "--verbose") {
      verbose = true;
    } else if (arg === "--once") {
      once = true;
    } else if (arg === "--pid-file") {
      pidFilePath = args[++i] ?? pidFilePath;
    } else if (arg === "--observation-port") {
      const raw = args[++i];
      observationApiPort = raw ? Number(raw) : undefined;
    } else if (arg === "--observation-host") {
      observationApiHost = args[++i] ?? observationApiHost;
    } else if (arg === "--max-staleness-ms") {
      const raw = args[++i];
      maxStalenessMs = raw ? Number(raw) : undefined;
    } else if (arg === "--max-consecutive-errors") {
      const raw = args[++i];
      maxConsecutiveErrors = raw ? Number(raw) : undefined;
    } else if (arg === "--max-drain-ms") {
      const raw = args[++i];
      maxDrainMs = raw ? Number(raw) : undefined;
    } else if (arg === "-h" || arg === "--help") {
      console.log("Usage: narada-daemon [-c config.json] [-v] [--once] [--pid-file path] [--observation-port port] [--observation-host host] [--max-staleness-ms ms] [--max-consecutive-errors n] [--max-drain-ms ms]");
      process.exit(0);
    }
  }

  if (observationApiPort !== undefined && (!Number.isInteger(observationApiPort) || observationApiPort <= 0)) {
    throw new Error(`Invalid --observation-port: ${observationApiPort}`);
  }
  if (maxStalenessMs !== undefined && (Number.isNaN(maxStalenessMs) || maxStalenessMs <= 0)) {
    throw new Error(`Invalid --max-staleness-ms: ${maxStalenessMs}`);
  }
  if (maxConsecutiveErrors !== undefined && (Number.isNaN(maxConsecutiveErrors) || maxConsecutiveErrors <= 0)) {
    throw new Error(`Invalid --max-consecutive-errors: ${maxConsecutiveErrors}`);
  }
  if (maxDrainMs !== undefined && (Number.isNaN(maxDrainMs) || maxDrainMs <= 0)) {
    throw new Error(`Invalid --max-drain-ms: ${maxDrainMs}`);
  }

  if (verbose) {
    console.log(`Using config: ${configPath}`);
  }

  const service = await createSyncService({
    configPath,
    verbose,
    pidFilePath,
    observationApiPort,
    observationApiHost,
    maxStalenessMs,
    maxConsecutiveErrors,
    maxDrainMs,
  });

  let stopping = false;
  async function shutdown(signal: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    console.log(`Received ${signal}, shutting down...`);
    try {
      await service.stop();
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  if (once) {
    const result = await service.runOnce();
    if (result !== "success") {
      process.exit(result === "retryable" ? 75 : 1);
    }
    return;
  }

  await service.start();
}

if (import.meta.url.startsWith("file:")) {
  const modulePath = fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    main().catch((error) => {
      console.error("Daemon failed:", error);
      process.exit(1);
    });
  }
}
