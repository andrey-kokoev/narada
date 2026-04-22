/**
 * Windows Site variant — selected at runtime.
 */
export type WindowsSiteVariant = "native" | "wsl";

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
