/**
 * Health file writer for external monitoring
 *
 * Writes a .health.json file after each sync cycle to enable
 * simple file-based health checks without parsing logs.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export type HealthStatus = "healthy" | "stale" | "error" | "stopped";

/** Computed metrics for monitoring dashboards */
export interface HealthMetrics {
  /** Duration of last sync in milliseconds */
  lastSyncDurationMs: number;
  /** Messages processed per second in last sync */
  messagesPerSecond: number;
  /** Error rate (0-1) over recent syncs */
  errorRate: number;
  /** Number of consecutive failures */
  consecutiveFailures: number;
}

/** Recent error entry for debugging */
export interface HealthRecentError {
  /** ISO 8601 timestamp when error occurred */
  timestamp: string;
  /** Error code (if available) */
  code: string;
  /** Error message */
  message: string;
}

export interface HealthFileData {
  /** ISO 8601 timestamp of when health was recorded */
  timestamp: string;
  /** Current health status */
  status: HealthStatus;
  /** Mailbox identifier */
  mailboxId: string;
  /** ISO 8601 timestamp of last successful sync, or null if never */
  lastSyncAt: string | null;
  /** Total number of events applied in last sync */
  eventsApplied: number;
  /** Total number of events skipped (already applied) in last sync */
  eventsSkipped: number;
  /** Duration of last sync in milliseconds (legacy, prefer metrics) */
  lastSyncDurationMs: number;
  /** Consecutive error count (legacy, prefer metrics) */
  consecutiveErrors: number;
  /** Total errors since start */
  totalErrors: number;
  /** Process ID of the writing process */
  pid: number;
  /** Optional error message if status is 'error' */
  error?: string;
  /** Computed metrics for monitoring */
  metrics: HealthMetrics;
  /** Recent errors for debugging (last 10) */
  recentErrors: HealthRecentError[];
}

export interface HealthWriterOptions {
  /** Root directory where .health.json will be written */
  rootDir: string;
  /** Mailbox identifier */
  mailboxId: string;
}

/**
 * Writes a health file to the filesystem for external monitoring
 *
 * The health file is a simple JSON file that external tools can read
 * to determine the current health status without parsing logs.
 *
 * @param rootDir - Root directory where .health.json will be written
 * @param data - Health data to write
 */
export async function writeHealthFile(
  rootDir: string,
  data: Omit<HealthFileData, "timestamp">,
): Promise<void> {
  const healthPath = join(rootDir, ".health.json");

  const healthData: HealthFileData = {
    ...data,
    timestamp: new Date().toISOString(),
  };

  await writeFile(healthPath, JSON.stringify(healthData, null, 2));
}

/**
 * Create a health writer bound to a specific root directory and mailbox
 *
 * Returns a function that can be called to update the health file
 * without repeating the rootDir and mailboxId parameters.
 */
export function createHealthWriter(options: HealthWriterOptions): {
  write: (data: Omit<HealthFileData, "timestamp" | "mailboxId">) => Promise<void>;
  markError: (error: Error | string) => Promise<void>;
  markSuccess: (
    eventsApplied: number,
    eventsSkipped: number,
    durationMs: number,
  ) => Promise<void>;
} {
  const { rootDir, mailboxId } = options;

  return {
    async write(data) {
      await writeHealthFile(rootDir, {
        ...data,
        mailboxId,
      });
    },

    async markError(error: Error | string, previousData?: Partial<HealthFileData>) {
      const errorMessage = error instanceof Error ? error.message : error;
      const errorCode = error instanceof Error
        ? (error as Error & { code?: string }).code || 'UNKNOWN_ERROR'
        : 'UNKNOWN_ERROR';
      
      const consecutiveFailures = (previousData?.metrics?.consecutiveFailures ?? 0) + 1;
      const totalErrors = (previousData?.totalErrors ?? 0) + 1;
      
      // Keep last 10 errors
      const recentErrors: HealthRecentError[] = [
        ...(previousData?.recentErrors ?? []).slice(-9),
        {
          timestamp: new Date().toISOString(),
          code: errorCode,
          message: errorMessage.slice(0, 500), // Limit length
        },
      ];

      await writeHealthFile(rootDir, {
        status: "error",
        mailboxId,
        lastSyncAt: previousData?.lastSyncAt ?? null,
        eventsApplied: 0,
        eventsSkipped: 0,
        lastSyncDurationMs: 0,
        consecutiveErrors: consecutiveFailures,
        totalErrors,
        pid: process.pid,
        error: errorMessage,
        metrics: {
          lastSyncDurationMs: previousData?.metrics?.lastSyncDurationMs ?? 0,
          messagesPerSecond: 0,
          errorRate: Math.min(1, consecutiveFailures / 10), // Simple rolling calculation
          consecutiveFailures,
        },
        recentErrors,
      });
    },

    async markSuccess(
      eventsApplied: number,
      eventsSkipped: number,
      durationMs: number,
      previousData?: Partial<HealthFileData>,
    ) {
      const totalEvents = eventsApplied + eventsSkipped;
      const messagesPerSecond = durationMs > 0
        ? (eventsApplied * 1000) / durationMs
        : 0;

      await writeHealthFile(rootDir, {
        status: "healthy",
        mailboxId,
        lastSyncAt: new Date().toISOString(),
        eventsApplied,
        eventsSkipped,
        lastSyncDurationMs: durationMs,
        consecutiveErrors: 0,
        totalErrors: previousData?.totalErrors ?? 0,
        pid: process.pid,
        metrics: {
          lastSyncDurationMs: durationMs,
          messagesPerSecond: Math.round(messagesPerSecond * 100) / 100,
          errorRate: 0,
          consecutiveFailures: 0,
        },
        recentErrors: previousData?.recentErrors ?? [],
      });
    },
  };
}
