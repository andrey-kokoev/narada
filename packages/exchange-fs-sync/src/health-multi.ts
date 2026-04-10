/**
 * Multi-mailbox health tracking
 * 
 * Tracks per-mailbox health status and aggregates health for all mailboxes.
 */

import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MultiMailboxConfig } from "./config/multi-mailbox.js";

/** Status of a mailbox */
export type MailboxStatus = "healthy" | "stale" | "error" | "syncing" | "unknown";

/** Per-mailbox health information */
export interface MailboxHealth {
  /** Mailbox ID */
  mailboxId: string;
  /** Current status */
  status: MailboxStatus;
  /** Last sync timestamp (ISO 8601) */
  lastSync: string | null;
  /** Last successful sync timestamp */
  lastSuccess: string | null;
  /** Number of consecutive failures */
  consecutiveFailures: number;
  /** Total messages synced */
  messagesTotal: number;
  /** Duration of last sync in ms */
  lastSyncDurationMs: number;
  /** Error message if status is error */
  error?: string;
  /** Process ID of sync process */
  pid: number;
}

/** Global health metrics */
export interface GlobalHealthMetrics {
  /** Timestamp of health check */
  timestamp: string;
  /** Total number of mailboxes */
  totalMailboxes: number;
  /** Number of healthy mailboxes */
  healthyCount: number;
  /** Number of stale mailboxes */
  staleCount: number;
  /** Number of mailboxes in error state */
  errorCount: number;
  /** Number of mailboxes currently syncing */
  syncingCount: number;
  /** Total messages across all mailboxes */
  totalMessages: number;
  /** Overall system status */
  overallStatus: "healthy" | "degraded" | "critical" | "unknown";
}

/** Complete multi-mailbox health data */
export interface MultiMailboxHealth {
  /** Global aggregate metrics */
  global: GlobalHealthMetrics;
  /** Per-mailbox health map */
  mailboxes: Map<string, MailboxHealth>;
  /** Version of health file format */
  version: number;
}

/** Result of a single mailbox sync */
export interface MailboxSyncResult {
  /** Mailbox ID */
  mailboxId: string;
  /** Whether sync succeeded */
  success: boolean;
  /** Duration in milliseconds */
  durationMs: number;
  /** Number of messages synced */
  messagesSynced: number;
  /** Error if sync failed */
  error?: Error;
  /** Events applied */
  eventsApplied?: number;
  /** Events skipped */
  eventsSkipped?: number;
}

/** Multi-health file format (JSON-serializable) */
interface MultiHealthFileData {
  version: number;
  timestamp: string;
  global: GlobalHealthMetrics;
  mailboxes: Record<string, MailboxHealth>;
}

/** Default health for a new mailbox */
function createDefaultMailboxHealth(mailboxId: string): MailboxHealth {
  return {
    mailboxId,
    status: "unknown",
    lastSync: null,
    lastSuccess: null,
    consecutiveFailures: 0,
    messagesTotal: 0,
    lastSyncDurationMs: 0,
    pid: process.pid,
  };
}

/** Determine mailbox status from sync result and history */
function determineStatus(
  result: MailboxSyncResult,
  previousHealth: MailboxHealth | undefined,
): MailboxStatus {
  if (!result) return previousHealth?.status ?? "unknown";

  if (result.success) {
    return "healthy";
  } else {
    const failures = (previousHealth?.consecutiveFailures ?? 0) + 1;
    // Degrade to error after 3 consecutive failures
    return failures >= 3 ? "error" : "stale";
  }
}

/** Calculate overall system status */
function calculateOverallStatus(
  mailboxes: Map<string, MailboxHealth>,
): GlobalHealthMetrics["overallStatus"] {
  if (mailboxes.size === 0) return "unknown";

  const counts = {
    healthy: 0,
    stale: 0,
    error: 0,
    syncing: 0,
    unknown: 0,
  };

  for (const health of mailboxes.values()) {
    counts[health.status]++;
  }

  const errorRatio = counts.error / mailboxes.size;
  const healthyRatio = counts.healthy / mailboxes.size;

  if (errorRatio > 0.5) return "critical";
  if (errorRatio > 0 || counts.stale > counts.healthy) return "degraded";
  if (healthyRatio > 0.8) return "healthy";
  return "degraded";
}

