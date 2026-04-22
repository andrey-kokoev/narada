/**
 * Windows Site variant — selected at runtime.
 */
export type WindowsSiteVariant = "native" | "wsl";

/**
 * Live source configuration for a Windows Site.
 *
 * Only `graph` is supported in v0. The source is bounded by
 * `folder_id` and `limit` to prevent unbounded inbox sweeps.
 *
 * For Task 403 (one controlled thread), provide `conversation_id`
 * to narrow admission to a single thread. Without it, the sync
 * reads the entire folder up to `limit`.
 */
export interface WindowsLiveGraphSourceConfig {
  type: "graph";
  /** Graph user / mailbox identity */
  user_id: string;
  /** Folder to sync (e.g. "inbox") */
  folder_id: string;
  /** OAuth tenant ID */
  tenant_id: string;
  /** OAuth client ID */
  client_id: string;
  /** OAuth client secret */
  client_secret: string;
  /** Graph API base URL (default: https://graph.microsoft.com/v1.0) */
  base_url?: string;
  /** Max messages per pull (default: 50) */
  limit?: number;
  /** If set, only admit facts whose payload carries this conversation_id */
  conversation_id?: string;
}

export type WindowsLiveSourceConfig = WindowsLiveGraphSourceConfig;

/**
 * Resolved site configuration.
 */
export interface WindowsSiteConfig {
  site_id: string;
  variant: WindowsSiteVariant;
  site_root: string;
  config_path: string;
  cycle_interval_minutes: number;
  lock_ttl_ms: number;
  ceiling_ms: number;
  /**
   * Live source config. Required for live mode (`mode: 'live'`).
   *
   * The runner does NOT silently fall back to fixture sync when live
   * mode is requested but this field is missing. Fixture/test mode
   * must be explicitly requested with `mode: 'fixture'`.
   */
  live_source?: WindowsLiveSourceConfig;
  /**
   * Campaign request sender allowlist. When present, the derive-work
   * step uses real campaign context formation instead of fixture grouping.
   */
  campaign_request_senders?: string[];
  /**
   * Campaign request lookback window in days (default: 7).
   */
  campaign_request_lookback_days?: number;
}

/**
 * Cycle outcome for health transitions.
 */
export type WindowsCycleOutcome = "success" | "failure" | "auth_failure" | "stuck_recovery";

/**
 * Result of one bounded Cycle.
 */
export interface WindowsCycleResult {
  cycle_id: string;
  site_id: string;
  started_at: string;
  finished_at: string;
  status: "complete" | "partial" | "failed";
  steps_completed: number[];
  error?: string;
}

/**
 * Health record stored in SQLite.
 */
export interface SiteHealthRecord {
  site_id: string;
  status: "healthy" | "degraded" | "critical" | "auth_failed" | "stale" | "error" | "stopped";
  last_cycle_at: string | null;
  last_cycle_duration_ms: number | null;
  consecutive_failures: number;
  message: string;
  updated_at: string;
}

/**
 * Trace record stored in SQLite.
 */
export interface CycleTraceRecord {
  cycle_id: string;
  site_id: string;
  started_at: string;
  finished_at: string;
  status: WindowsCycleResult["status"];
  steps_completed: number[];
  error: string | null;
}
