/**
 * Health file writer for external monitoring
 *
 * Writes a .health.json file after each sync cycle to enable
 * simple file-based health checks without parsing logs.
 */

 import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type HealthStatus = "healthy" | "degraded" | "critical" | "auth_failed" | "stale" | "error" | "stopped";

export type CycleOutcome = "success" | "failure" | "auth_failure" | "stuck_recovery";

export interface HealthTransitionResult {
  status: HealthStatus;
  consecutiveFailures: number;
  message: string;
}

/**
 * Compute the next health state from a cycle outcome.
 *
 * Implements the unattended operation layer transition rules:
 * - success → healthy, consecutiveFailures = 0
 * - first failure → degraded, consecutiveFailures = 1
 * - third consecutive failure → critical
 * - auth failure → auth_failed
 * - stuck recovery → critical
 */
export function computeHealthTransition(
  _previousStatus: HealthStatus,
  previousConsecutiveFailures: number,
  outcome: CycleOutcome,
): HealthTransitionResult {
  if (outcome === "success") {
    return {
      status: "healthy",
      consecutiveFailures: 0,
      message: "Cycle completed successfully",
    };
  }

  if (outcome === "auth_failure") {
    return {
      status: "auth_failed",
      consecutiveFailures: previousConsecutiveFailures + 1,
      message: "Authentication failed — operator intervention required",
    };
  }

  if (outcome === "stuck_recovery") {
    return {
      status: "critical",
      consecutiveFailures: previousConsecutiveFailures,
      message: "Stuck cycle recovered — operator attention recommended",
    };
  }

  // outcome === "failure"
  const nextConsecutive = previousConsecutiveFailures + 1;
  if (nextConsecutive >= 3) {
    return {
      status: "critical",
      consecutiveFailures: nextConsecutive,
      message: `Cycle failed (${nextConsecutive} consecutive failures) — critical health`,
    };
  }
  return {
    status: "degraded",
    consecutiveFailures: nextConsecutive,
    message: `Cycle failed (${nextConsecutive} consecutive failures) — degraded health`,
  };
}

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

export interface StuckItemHealthEntry {
  classification: string;
  count: number;
}

/** Readiness snapshot for a single scope (mirrors daemon contract) */
export interface ScopeReadinessSnapshot {
  dispatchReady: boolean;
  outboundHealthy: boolean;
  workersRegistered: boolean;
  syncFresh: boolean;
}

/** Configured health thresholds (mirrors daemon contract) */
export interface HealthThresholds {
  maxStalenessMs: number;
  maxConsecutiveErrors: number;
}

export interface HealthFileData {
  /** ISO 8601 timestamp of when health was recorded */
  timestamp: string;
  /** Current health status */
  status: HealthStatus;
  /** Scope identifier */
  scopeId: string;
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
  /** Stuck-item counts for operational trust (detection only, no readiness semantics) */
  stuck_items?: {
    work_items: StuckItemHealthEntry[];
    outbound_handoffs: StuckItemHealthEntry[];
  };
  /** Readiness contract (Task 234) — aggregate across scopes when written by daemon */
  readiness?: {
    dispatchReady: boolean;
    outboundHealthy: boolean;
    workersRegistered: boolean;
    syncFresh: boolean;
  };
  /** Staleness indicator (Task 234) */
  isStale?: boolean;
  /** Configured thresholds (Task 234) */
  thresholds?: HealthThresholds;
  /** Charter runtime health (Task 284) */
  charterRuntimeHealth?: {
    class: string;
    checked_at: string;
    details: string;
  };
}

export interface HealthWriterOptions {
  /** Root directory where .health.json will be written */
  rootDir: string;
  /** Scope identifier */
  scopeId: string;
}

export interface LegacyHealthRecord {
  status: HealthStatus;
  consecutive_failures: number;
  total_errors: number;
  scope_id: string;
  last_sync_at: string | null;
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
 * without repeating the rootDir and scopeId parameters.
 */
export function createHealthWriter(options: HealthWriterOptions): {
  write: (data: Omit<HealthFileData, "timestamp" | "scopeId">) => Promise<void>;
  markError: (error: Error | string, previousData?: Partial<HealthFileData>) => Promise<void>;
  markSuccess: (
    eventsApplied: number,
    eventsSkipped: number,
    durationMs: number,
    previousData?: Partial<HealthFileData>,
  ) => Promise<void>;
} {
  const { rootDir, scopeId } = options;

  return {
    async write(data) {
      await writeHealthFile(rootDir, {
        ...data,
        scopeId,
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
        scopeId,
        lastSyncAt: previousData?.lastSyncAt ?? null,
        eventsApplied: 0,
        eventsSkipped: 0,
        lastSyncDurationMs: 0,
        consecutiveErrors: consecutiveFailures,
        totalErrors,
        pid: process.pid,
        error: errorMessage,
        stuck_items: previousData?.stuck_items,
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
      const messagesPerSecond = durationMs > 0
        ? (eventsApplied * 1000) / durationMs
        : 0;

      await writeHealthFile(rootDir, {
        status: "healthy",
        scopeId,
        lastSyncAt: new Date().toISOString(),
        eventsApplied,
        eventsSkipped,
        lastSyncDurationMs: durationMs,
        consecutiveErrors: 0,
        totalErrors: previousData?.totalErrors ?? 0,
        pid: process.pid,
        stuck_items: previousData?.stuck_items,
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

export class FileHealthStore {
  private readonly rootDir: string;
  private readonly scopeId: string;

  constructor(options: HealthWriterOptions) {
    this.rootDir = options.rootDir;
    this.scopeId = options.scopeId;
  }

  async recordSuccess(
    eventsApplied = 0,
    eventsSkipped = 0,
    durationMs = 0,
  ): Promise<void> {
    const previous = await this.readRaw().catch(() => null);
    const writer = createHealthWriter({
      rootDir: this.rootDir,
      scopeId: this.scopeId,
    });
    await writer.markSuccess(eventsApplied, eventsSkipped, durationMs, previous ?? undefined);
  }

  async recordError(error: Error | string): Promise<void> {
    const previous = await this.readRaw().catch(() => null);
    const writer = createHealthWriter({
      rootDir: this.rootDir,
      scopeId: this.scopeId,
    });
    await writer.markError(error, previous ?? undefined);
  }

  async read(): Promise<LegacyHealthRecord> {
    const raw = await this.readRaw();
    return {
      status: raw.status,
      consecutive_failures: raw.metrics.consecutiveFailures,
      total_errors: raw.totalErrors,
      scope_id: raw.scopeId,
      last_sync_at: raw.lastSyncAt,
    };
  }

  private async readRaw(): Promise<HealthFileData> {
    const content = await readFile(join(this.rootDir, ".health.json"), "utf8");
    return JSON.parse(content) as HealthFileData;
  }
}