/** Update mailbox health from sync result */
function updateMailboxHealth(
  previous: MailboxHealth | undefined,
  result: MailboxSyncResult,
): MailboxHealth {
  const base = previous ?? createDefaultMailboxHealth(result.mailboxId);
  const now = new Date().toISOString();

  if (result.success) {
    return {
      ...base,
      mailboxId: result.mailboxId,
      status: "healthy",
      lastSync: now,
      lastSuccess: now,
      consecutiveFailures: 0,
      messagesTotal: base.messagesTotal + result.messagesSynced,
      lastSyncDurationMs: result.durationMs,
      pid: process.pid,
    };
  } else {
    const consecutiveFailures = base.consecutiveFailures + 1;
    return {
      ...base,
      mailboxId: result.mailboxId,
      status: consecutiveFailures >= 3 ? "error" : "stale",
      lastSync: now,
      consecutiveFailures,
      lastSyncDurationMs: result.durationMs,
      error: result.error?.message,
      pid: process.pid,
    };
  }
}

/** Build global metrics from mailbox health map */
function buildGlobalMetrics(
  mailboxes: Map<string, MailboxHealth>,
): GlobalHealthMetrics {
  const counts = {
    healthy: 0,
    stale: 0,
    error: 0,
    syncing: 0,
    unknown: 0,
  };

  let totalMessages = 0;

  for (const health of mailboxes.values()) {
    counts[health.status]++;
    totalMessages += health.messagesTotal;
  }

  return {
    timestamp: new Date().toISOString(),
    totalMailboxes: mailboxes.size,
    healthyCount: counts.healthy,
    staleCount: counts.stale,
    errorCount: counts.error,
    syncingCount: counts.syncing,
    totalMessages,
    overallStatus: calculateOverallStatus(mailboxes),
  };
}

/** Convert health map to file format */
function healthToFileData(
  mailboxes: Map<string, MailboxHealth>,
  version: number,
): MultiHealthFileData {
  const mailboxesRecord: Record<string, MailboxHealth> = {};
  for (const [id, health] of mailboxes) {
    mailboxesRecord[id] = health;
  }

  return {
    version,
    timestamp: new Date().toISOString(),
    global: buildGlobalMetrics(mailboxes),
    mailboxes: mailboxesRecord,
  };
}

/** Convert file format to health map */
function fileDataToHealth(data: MultiHealthFileData): MultiMailboxHealth {
  const mailboxes = new Map<string, MailboxHealth>();
  for (const [id, health] of Object.entries(data.mailboxes)) {
    mailboxes.set(id, health);
  }

  return {
    version: data.version,
    global: data.global,
    mailboxes,
  };
}

/**
 * Write multi-mailbox health file
 * 
 * @param config - Multi-mailbox configuration
 * @param results - Results from sync operations
 * @param options - Options for health file location
 */
export async function writeMultiMailboxHealth(
  config: MultiMailboxConfig,
  results: MailboxSyncResult[],
  options?: {
    /** Custom health file path (defaults to first mailbox root_dir/.multi-health.json) */
    healthFilePath?: string;
  },
): Promise<void> {
  // Determine health file path
  let healthPath: string;
  if (options?.healthFilePath) {
    healthPath = options.healthFilePath;
  } else if (config.mailboxes.length > 0) {
    healthPath = join(config.mailboxes[0].root_dir, ".multi-health.json");
  } else {
    throw new Error("No mailboxes configured and no health file path specified");
  }

  // Try to load existing health
  let existingHealth: MultiMailboxHealth | undefined;
  try {
    existingHealth = await readMultiMailboxHealth(healthPath);
  } catch {
    // No existing health file, start fresh
  }

  // Build updated health map
  const mailboxes = new Map(existingHealth?.mailboxes ?? []);

  // Update with new results
  for (const result of results) {
    const previous = mailboxes.get(result.mailboxId);
    const updated = updateMailboxHealth(previous, result);
    mailboxes.set(result.mailboxId, updated);
  }

  // Ensure all configured mailboxes have an entry
  for (const mailbox of config.mailboxes) {
    if (!mailboxes.has(mailbox.id)) {
      mailboxes.set(mailbox.id, createDefaultMailboxHealth(mailbox.id));
    }
  }

  // Write health file
  const fileData = healthToFileData(mailboxes, 1);
  await writeFile(healthPath, JSON.stringify(fileData, null, 2));
}

