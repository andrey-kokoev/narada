/**
 * Windows Site variant — selected at runtime.
 */
export type WindowsSiteVariant = "native" | "wsl";

/**
 * All Site variants known to the registry, including remote substrates.
 */
export type SiteVariant = WindowsSiteVariant | "cloudflare" | "linux-user" | "linux-system";

/**
 * Windows authority locus represented by a Site.
 *
 * This is intentionally separate from `WindowsSiteVariant`:
 * - `variant` answers where/how the Cycle runs (`native` vs `wsl`).
 * - `authority_locus` answers which Windows authority grammar the Site represents.
 */
export type WindowsAuthorityLocus = "user" | "pc";

/**
 * A user-locus Windows Site owns profile-local state and operator context.
 *
 * Examples: user credentials, shell/app preferences, operator KB, task governance,
 * per-user tool policy, and user-scoped evidence.
 */
export interface WindowsUserSiteLocus {
  authority_locus: "user";
  principal: {
    /** Windows profile root, for example `C:\\Users\\Andrey`. */
    windows_user_profile: string;
    /** Windows account/user name as observed by the substrate. */
    username: string;
  };
}

/**
 * A PC-locus Windows Site owns machine/session state.
 *
 * Examples: display topology, drivers, services, scheduled tasks, machine-level
 * diagnostics, and recovery actions that may affect the whole PC.
 */
export interface WindowsPcSiteLocus {
  authority_locus: "pc";
  machine: {
    /** Windows hostname, for example `DESKTOP-SUNROOM-2`. */
    hostname: string;
  };
  /**
   * Whether this PC Site is still stored under a user profile or has moved to
   * a mature machine-owned root such as ProgramData.
   */
  root_posture: "user_owned_pc_site_prototype" | "machine_owned";
}

export type WindowsSiteLocus = WindowsUserSiteLocus | WindowsPcSiteLocus;

export type WindowsUserSiteSyncPosture =
  | "local_only"
  | "cloud_synced_folder"
  | "git_backed"
  | "hybrid"
  | "hybrid_capable_plain_folder";

export interface WindowsUserSiteSyncConfig {
  posture: WindowsUserSiteSyncPosture;
  git_initialized?: boolean;
  cloud_sync?: "external_if_configured" | "none" | "unknown";
  durable_paths?: string[];
  volatile_paths?: string[];
}

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
  /**
   * Optional authority-locus descriptor.
   *
   * Omitted legacy configs are interpreted as user-locus native/WSL Sites only
   * for compatibility. New configs should set this explicitly when the Site is
   * intended to model either a Windows user profile or a PC/machine locus.
   */
  locus?: WindowsSiteLocus;
  sync?: WindowsUserSiteSyncConfig;
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