/**
 * Read multi-mailbox health file
 */
export async function readMultiMailboxHealth(
  healthFilePath: string,
): Promise<MultiMailboxHealth> {
  const raw = await readFile(healthFilePath, "utf8");
  const data = JSON.parse(raw) as MultiHealthFileData;
  return fileDataToHealth(data);
}

/**
 * Update health for a mailbox that's starting sync
 */
export async function markMailboxSyncing(
  healthFilePath: string,
  mailboxId: string,
): Promise<void> {
  let health: MultiMailboxHealth;
  try {
    health = await readMultiMailboxHealth(healthFilePath);
  } catch {
    health = {
      version: 1,
      global: {
        timestamp: new Date().toISOString(),
        totalMailboxes: 0,
        healthyCount: 0,
        staleCount: 0,
        errorCount: 0,
        syncingCount: 0,
        totalMessages: 0,
        overallStatus: "unknown",
      },
      mailboxes: new Map(),
    };
  }

  const existing = health.mailboxes.get(mailboxId);
  health.mailboxes.set(mailboxId, {
    ...(existing ?? createDefaultMailboxHealth(mailboxId)),
    status: "syncing",
    pid: process.pid,
  });

  const fileData = healthToFileData(health.mailboxes, health.version);
  await writeFile(healthFilePath, JSON.stringify(fileData, null, 2));
}

/**
 * Create a health summary for display
 */
export function formatHealthSummary(health: MultiMailboxHealth): string {
  const lines: string[] = [];
  
  lines.push(`Overall Status: ${health.global.overallStatus.toUpperCase()}`);
  lines.push(`Total Mailboxes: ${health.global.totalMailboxes}`);
  lines.push(`  Healthy: ${health.global.healthyCount}`);
  lines.push(`  Stale: ${health.global.staleCount}`);
  lines.push(`  Error: ${health.global.errorCount}`);
  lines.push(`  Syncing: ${health.global.syncingCount}`);
  lines.push(`Total Messages: ${health.global.totalMessages.toLocaleString()}`);
  lines.push("");
  
  lines.push("Per-Mailbox Status:");
  for (const [id, mailbox] of health.mailboxes) {
    const lastSync = mailbox.lastSync
      ? new Date(mailbox.lastSync).toLocaleString()
      : "never";
    lines.push(`  ${id}: ${mailbox.status} (last: ${lastSync})`);
    if (mailbox.error) {
      lines.push(`    Error: ${mailbox.error.slice(0, 100)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format health as a table for CLI display
 */
export function formatHealthTable(health: MultiMailboxHealth): string {
  const headers = ["Mailbox", "Status", "Last Sync", "Messages", "Failures"];
  const rows: string[][] = [];

  for (const [id, mailbox] of health.mailboxes) {
    const lastSync = mailbox.lastSync
      ? formatTimeAgo(new Date(mailbox.lastSync))
      : "never";
    
    rows.push([
      id,
      mailbox.status,
      lastSync,
      mailbox.messagesTotal.toLocaleString(),
      mailbox.consecutiveFailures.toString(),
    ]);
  }

  return renderTable(headers, rows);
}

/** Format a date as time ago (e.g., "2 min ago") */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  if (diffHour > 0) return `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`;
  if (diffMin > 0) return `${diffMin} min${diffMin > 1 ? "s" : ""} ago`;
  return "just now";
}

/** Simple table rendering for CLI */
function renderTable(headers: string[], rows: string[][]): string {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rows.map(r => r[i]?.length ?? 0), 0);
    return Math.max(h.length, maxDataWidth) + 2;
  });

  const lines: string[] = [];

  // Top border
  lines.push("┌" + widths.map(w => "─".repeat(w)).join("┬") + "┐");

  // Header row
  lines.push("│" + headers.map((h, i) => ` ${h.padEnd(widths[i]! - 1)}`).join("│") + "│");

  // Separator
  lines.push("├" + widths.map(w => "─".repeat(w)).join("┼") + "┤");

  // Data rows
  for (const row of rows) {
    lines.push("│" + row.map((cell, i) => ` ${cell.padEnd(widths[i]! - 1)}`).join("│") + "│");
  }

  // Bottom border
  lines.push("└" + widths.map(w => "─".repeat(w)).join("┴") + "┘");

  return lines.join("\n");
}
